import { Router } from 'express';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server';

import { config } from '../config.js';
import { issueSession } from '../session.js';
import {
  getCredential,
  getUserByCredentialId,
  getUserByName,
  startFlow,
  takeFlow,
  updateCounter,
} from '../store.js';

export const loginRouter = Router();

/**
 * Sign-in, step 1: issue an authentication challenge. If a name is given we
 * scope it to that account's passkeys; otherwise we leave it open and let the
 * platform offer any discoverable passkey (usernameless login).
 */
loginRouter.post('/options', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const user = name ? getUserByName(name) : undefined;

  if (name && !user) {
    return res.status(404).json({ error: 'No account with that name is registered here.' });
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: 'preferred',
    allowCredentials: user?.credentials.map((c) => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransportFuture[] | undefined,
    })),
  });

  const flowId = startFlow(options.challenge, user?.id);
  return res.json({ flowId, options });
});

/** Sign-in, step 2: verify the assertion and open a session. */
loginRouter.post('/verify', async (req, res) => {
  const flowId = String(req.body?.flowId ?? '');
  const response = req.body?.response as AuthenticationResponseJSON | undefined;

  const flow = takeFlow(flowId);
  if (!flow || !response) {
    return res.status(400).json({ error: 'This sign-in attempt expired. Please start again.' });
  }

  // Resolve the account: scoped login already knows it; usernameless login
  // discovers it from the passkey that was used.
  const userId = flow.userId ?? getUserByCredentialId(response.id)?.id;
  const credential = userId ? getCredential(userId, response.id) : undefined;
  if (!userId || !credential) {
    return res.status(400).json({ error: 'That passkey is not registered here.' });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: flow.challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpID,
      requireUserVerification: false,
      credential: {
        id: credential.id,
        // Copy-construct to satisfy TS 5.7's Uint8Array<ArrayBuffer> generic.
        publicKey: new Uint8Array(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
      },
    });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  if (!verification.verified) {
    return res.status(400).json({ error: 'Could not verify the passkey.' });
  }

  // Advance the signature counter — a counter that goes backwards signals a
  // cloned authenticator (SimpleWebAuthn already rejects that above).
  updateCounter(userId, credential.id, verification.authenticationInfo.newCounter);

  const token = issueSession(userId);
  const user = getUserByCredentialId(response.id);
  return res.json({ token, userId, name: user?.name ?? '' });
});
