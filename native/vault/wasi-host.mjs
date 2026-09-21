#!/usr/bin/env node
/**
 * Runs a Dosely Vault WebAssembly module (dosely-vault.wasm or vault-tests.wasm)
 * under Node's WASI.
 *
 *   node wasi-host.mjs <module.wasm> [vault args…]
 *   node wasi-host.mjs <module.wasm> --root <dir> [test args…]    (<dir> becomes "/")
 *
 * Why WebAssembly: allow-listing such as Windows Smart App Control judges native
 * programs by signature and reputation, so every freshly compiled, unsigned
 * binary can be blocked. node.exe is already trusted, and WebAssembly is code it
 * runs, not a program Windows has to approve. The process boundary is unchanged:
 * this host runs in its own Node process, spawned by the API server exactly
 * like the native vault, and the keys never leave it.
 *
 * Host paths are mapped into the sandbox: the data directory becomes /data and
 * the key file's directory /keys. WASI has no file locks, so this host holds
 * <data>/vault.lock for the vault's lifetime.
 */
import { closeSync, constants, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { WASI } from 'node:wasi';

const [modulePath, ...rest] = process.argv.slice(2);
if (!modulePath) {
  console.error('usage: node wasi-host.mjs <module.wasm> [args…]');
  process.exit(64);
}

const preopens = {};
const env = {};
const guestArgs = [basename(modulePath)];
let lockDir = null;

for (let i = 0; i < rest.length; i++) {
  const arg = rest[i];
  const value = () => {
    const v = rest[++i];
    if (v === undefined) {
      console.error(`dosely-vault: ${arg} needs a value`);
      process.exit(64);
    }
    return resolve(v);
  };
  if (arg === '--root') {
    const dir = value();
    mkdirSync(dir, { recursive: true });
    preopens['/'] = dir;
  } else if (arg === '--data') {
    const dir = value();
    mkdirSync(dir, { recursive: true });
    preopens['/data'] = dir;
    guestArgs.push('--data', '/data');
    lockDir = dir;
  } else if (arg === '--key-file' || arg === '--init-key-file') {
    const file = value();
    mkdirSync(dirname(file), { recursive: true });
    preopens['/keys'] = dirname(file);
    guestArgs.push(arg, `/keys/${basename(file)}`);
  } else if (arg === '--passphrase-env') {
    const name = rest[++i] ?? '';
    if (process.env[name] !== undefined) env[name] = process.env[name];
    guestArgs.push(arg, name);
  } else {
    guestArgs.push(arg);
  }
}

/** Exclusive for this process's lifetime; the OS releases it if the process dies. */
function lockDataDir(dir) {
  const file = resolve(dir, 'vault.lock');
  const busy = () => {
    console.error('dosely-vault: vault data is in use by another process');
    process.exit(2);
  };
  if (process.platform === 'win32') {
    const EXCLUSIVE_SHARING = 0x10000000; // libuv UV_FS_O_EXLOCK: open with share mode 0
    try {
      openSync(file, constants.O_RDWR | constants.O_CREAT | EXCLUSIVE_SHARING); // held until exit
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') busy();
      throw err;
    }
    return;
  }
  // POSIX without flock in Node: an exclusive-create pid file, reclaimed if its owner is gone.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      writeSync(fd, String(process.pid));
      closeSync(fd);
      process.on('exit', () => rmSync(file, { force: true }));
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const owner = Number(readFileSync(file, 'utf8'));
      let alive = false;
      try {
        process.kill(owner, 0);
        alive = true;
      } catch (e) {
        alive = e.code === 'EPERM';
      }
      if (alive) busy();
      rmSync(file, { force: true });
    }
  }
  busy();
}

if (lockDir) lockDataDir(lockDir);

const wasi = new WASI({ version: 'preview1', args: guestArgs, env, preopens, returnOnExit: true });
const module = await WebAssembly.compile(await readFile(modulePath));
const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
process.exitCode = wasi.start(instance);
