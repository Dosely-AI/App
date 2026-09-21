import { getRandomValues } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import {
  clearAccount,
  getStoredAccount,
  legacyDigest,
  PBKDF2_ITERATIONS,
  pbkdf2Sha256,
  signInLocal,
  signUpLocal,
} from '../account';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
jest.mock('expo-crypto', () => ({
  getRandomValues: jest.fn(<T extends ArrayBufferView>(a: T) => require('crypto').randomFillSync(a)),
}));

const KEY = 'dosely.account';
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bytes = (s: string) => new TextEncoder().encode(s);
const stored = async () => JSON.parse((await SecureStore.getItemAsync(KEY))!);
const put = (record: object) => SecureStore.setItemAsync(KEY, JSON.stringify(record));

/** Run `fn` as on a phone: no WebCrypto, so expo-crypto + pure-JS PBKDF2. */
async function withoutWebCrypto<T>(fn: () => Promise<T>): Promise<T> {
  const own = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  try {
    return await fn();
  } finally {
    if (own) Object.defineProperty(globalThis, 'crypto', own);
    else delete (globalThis as { crypto?: unknown }).crypto;
  }
}

beforeEach(() => clearAccount());

describe('pbkdf2Sha256', () => {
  // RFC 7914 §11 PBKDF2-HMAC-SHA256 test vectors (first 32 bytes).
  const vectors = [
    { p: 'passwd', s: 'salt', c: 1, dk: '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc' },
    { p: 'Password', s: 'NaCl', c: 80000, dk: '4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56' },
  ];

  it.each(vectors)('WebCrypto path matches RFC 7914 (c=$c)', async ({ p, s, c, dk }) => {
    expect(hex(await pbkdf2Sha256(p, bytes(s), c))).toBe(dk);
  });

  it.each(vectors)('pure-JS path matches RFC 7914 (c=$c)', async ({ p, s, c, dk }) => {
    expect(hex(await pbkdf2Sha256(p, bytes(s), c, null))).toBe(dk);
  });
});

describe('local account', () => {
  it('stores a salted PBKDF2 hash, never the password', async () => {
    await signUpLocal('  Ada  ', ' Ada@Example.com ', 'correct horse');
    const raw = (await SecureStore.getItemAsync(KEY))!;
    expect(raw).not.toContain('correct horse');

    const r = JSON.parse(raw);
    expect(r).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      password: { kdf: 'pbkdf2-sha256', iterations: PBKDF2_ITERATIONS, salt: expect.any(String), hash: expect.any(String) },
    });
    expect(Buffer.from(r.password.salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(r.password.hash, 'base64')).toHaveLength(32);
  });

  it('uses a fresh random salt each time', async () => {
    await signUpLocal('Ada', 'ada@example.com', 'same password');
    const first = (await stored()).password;
    await signUpLocal('Ada', 'ada@example.com', 'same password');
    const second = (await stored()).password;
    expect(second.salt).not.toBe(first.salt);
    expect(second.hash).not.toBe(first.hash);
  });

  it('signs in with the right email and password only', async () => {
    await signUpLocal('Ada', 'ada@example.com', 'correct horse');
    await expect(signInLocal('ADA@example.com ', 'correct horse')).resolves.toEqual({ name: 'Ada', email: 'ada@example.com' });
    await expect(signInLocal('ada@example.com', 'correct horsE')).resolves.toBeNull();
    await expect(signInLocal('bob@example.com', 'correct horse')).resolves.toBeNull();
  });

  it('only exposes name and email', async () => {
    await signUpLocal('Ada', 'ada@example.com', 'correct horse');
    await expect(getStoredAccount()).resolves.toEqual({ name: 'Ada', email: 'ada@example.com' });
  });

  it('returns null when there is no account', async () => {
    await expect(getStoredAccount()).resolves.toBeNull();
    await expect(signInLocal('ada@example.com', 'anything')).resolves.toBeNull();
  });

  it('rejects tampered or malformed records without throwing', async () => {
    await signUpLocal('Ada', 'ada@example.com', 'correct horse');
    const good = await stored();

    await put({ ...good, password: { ...good.password, iterations: 1e12 } });
    await expect(signInLocal('ada@example.com', 'correct horse')).resolves.toBeNull();

    await put({ ...good, password: { ...good.password, kdf: 'none' } });
    await expect(signInLocal('ada@example.com', 'correct horse')).resolves.toBeNull();

    await put({ ...good, password: { ...good.password, hash: '%%%' } });
    await expect(signInLocal('ada@example.com', 'correct horse')).resolves.toBeNull();

    await SecureStore.setItemAsync(KEY, '{not json');
    await expect(signInLocal('ada@example.com', 'correct horse')).resolves.toBeNull();
  });

  it('raises an old, lower work factor on sign-in', async () => {
    const salt = new Uint8Array(16).fill(7);
    const hash = await pbkdf2Sha256('correct horse', salt, 1000);
    await put({
      name: 'Ada',
      email: 'ada@example.com',
      password: {
        kdf: 'pbkdf2-sha256',
        iterations: 1000,
        salt: Buffer.from(salt).toString('base64'),
        hash: Buffer.from(hash).toString('base64'),
      },
    });

    await expect(signInLocal('ada@example.com', 'correct horse')).resolves.toEqual({ name: 'Ada', email: 'ada@example.com' });
    expect((await stored()).password.iterations).toBe(PBKDF2_ITERATIONS);
    await expect(signInLocal('ada@example.com', 'correct horse')).resolves.not.toBeNull();
  });
});

