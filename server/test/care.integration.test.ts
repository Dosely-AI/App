/**
 * End-to-end: HTTP -> guards -> TypeScript codec/frames -> real C++ vault
 * process -> encrypted files. Also proves the two protocol implementations
 * interoperate byte-for-byte (HKDF, HMAC, TLV). Skips if the vault isn't built.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { issueSession } from '../src/session.js';
import { VaultClient } from '../src/vault/client.js';
import { RxStatus, Scope, WorkKind } from '../src/vault/protocol.gen.js';

const built = existsSync(config.vault.bin);

describe('care network (integration)', { skip: built ? false : 'vault not built — run node native/vault/build.mjs' }, () => {
  let dir: string;
  let vault: VaultClient;
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;
  let base: string;

  const patient = issueSession('patient-1');
  const pharmacy = issueSession('pharm-1');
  const doctor = issueSession('doc-1');
  const staleDoctor = issueSession('doc-1', Date.now() - 10 * 60_000); // signed in 10 minutes ago

  type Opts = { token?: string; role?: string; body?: unknown; nonce?: string; timestamp?: number };
  async function api(method: string, path: string, opts: Opts = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.role) headers['x-dosely-role'] = opts.role;
    if (method !== 'GET') {
      headers['x-dosely-nonce'] = opts.nonce ?? randomBytes(16).toString('base64url');
      headers['x-dosely-timestamp'] = String(opts.timestamp ?? Date.now());
    }
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  }

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dosely-care-'));
    vault = new VaultClient({ ...config.vault, dataDir: join(dir, 'vault'), keyFile: join(dir, 'vault.key'), dev: true });
    server = createApp(vault).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/care`;
  });

  after(async () => {
    await vault.close();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('connects a patient, pharmacy and prescriber and runs a prescription to pickup', async () => {
    assert.equal((await api('GET', '/health')).body.ok, true);

    const today = Math.floor(Date.now() / 86_400_000);
    const snapshot = {
      displayName: 'Alex Rivera',
      med: [
        { id: 'm-atorva', name: 'Atorvastatin', strength: '20 mg', slotsPerDay: 1, onHandMilli: 5000, asOfDay: today, supplyTracked: true },
        { id: 'm-metformin', name: 'Metformin', slotsPerDay: 2, onHandMilli: 40_000, asOfDay: today, supplyTracked: true },
      ],
    };
    assert.equal((await api('PUT', '/snapshot', { token: patient, body: { snapshot } })).status, 200);

    const pharm = await api('PUT', '/providers/me', { token: pharmacy, body: { provider: { role: 2, name: 'Mercy Pharmacy', npi: '1234567893' } } });
    assert.equal(pharm.status, 200, JSON.stringify(pharm.body));
    assert.equal(pharm.body.verified, true); // dev mode
    const doc = await api('PUT', '/providers/me', { token: doctor, body: { provider: { role: 3, name: 'Dr. Lee', npi: '1245319599' } } });
    assert.equal(doc.status, 200, JSON.stringify(doc.body));

    const pInvite = await api('POST', '/invites', { token: patient, body: { role: 2, scopes: Scope.READ_REFILL | Scope.RECEIVE_RX } });
    assert.equal(pInvite.status, 200);
    assert.equal((await api('POST', '/invites/redeem', { token: pharmacy, role: 'pharmacy', body: { token: pInvite.body.token } })).status, 200);
    const dInvite = await api('POST', '/invites', { token: patient, body: { role: 3, scopes: Scope.PRESCRIBE | Scope.READ_ADHERENCE } });
    const redeemed = await api('POST', '/invites/redeem', { token: doctor, role: 'prescriber', body: { token: dInvite.body.token } });
    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.body.patientName, 'Alex Rivera');

    const summary = await api('GET', '/patients/patient-1/summary', { token: doctor, role: 'prescriber' });
    assert.equal(summary.status, 200);
    assert.equal(summary.body.pharmacy[0].id, 'pharm-1');

    const rx = {
      patientId: 'patient-1', pharmacyId: 'pharm-1', medId: 'm-atorva', drugName: 'Atorvastatin', strength: '20 mg',
      sig: 'Take 1 tablet at bedtime', quantityMilli: 30_000, daysSupply: 30, refills: 2,
    };
    const stale = await api('POST', '/prescriptions', { token: staleDoctor, role: 'prescriber', body: { rx } });
    assert.equal(stale.status, 401);
    assert.equal(stale.body.code, 'STEP_UP_REQUIRED');
    const sent = await api('POST', '/prescriptions', { token: doctor, role: 'prescriber', body: { rx } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal(sent.body.signatureValid, true);

    const work = await api('GET', '/worklist', { token: pharmacy, role: 'pharmacy' });
    assert.equal(work.body.items[0].kind, WorkKind.NEW_RX);

    for (const status of [RxStatus.RECEIVED, RxStatus.READY, RxStatus.PICKED_UP]) {
      const r = await api('POST', `/prescriptions/${sent.body.id}/status`, { token: pharmacy, role: 'pharmacy', body: { status } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
    }
    const mine = await api('GET', `/prescriptions/${sent.body.id}`, { token: patient });
    assert.equal(mine.body.status, RxStatus.PICKED_UP);

    const log = await api('GET', '/audit', { token: patient });
    assert.ok(log.body.items.some((e: any) => e.actorName === 'Mercy Pharmacy'));
    assert.equal((await api('GET', '/audit/verify', { token: patient })).body.auditIntact, true);
  });

  it('enforces authentication, replay protection and strict input', async () => {
    assert.equal((await api('GET', '/grants')).status, 401);
    assert.equal((await api('GET', '/grants', { token: 'forged.token' })).status, 401);

    const nonce = randomBytes(16).toString('base64url');
    const body = { role: 2, scopes: Scope.READ_MEDS };
    assert.equal((await api('POST', '/invites', { token: patient, body, nonce })).status, 200);
    const replayed = await api('POST', '/invites', { token: patient, body, nonce });
    assert.equal(replayed.status, 409);
    assert.equal(replayed.body.code, 'REPLAYED');
    assert.equal((await api('POST', '/invites', { token: patient, body, timestamp: Date.now() - 6 * 60_000 })).status, 400);

    assert.equal((await api('PUT', '/snapshot', { token: patient, body: { snapshot: { patientId: 'someone-else' } } })).status, 400);
    assert.equal((await api('GET', '/grants', { token: patient, role: 'admin' })).status, 400);
    assert.equal((await api('GET', '/patients/patient-1/summary', { token: issueSession('stranger'), role: 'pharmacy' })).status, 404);
    const forbidden = await api('GET', '/patients/patient-1/summary', { token: patient, role: 'patient' });
    assert.equal(forbidden.status, 200); // a patient reading their own record
    assert.equal((await api('GET', '/patients/patient-1/summary', { token: issueSession('patient-2') })).status, 403);
  });

  it('refuses a second vault on the same data while one is running', async () => {
    assert.equal((await api('GET', '/grants', { token: patient })).status, 200); // vault is up
    const [command, argv] = config.vault.bin.endsWith('.wasm')
      ? [process.execPath, ['--no-warnings', config.vault.host, config.vault.bin]]
      : [config.vault.bin, []];
    const second = spawnSync(command, [...argv, '--data', join(dir, 'vault'), '--key-file', join(dir, 'vault.key')], {
      input: '',
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /in use by another process/);
  });

  it('keeps data encrypted at rest and survives a vault crash', async () => {
    // Just the encrypted database, the sealed audit log, and the single-writer lock.
    assert.deepEqual(readdirSync(join(dir, 'vault')).sort(), ['audit.log', 'vault.db', 'vault.lock']);
    const raw = Buffer.concat(['audit.log', 'vault.db'].map((f) => readFileSync(join(dir, 'vault', f))));
    for (const secret of ['Alex Rivera', 'Atorvastatin', 'Take 1 tablet', 'Mercy Pharmacy']) {
      assert.equal(raw.includes(Buffer.from(secret)), false, `${secret} must not appear in plaintext`);
    }

    void vault.close(); // simulate the vault going away; the next request respawns it
    const again = await api('GET', '/grants', { token: patient });
    assert.equal(again.status, 200);
    assert.ok(again.body.items.length >= 2);
  });
});
