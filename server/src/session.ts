import { createHmac, timingSafeEqual } from 'node:crypto';

import { config } from './config.js';

/**
 * Minimal stateless session tokens: `base64url(payload).base64url(hmac)`.
 * The payload is `userId.expiryEpochSeconds`, signed with SESSION_SECRET so it
 * can't be forged. Good enough for this app; swap for signed JWTs or
 * server-side sessions if you need revocation or richer claims.
 */

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', config.sessionSecret).update(payload).digest());
}

export function issueSession(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + config.sessionTtlSec;
  const payload = `${userId}.${exp}`;
  return `${b64url(Buffer.from(payload))}.${sign(payload)}`;
}

/** Verify a token and return the userId, or null if invalid/expired/tampered. */
export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;

  const payload = Buffer.from(payloadB64, 'base64url').toString();
  const expected = sign(payload);

  // Constant-time compare to avoid leaking the signature via timing.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [userId, expStr] = payload.split('.');
  if (!userId || !expStr) return null;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;

  return userId;
}
