/** Runtime configuration, read from the environment with dev-friendly defaults. */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isProduction = process.env.NODE_ENV === 'production';
const vaultBuild = resolve(serverRoot, '../native/vault/build');

/**
 * The WebAssembly build (run by Node, so allow-listing like Windows Smart App
 * Control has nothing to block) unless only a native build exists.
 */
function defaultVaultBin(): string {
  const wasm = resolve(vaultBuild, 'dosely-vault.wasm');
  const native = resolve(vaultBuild, process.platform === 'win32' ? 'dosely-vault.exe' : 'dosely-vault');
  return existsSync(wasm) || !existsSync(native) ? wasm : native;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),

  /**
   * WebAuthn Relying Party ID — a registrable domain suffix of every origin.
   * "localhost" is special-cased by browsers as secure, so passkeys work over
   * http during development. In production this is your bare domain.
   */
  rpID: process.env.RP_ID ?? 'localhost',
  rpName: process.env.RP_NAME ?? 'DoselyAI',

  /** Origins allowed to call the API and complete a WebAuthn ceremony. */
  origins: (process.env.ORIGINS ?? 'http://localhost:8081,http://localhost:19006')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-insecure-change-me',
  /** Session lifetime in seconds (default 30 days). */
  sessionTtlSec: 60 * 60 * 24 * 30,

  /**
   * Anthropic key for the hybrid chat's open-ended answers. Held ONLY here on
   * the server so app users never need their own. Empty = AI chat disabled
   * (the app still answers medication/data questions locally).
   */
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  chatModel: 'claude-opus-4-8',

  /**
   * Care network vault (native/vault): the encrypted patient database, run as
   * a separate process. Its key file is read only by the vault — keep it off
   * the data volume (e.g. a secrets mount) and backed up; losing it loses the
   * data, by design.
   */
  vault: {
    /** A `.wasm` module (run under Node via `host`) or a native executable. */
    bin: process.env.VAULT_BIN ?? defaultVaultBin(),
    host: resolve(serverRoot, '../native/vault/wasi-host.mjs'),
    dataDir: process.env.VAULT_DATA_DIR ?? resolve(serverRoot, '.data/vault'),
    keyFile: process.env.VAULT_KEY_FILE ?? resolve(serverRoot, '.data/vault.key'),
    /** Dev conveniences: auto-create a key file and auto-verify providers. Never in production. */
    dev: !isProduction && process.env.VAULT_DEV !== '0',
  },
} as const;

if (config.sessionSecret === 'dev-only-insecure-change-me' && isProduction) {
  throw new Error('SESSION_SECRET must be set to a strong random value in production.');
}
