/**
 * VaultClient: runs the C++ vault as a child process and talks to it over
 * authenticated frames on stdin/stdout.
 *
 * Privilege separation: this process authenticates users; the vault holds the
 * keys and decides access. The master key is read by the vault itself from its
 * key file — it never passes through Node. Each spawn gets a fresh random
 * session key (sent once over the private stdin pipe), so frames from one run
 * are useless in the next. On any protocol violation, crash or timeout the
 * child is killed, in-flight requests fail, and the next request respawns it.
 */
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { decode, encode } from './codec.js';
import { FrameReader, deriveChannelKeys, sealFrame } from './frame.js';
import type { ChannelKeys } from './frame.js';
import { Err, Frame } from './protocol.gen.js';
import type { ActorMsg, ArgMsg, Cmd, CtxMsg } from './protocol.gen.js';

export type VaultOptions = {
  /** The vault: a WebAssembly module (`.wasm`, run by `host` under Node) or a native executable. */
  bin: string;
  /** native/vault/wasi-host.mjs — required when `bin` is a `.wasm` module. */
  host?: string;
  dataDir: string;
  keyFile: string;
  /** Development only: auto-verify providers and create a key file if missing. */
  dev: boolean;
  timeoutMs?: number;
};

export type VaultReply = { status: number; error: string; result?: Uint8Array };

export class VaultUnavailableError extends Error {
  override name = 'VaultUnavailableError';
}

type Pending = {
  requestId: number;
  resolve: (reply: VaultReply) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

const BOOTSTRAP_MAGIC = Buffer.from('DOSELY-VAULT-KEY', 'ascii');

export class VaultClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private keys: ChannelKeys | null = null;
  private reader: FrameReader | null = null;
  private txSeq = 1n;
  private nextRequestId = 1;
  private pending: Pending[] = [];
  private lastError = '';
  /** Settles when the most recent child has exited (never two vaults at once). */
  private exited: Promise<void> = Promise.resolve();
  private starting: Promise<void> | null = null;

  constructor(private readonly opts: VaultOptions) {}

  /** Is the vault binary present? (The rest of the API works without it.) */
  available(): boolean {
    return existsSync(this.opts.bin);
  }

  async request(command: Cmd, actor: ActorMsg, args: ArgMsg = {}, context?: CtxMsg): Promise<VaultReply> {
    await this.ensureRunning();
    if (!this.child || !this.keys) throw new VaultUnavailableError('vault stopped while starting');
    const requestId = this.nextRequestId++;
    const payload = encode('Req', { RequestId: requestId, Command: command, Actor: actor, Args: args, Context: context });
    return new Promise<VaultReply>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new VaultUnavailableError('vault timed out')), this.opts.timeoutMs ?? 10_000);
      this.pending.push({ requestId, resolve, reject, timer });
      const frame = sealFrame(this.keys!.clientToServer, Frame.KIND_REQUEST, this.txSeq++, Date.now(), payload);
      this.child!.stdin.write(frame);
    });
  }

  /** Stop the vault (it exits cleanly when stdin closes); resolves once it has. */
  close(): Promise<void> {
    const exited = this.exited;
    this.fail(new VaultUnavailableError('vault closed'));
    return exited;
  }

  private async ensureRunning(): Promise<void> {
    if (this.child) return;
    this.starting ??= this.start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async start(): Promise<void> {
    if (!this.available()) throw new VaultUnavailableError('the care network vault is not built on this server');
    // The vault also refuses to share its data directory; waiting here avoids that race.
    await this.exited;
    this.ensureKeyFile();

    const args = ['--data', this.opts.dataDir, '--key-file', this.opts.keyFile];
    if (this.opts.dev) args.push('--dev-auto-verify');
    const [command, argv] = this.launch(args);
    const child = spawn(command, argv, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    const sessionKey = randomBytes(32);
    this.keys = deriveChannelKeys(sessionKey);
    this.reader = new FrameReader(this.keys.serverToClient, Frame.KIND_RESPONSE);
    this.txSeq = 1n;
    this.child = child;
    this.exited = new Promise((resolve) => {
      child.once('exit', () => resolve());
      child.once('error', () => resolve());
    });

    child.stdin.write(Buffer.concat([BOOTSTRAP_MAGIC, sessionKey]));
    sessionKey.fill(0);

    child.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (!text) return;
      this.lastError = text.split('\n').pop() ?? text;
      console.log(`[vault] ${text}`);
    });
    child.on('error', (err) => this.fail(new VaultUnavailableError(`vault failed to start: ${err.message}`)));
    child.on('exit', (code) => {
      if (this.child === child) {
        this.fail(new VaultUnavailableError(`vault exited (${code ?? 'signal'})${this.lastError ? `: ${this.lastError}` : ''}`));
      }
    });
    child.stdin.on('error', () => this.fail(new VaultUnavailableError('vault pipe closed')));
  }

  /**
   * How to start the vault. A WebAssembly build runs inside a separate Node
   * process (node is already a trusted program, so allow-listing such as Smart
   * App Control has nothing new to judge); a native build runs directly.
   */
  private launch(args: string[]): [string, string[]] {
    if (!this.opts.bin.endsWith('.wasm')) return [this.opts.bin, args];
    if (!this.opts.host) throw new VaultUnavailableError('a WebAssembly vault needs its host script (wasi-host.mjs)');
    return [process.execPath, ['--no-warnings', this.opts.host, this.opts.bin, ...args]];
  }

  private ensureKeyFile(): void {
    mkdirSync(this.opts.dataDir, { recursive: true });
    if (existsSync(this.opts.keyFile)) return;
    if (!this.opts.dev) {
      throw new VaultUnavailableError('VAULT_KEY_FILE is missing; create one with dosely-vault --init-key-file');
    }
    mkdirSync(dirname(this.opts.keyFile), { recursive: true });
    const r = spawnSync(...this.launch(['--init-key-file', this.opts.keyFile]), { windowsHide: true });
    if (r.status !== 0) throw new VaultUnavailableError('could not create a development vault key');
  }

  private onData(chunk: Buffer): void {
    let payloads: Buffer[];
    try {
      payloads = this.reader!.push(chunk);
    } catch (err) {
      this.fail(new VaultUnavailableError(`vault channel violation: ${(err as Error).message}`));
      return;
    }
    for (const payload of payloads) {
      const next = this.pending.shift();
      let resp;
      try {
        resp = decode('Resp', payload);
      } catch {
        resp = null;
      }
      // Responses arrive strictly in request order; anything else is a desync.
      if (!next || !resp || resp.RequestId !== next.requestId) {
        if (next) this.pending.unshift(next);
        this.fail(new VaultUnavailableError('vault response out of order'));
        return;
      }
      clearTimeout(next.timer);
      next.resolve({ status: resp.Status ?? Err.INTERNAL, error: resp.Error ?? '', result: resp.Result });
    }
  }

  /** Tear down the child and fail everything in flight. */
  private fail(err: Error): void {
    const child = this.child;
    this.child = null;
    this.keys = null;
    this.reader = null;
    const pending = this.pending;
    this.pending = [];
    for (const p of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    if (child) {
      child.stdin.end();
      if (child.exitCode === null) setTimeout(() => child.exitCode === null && child.kill(), 2000).unref();
    }
  }
}
