import type { Request } from 'express';
import { Router } from 'express';

import { verifySession } from '../session.js';
import { getUserData, setUserData } from '../store.js';

/**
 * Per-account data sync. The client holds the source of truth on-device and
 * mirrors it here so the same account can pull it on another device — and, in a
 * later step, so a caregiver can be granted read access. Every request is gated
 * on the passkey session token.
 */
export const syncRouter = Router();

function userIdFrom(req: Request): string | null {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return verifySession(token);
}

/** Pull this account's stored data. */
syncRouter.get('/', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in.' });

  const stored = getUserData(userId);
  return res.json(stored ? { data: stored.data, updatedAt: stored.updatedAt } : { data: null, updatedAt: null });
});

/** Replace this account's stored data (last write wins). */
syncRouter.put('/', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in.' });

  const data = req.body?.data;
  if (data === undefined) return res.status(400).json({ error: 'Missing data.' });

  const updatedAt =
    typeof req.body?.updatedAt === 'string' ? req.body.updatedAt : new Date().toISOString();

  setUserData(userId, data, updatedAt);
  return res.json({ ok: true, updatedAt });
});
