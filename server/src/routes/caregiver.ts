import type { Request } from 'express';
import { Router } from 'express';

import { verifySession } from '../session.js';
import {
  acceptInvite,
  caregiversForPatient,
  createInvite,
  getUserById,
  getUserData,
  isLinked,
  patientsForCaregiver,
  unlink,
} from '../store.js';

/**
 * Caregiver sharing. A patient invites a caregiver with a short-lived code; the
 * caregiver redeems it and can then read that patient's synced data (read-only).
 * Every route is gated on the passkey session, and patient reads additionally
 * require an existing link.
 */
export const caregiverRouter = Router();

function userIdFrom(req: Request): string | null {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return verifySession(token);
}

/** Patient: create an invite code to give to a caregiver. */
caregiverRouter.post('/invite', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in.' });
  return res.json(createInvite(userId));
});

/** Caregiver: redeem an invite code. */
caregiverRouter.post('/accept', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in.' });

  const code = String(req.body?.code ?? '');
  const patientId = acceptInvite(code, userId);
  if (!patientId) return res.status(404).json({ error: 'That code is invalid or has expired.' });

  const patient = getUserById(patientId);
  return res.json({ patient: { id: patientId, name: patient?.name ?? '' } });
});

/** Caregiver: list the patients they can see. */
caregiverRouter.get('/patients', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in.' });

  const patients = patientsForCaregiver(userId).map((id) => ({
    id,
    name: getUserById(id)?.name ?? '',
    updatedAt: getUserData(id)?.updatedAt ?? null,
  }));
  return res.json({ patients });
});

/** Caregiver: read one linked patient's data (read-only). */
caregiverRouter.get('/patients/:id', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in.' });

  const patientId = req.params.id;
  if (!isLinked(userId, patientId)) return res.status(403).json({ error: 'Not shared with you.' });

  const stored = getUserData(patientId);
  return res.json({
    patient: { id: patientId, name: getUserById(patientId)?.name ?? '' },
    data: stored?.data ?? null,
    updatedAt: stored?.updatedAt ?? null,
  });
});

/** Patient: list caregivers who can see them, and revoke access. */
caregiverRouter.get('/my-caregivers', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in.' });

  const caregivers = caregiversForPatient(userId).map((id) => ({
    id,
    name: getUserById(id)?.name ?? '',
  }));
  return res.json({ caregivers });
});

/** Patient: revoke a caregiver's access. */
caregiverRouter.delete('/my-caregivers/:id', (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ error: 'Not signed in.' });
  unlink(req.params.id, userId);
  return res.json({ ok: true });
});
