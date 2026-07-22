import './env.js'; // must run before config reads process.env

import cors from 'cors';
import express from 'express';

import { config } from './config.js';
import { caregiverRouter } from './routes/caregiver.js';
import { chatRouter } from './routes/chat.js';
import { registerRouter } from './routes/register.js';
import { loginRouter } from './routes/login.js';
import { syncRouter } from './routes/sync.js';
import { verifySession } from './session.js';
import { getUserById } from './store.js';

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: config.origins,
    credentials: true,
  }),
);

app.get('/health', (_req, res) => res.json({ ok: true, rpID: config.rpID }));

app.use('/auth/register', registerRouter);
app.use('/auth/login', loginRouter);
app.use('/chat', chatRouter);
app.use('/sync', syncRouter);
app.use('/caregiver', caregiverRouter);

/** Return the signed-in user for a bearer token, or 401. */
app.get('/auth/me', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const userId = verifySession(token);
  const user = userId ? getUserById(userId) : undefined;
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  return res.json({ userId: user.id, name: user.name, devices: user.credentials.length });
});

app.listen(config.port, () => {
  console.log(`DoselyAI auth server listening on http://localhost:${config.port}`);
  console.log(`  RP ID:   ${config.rpID}`);
  console.log(`  Origins: ${config.origins.join(', ')}`);
  if (config.sessionSecret === 'dev-only-insecure-change-me') {
    console.warn('  ⚠  Using the insecure dev SESSION_SECRET — set a real one before deploying.');
  }
});