describe('accounts from the old weak hash', () => {
  const legacy = { name: 'Ada', email: 'ada@example.com', salt: 'k3j9x0lmo2', hash: legacyDigest('correct horse', 'k3j9x0lmo2') };

  it('sign in once and are re-hashed with PBKDF2', async () => {
    await put(legacy);
    await expect(signInLocal('ada@example.com', 'correct horse')).resolves.toEqual({ name: 'Ada', email: 'ada@example.com' });

    const r = await stored();
    expect(r).not.toHaveProperty('salt');
    expect(r).not.toHaveProperty('hash');
    expect(r.password.kdf).toBe('pbkdf2-sha256');
    await expect(signInLocal('ada@example.com', 'correct horse')).resolves.not.toBeNull();
  });

  it('stay untouched after a wrong password', async () => {
    await put(legacy);
    await expect(signInLocal('ada@example.com', 'wrong')).resolves.toBeNull();
    expect(await stored()).toEqual(legacy);
  });
});

describe('on a phone (no WebCrypto)', () => {
  it('uses the OS random source and the pure-JS hash', async () => {
    (getRandomValues as jest.Mock).mockClear();
    await withoutWebCrypto(async () => {
      await signUpLocal('Ada', 'ada@example.com', 'correct horse');
      await expect(signInLocal('ada@example.com', 'correct horse')).resolves.not.toBeNull();
      await expect(signInLocal('ada@example.com', 'nope')).resolves.toBeNull();
    });
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    // A WebCrypto build verifies the same record: both paths agree.
    await expect(signInLocal('ada@example.com', 'correct horse')).resolves.not.toBeNull();
  });
});

describe('on web', () => {
  let web: typeof import('../account');
  const local = new Map<string, string>();

  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => local.get(k) ?? null,
        setItem: (k: string, v: string) => void local.set(k, v),
        removeItem: (k: string) => void local.delete(k),
      },
    });
    // A fresh copy of the module, loaded as if on web.
    jest.isolateModules(() => {
      jest.replaceProperty(require('react-native').Platform, 'OS', 'web');
      web = require('../account');
    });
  });
  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('keeps a 600,000-iteration hash in localStorage', async () => {
    expect(web.PBKDF2_ITERATIONS).toBe(600_000);
    await web.signUpLocal('Ada', 'ada@example.com', 'correct horse');

    const raw = local.get(KEY)!;
    expect(raw).not.toContain('correct horse');
    expect(JSON.parse(raw).password.iterations).toBe(600_000);
    await expect(web.signInLocal('ada@example.com', 'correct horse')).resolves.not.toBeNull();
    await expect(web.signInLocal('ada@example.com', 'wrong')).resolves.toBeNull();
  });
});
