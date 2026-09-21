import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import { getRandomValues } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Local email + password account. Because DoselyAI has no hosted backend yet,
 * an "account" lives on this device: the email/name and a password hash are
 * kept in the device secure store (Keychain / Keystore), or localStorage on
 * web. This gives a normal sign-up / sign-in experience today; when the backend
 * ships, `signInLocal`/`signUpLocal` become the calls that hit the server.
 *
 * The password itself is never stored. We keep a PBKDF2-HMAC-SHA256 hash
 * (256-bit) with a random 16-byte salt and its work factor, so that someone
 * who reads the stored record can't cheaply recover a password the user may
 * also use elsewhere:
 *  - web: 600,000 iterations (OWASP's recommendation), using the browser's
 *    WebCrypto. This matters most here: localStorage is readable by anything
 *    that can run script on the page.
 *  - phones: 10,000 iterations with @noble/hashes (audited, pure JS). Phones
 *    have no WebCrypto and Hermes hashes slowly, so a higher count would stall
 *    sign-in; the record there is also encrypted by the Keychain/Keystore.
 * Accounts created before this scheme still sign in once and are upgraded then.
 */
const KEY = 'dosely.account';
const isWeb = Platform.OS === 'web';

/** Work factor for new hashes on this platform. */
export const PBKDF2_ITERATIONS = isWeb ? 600_000 : 10_000;
const MAX_ITERATIONS = 10_000_000; // refuse absurd values from a tampered record
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** What callers see: never the hash or salt. */
export type Account = { name: string; email: string };

type PasswordHash = { kdf: 'pbkdf2-sha256'; iterations: number; salt: string; hash: string };
type StoredRecord = Account & { password: PasswordHash };
/** The pre-PBKDF2 format: a fast 64-bit digest. Only ever read, to upgrade it. */
type LegacyRecord = Account & { salt: string; hash: string };

// --- Storage ----------------------------------------------------------------------

async function readRaw(): Promise<string | null> {
  if (isWeb) {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function writeRaw(value: string): Promise<void> {
  if (isWeb) {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* private mode — fail quietly */
    }
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

async function deleteRaw(): Promise<void> {
  if (isWeb) {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

async function readRecord(): Promise<StoredRecord | LegacyRecord | null> {
  const raw = await readRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredRecord | LegacyRecord;
  } catch {
    return null;
  }
}

// --- Hashing ----------------------------------------------------------------------

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(n);
  const webCrypto = globalThis.crypto;
  // The browser's CSPRNG on web; expo-crypto's (the OS's) on phones.
  if (webCrypto?.getRandomValues) webCrypto.getRandomValues(bytes);
  else getRandomValues(bytes);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * PBKDF2-HMAC-SHA256. Uses WebCrypto when it's available (native speed in
 * browsers), otherwise the pure-JS implementation. Both give identical output.
 * `subtle` is injectable so tests can exercise each path.
 */
export async function pbkdf2Sha256(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null,
): Promise<Uint8Array> {
  // NFKC so the same password typed on different keyboards hashes the same (NIST SP 800-63B).
  const secret = new TextEncoder().encode(password.normalize('NFKC'));
  if (subtle) {
    const key = await subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BYTES * 8);
    return new Uint8Array(bits);
  }
  return pbkdf2Async(sha256, secret, salt, { c: iterations, dkLen: HASH_BYTES });
}

/** Compare without stopping at the first difference. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await pbkdf2Sha256(password, salt, PBKDF2_ITERATIONS);
  return { kdf: 'pbkdf2-sha256', iterations: PBKDF2_ITERATIONS, salt: toBase64(salt), hash: toBase64(hash) };
}

async function passwordMatches(password: string, stored: PasswordHash): Promise<boolean> {
  if (stored.kdf !== 'pbkdf2-sha256') return false;
  if (!Number.isSafeInteger(stored.iterations) || stored.iterations < 1 || stored.iterations > MAX_ITERATIONS) return false;
  try {
    const expected = fromBase64(stored.hash);
    const actual = await pbkdf2Sha256(password, fromBase64(stored.salt), stored.iterations);
    return sameBytes(actual, expected);
  } catch {
    return false; // malformed record
  }
}

/**
 * The digest used before PBKDF2 (fast and only 64 bits). Kept solely to verify
 * accounts created with it, so they can be upgraded; never used for new hashes.
 */
export function legacyDigest(password: string, salt: string): string {
  const s = `${salt}:${password}`;
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// --- Account API -------------------------------------------------------------------

const norm = (email: string) => email.trim().toLowerCase();
const publicView = (r: Account): Account => ({ name: r.name, email: r.email });

async function save(account: Account, password: string): Promise<Account> {
  const record: StoredRecord = { ...publicView(account), password: await hashPassword(password) };
  await writeRaw(JSON.stringify(record));
  return publicView(record);
}

export async function getStoredAccount(): Promise<Account | null> {
  const record = await readRecord();
  return record ? publicView(record) : null;
}

/** Create the on-device account, replacing any existing one. */
export async function signUpLocal(name: string, email: string, password: string): Promise<Account> {
  return save({ name: name.trim(), email: norm(email) }, password);
}

/** Verify a sign-in against the stored account; null if it doesn't match. */
export async function signInLocal(email: string, password: string): Promise<Account | null> {
  const record = await readRecord();
  if (!record || record.email !== norm(email)) return null;

  if (!('password' in record)) {
    // Created before PBKDF2: verify the old digest once, then re-hash properly.
    if (typeof record.salt !== 'string' || typeof record.hash !== 'string') return null;
    if (legacyDigest(password, record.salt) !== record.hash) return null;
    return save(record, password);
  }

  if (!(await passwordMatches(password, record.password))) return null;
  // Raise the work factor when the platform's target has gone up since sign-up.
  if (record.password.iterations < PBKDF2_ITERATIONS) return save(record, password);
  return publicView(record);
}

export async function clearAccount(): Promise<void> {
  await deleteRaw();
}
