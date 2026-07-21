import { Router } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';

import { config } from '../config.js';
import { issueSession } from '../session.js';
import {
  addCredential,
  createUser,
  getUserById,
  getUserByName,
  startFlow,
  takeFlow,
} from '../store.js';

export const registerRouter = Router();

/**
 * Sign-up, step 1: issue a registration challenge for a brand-new account.
 * Adding a passkey to an *existing* account (a second device) is a separate,
 * authenticated flow — here a taken name is rejected.
 */
registerRouter.post('/options', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (name.length < 1 || name.length > 60) {
    return res.status(400).json({ error: 'Enter a name between 1 and 60 characters.' });
  }
  if (getUserByName(name)) {
    return res.status(409).json({ error: 'That name is already registered on this device set.' });
  }

  const user = createUser(name);

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: name,
    // v13 wants the user handle as bytes; the account's UUID is stable.
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    authenticatorSelection: {
      // Prefer a discoverable (resident) credential so login can be usernameless,
      // and prefer user verification so the biometric gesture is required.
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  const flowId = startFlow(options.challenge, user.id);
  return res.json({ flowId, options });
});

/** Sign-up, step 2: verify the new passkey and open a session. */
registerRouter.post('/verify', async (req, res) => {
  const flowId = String(req.body?.flowId ?? '');
  const response = req.body?.response as RegistrationResponseJSON | undefined;

  const flow = takeFlow(flowId);
  if (!flow || !flow.userId || !response) {
    return res.status(400).json({ error: 'This sign-up attempt expired. Please start again.' });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: flow.challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: 'Could not verify the passkey.' });
  }

  const { credential } = verification.registrationInfo;
  addCredential(flow.userId, {
    id: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports,
    createdAt: new Date().toISOString(),
    label: labelFor(req.headers['user-agent']),
  });

  const token = issueSession(flow.userId);
  const user = getUserById(flow.userId);
  return res.json({ token, userId: flow.userId, name: user?.name ?? '' });
});

/** A friendly device label from the User-Agent, e.g. "iPhone", "Mac". */
function labelFor(ua: string | undefined): string {
  const s = ua ?? '';
  if (/iPhone/.test(s)) return 'iPhone';
  if (/iPad/.test(s)) return 'iPad';
  if (/Android/.test(s)) return 'Android device';
  if (/Macintosh/.test(s)) return 'Mac';
  if (/Windows/.test(s)) return 'Windows PC';
  return 'This device';
}
