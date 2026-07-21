import { randomUUID } from 'node:crypto';

/**
 * In-memory data store. Fine for local development and demos; everything is
 * lost on restart. For production, back each of these Maps with a real database
 * (Postgres, SQLite, etc.) — the shapes below are the schema you'd persist.
 */

/** A registered passkey credential (one user can have several — one per device). */
export type StoredCredential = {
  /** Base64URL credential ID from the authenticator. */
  id: string;
  /** COSE public key bytes. */
  publicKey: Uint8Array;
  /** Signature counter, for cloned-authenticator detection. */
  counter: number;
  /** Hints for the authenticator UI (e.g. "internal", "hybrid"). */
  transports?: string[];
  /** When the passkey was registered. */
  createdAt: string;
  /** Human label, e.g. "Jordan's iPhone". */
  label: string;
};

export type User = {
  id: string;
  name: string;
  createdAt: string;
  credentials: StoredCredential[];
};

const usersById = new Map<string, User>();
const userIdByName = new Map<string, string>();
/** credentialId -> userId, so a passkey resolves to its owner without a username. */
const userIdByCredential = new Map<string, string>();

export function createUser(name: string): User {
  const user: User = { id: randomUUID(), name, createdAt: new Date().toISOString(), credentials: [] };
  usersById.set(user.id, user);
  userIdByName.set(name.toLowerCase(), user.id);
  return user;
}

export function getUserByName(name: string): User | undefined {
  const id = userIdByName.get(name.toLowerCase());
  return id ? usersById.get(id) : undefined;
}

export function getUserById(id: string): User | undefined {
  return usersById.get(id);
}

export function getUserByCredentialId(credentialId: string): User | undefined {
  const id = userIdByCredential.get(credentialId);
  return id ? usersById.get(id) : undefined;
}

export function addCredential(userId: string, cred: StoredCredential): void {
  const user = usersById.get(userId);
  if (!user) throw new Error('user not found');
  user.credentials.push(cred);
  userIdByCredential.set(cred.id, userId);
}

export function getCredential(userId: string, credentialId: string): StoredCredential | undefined {
  return usersById.get(userId)?.credentials.find((c) => c.id === credentialId);
}

export function updateCounter(userId: string, credentialId: string, counter: number): void {
  const cred = getCredential(userId, credentialId);
  if (cred) cred.counter = counter;
}

/**
 * Short-lived WebAuthn challenges. A ceremony returns a `flowId`; the client
 * echoes it on verify so we recover the exact challenge that was issued.
 * Challenges are single-use and expire quickly.
 */
type Flow = { challenge: string; userId?: string; expiresAt: number };
const flows = new Map<string, Flow>();
const FLOW_TTL_MS = 5 * 60 * 1000;

export function startFlow(challenge: string, userId?: string): string {
  const flowId = randomUUID();
  flows.set(flowId, { challenge, userId, expiresAt: Date.now() + FLOW_TTL_MS });
  return flowId;
}

/** Consume a flow — single use. Returns null if unknown or expired. */
export function takeFlow(flowId: string): Flow | null {
  const flow = flows.get(flowId);
  flows.delete(flowId);
  if (!flow || flow.expiresAt < Date.now()) return null;
  return flow;
}
