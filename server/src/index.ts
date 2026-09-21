import './env.js'; // must run before config reads process.env

import { createApp } from './app.js';
import { config } from './config.js';
import { VaultClient } from './vault/client.js';

const vault = new VaultClient(config.vault);
const app = createApp(vault);

const server = app.listen(config.port, () => {
  console.log(`DoselyAI auth server listening on http://localhost:${config.port}`);
  console.log(`  RP ID:   ${config.rpID}`);
  console.log(`  Origins: ${config.origins.join(', ')}`);
  if (config.sessionSecret === 'dev-only-insecure-change-me') {
    console.warn('  ⚠  Using the insecure dev SESSION_SECRET — set a real one before deploying.');
  }
  if (!vault.available()) {
    console.warn('  ⚠  Care network vault not built — run: npm install --prefix native/vault && node native/vault/build.mjs');
  } else if (config.vault.dev) {
    console.warn('  ⚠  Care network in DEV mode: providers are auto-verified.');
  }
});

// Close the vault's stdin so it can finish its current write and exit cleanly.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void vault.close().finally(() => process.exit(0));
  });
}
