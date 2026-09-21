/**
 * Request guards for the care API (HTTP layer, in front of the vault):
 *
 *  - authentication: a valid passkey session is required;
 *  - replay protection: every state-changing request carries a one-time nonce
 *    and a timestamp; a nonce is accepted once, and only within ±5 minutes, so
 *    a captured request can't be re-sent (defense in depth on top of TLS);
 *  - rate limiting: a token bucket per user blunts scraping and brute force.
 */
import type { NextFunction, Request, Response } from 'express';

import { sessionClaims } from '../session.js';

export type CareAuth = { userId: string; issuedAtMs: number };

declare module 'express-serve-static-core' {
  interface Request {
    care?: CareAuth;
  }
}

export const NONCE_HEADER = 'x-dosely-nonce';
export const TIMESTAMP_HEADER = 'x-dosely-timestamp';
const MAX_SKEW_MS = 5 * 60_000;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const claims = sessionClaims(token);
  if (!claims) return res.status(401).json({ error: 'Not signed in.', code: 'UNAUTHORIZED' });
  req.care = claims;
  return next();
}

/** Remembers nonces for twice the skew window (older requests are rejected by time anyway). */
export class NonceCache {
  private seen = new Map<string, number>();

  constructor(
    private readonly ttlMs = 2 * MAX_SKEW_MS,
    private readonly maxEntries = 100_000,
  ) {}

  /** True the first time a key is seen within the TTL. */
  claim(key: string, now = Date.now()): boolean {
    this.evict(now);
    if (this.seen.has(key)) return false;
    if (this.seen.size >= this.maxEntries) return false; // fail closed under flood
    this.seen.set(key, now + this.ttlMs);
    return true;
  }

  private evict(now: number) {
    for (const [key, expires] of this.seen) {
      if (expires > now) break; // insertion order == expiry order
      this.seen.delete(key);
    }
  }
}

export function replayGuard(cache: NonceCache, now: () => number = Date.now) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const nonce = req.header(NONCE_HEADER) ?? '';
    const timestamp = Number(req.header(TIMESTAMP_HEADER));
    if (!NONCE_PATTERN.test(nonce) || !Number.isSafeInteger(timestamp)) {
      return res.status(400).json({ error: 'Missing request nonce or timestamp.', code: 'BAD_REQUEST' });
    }
    if (Math.abs(now() - timestamp) > MAX_SKEW_MS) {
      return res.status(400).json({ error: 'Request timestamp is too far from server time.', code: 'EXPIRED' });
    }
    if (!cache.claim(`${req.care?.userId ?? ''}:${nonce}`)) {
      return res.status(409).json({ error: 'This request was already processed.', code: 'REPLAYED' });
    }
    return next();
  };
}

/** Token bucket per user: `burst` requests at once, refilling at `perMinute`. */
export function rateLimit(perMinute = 120, burst = 60, now: () => number = Date.now) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.care?.userId ?? req.ip ?? 'anonymous';
    const t = now();
    const b = buckets.get(key) ?? { tokens: burst, at: t };
    b.tokens = Math.min(burst, b.tokens + ((t - b.at) * perMinute) / 60_000);
    b.at = t;
    if (b.tokens < 1) {
      buckets.set(key, b);
      res.setHeader('Retry-After', String(Math.ceil(((1 - b.tokens) * 60) / perMinute)));
      return res.status(429).json({ error: 'Too many requests. Try again shortly.', code: 'RATE_LIMITED' });
    }
    b.tokens -= 1;
    buckets.set(key, b);
    if (buckets.size > 50_000) buckets.clear(); // bounded memory; worst case resets limits
    return next();
  };
}
