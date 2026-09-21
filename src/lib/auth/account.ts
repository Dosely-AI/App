import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Local email + password account. Because DoselyAI has no hosted backend yet,
 * an "account" lives on this device: the email/name and a salted password hash
 * are kept in the device secure store (Keychain / Keystore), or localStorage on
 * web. This gives a normal sign-up / sign-in experience today; when the backend
 * ships, `signInLocal`/`signUpLocal` become the calls that hit the server.
 *
 * The hash is a lightweight salted digest — enough to verify a password on this
 * device, not a server-grade KDF (the data it guards is already on-device).
 */
const KEY = 'dosely.account';
const isWeb = Platform.OS === 'web';

export type StoredAccount = { name: string; email: string; salt: string; hash: string };

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

function randomSalt(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** A salted, two-accumulator digest — deterministic and dependency-free. */
function hashPassword(password: string, salt: string): string {
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

const norm = (email: string) => email.trim().toLowerCase();

export async function getStoredAccount(): Promise<StoredAccount | null> {
  const raw = await readRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAccount;
  } catch {
    return null;
  }
}

/** Create the on-device account, replacing any existing one. */
export async function signUpLocal(
  name: string,
  email: string,
  password: string,
): Promise<StoredAccount> {
  const salt = randomSalt();
  const account: StoredAccount = {
    name: name.trim(),
    email: norm(email),
    salt,
    hash: hashPassword(password, salt),
  };
  await writeRaw(JSON.stringify(account));
  return account;
}

/** Verify a sign-in against the stored account; null if it doesn't match. */
export async function signInLocal(email: string, password: string): Promise<StoredAccount | null> {
  const account = await getStoredAccount();
  if (!account) return null;
  if (account.email !== norm(email)) return null;
  if (account.hash !== hashPassword(password, account.salt)) return null;
  return account;
}

export async function clearAccount(): Promise<void> {
  await deleteRaw();
}
