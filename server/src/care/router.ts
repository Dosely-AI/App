/**
 * Care network API: connects patients with their pharmacy and prescribers.
 *
 * This layer authenticates (passkey session), rate-limits, blocks replays and
 * validates JSON; every authorization decision, all encryption and the audit
 * trail live in the vault. One account can act as a patient and, if
 * registered, as a pharmacy or prescriber — chosen per request with the
 * `X-Dosely-Role` header. Providers state a purpose of use with
 * `X-Dosely-Purpose` (treatment by default).
 */
import express, { Router } from 'express';
import type { Request, Response } from 'express';

import { decode, encode } from '../vault/codec.js';
import { VaultUnavailableError } from '../vault/client.js';
import type { VaultClient } from '../vault/client.js';
import { Cmd, Err, Purpose, Role } from '../vault/protocol.gen.js';
import type { ArgMsg, SchemaName } from '../vault/protocol.gen.js';
import { NonceCache, rateLimit, replayGuard, requireSession } from './guard.js';
import { RequestError, fromJson, toJson } from './json.js';

const ROLES: Record<string, Role> = { patient: Role.PATIENT, pharmacy: Role.PHARMACY, prescriber: Role.PRESCRIBER };
const PURPOSES: Record<string, Purpose> = {
  treatment: Purpose.TREATMENT,
  payment: Purpose.PAYMENT,
  operations: Purpose.OPERATIONS,
};

/** Vault error -> HTTP status and a stable string code for the client. */
const ERRORS: Record<number, [number, string]> = {
  [Err.BAD_REQUEST]: [400, 'BAD_REQUEST'],
  [Err.UNAUTHORIZED]: [401, 'UNAUTHORIZED'],
  [Err.FORBIDDEN]: [403, 'FORBIDDEN'],
  [Err.NOT_FOUND]: [404, 'NOT_FOUND'],
  [Err.CONFLICT]: [409, 'CONFLICT'],
  [Err.EXPIRED]: [410, 'EXPIRED'],
  [Err.STEP_UP_REQUIRED]: [401, 'STEP_UP_REQUIRED'],
  [Err.INTEGRITY]: [500, 'INTEGRITY'],
  [Err.INTERNAL]: [500, 'INTERNAL'],
  [Err.UNSUPPORTED]: [422, 'UNSUPPORTED'],
  [Err.LIMIT]: [413, 'LIMIT'],
  [Err.UNVERIFIED]: [403, 'UNVERIFIED'],
};

type Output = { schema: SchemaName } | { list: SchemaName } | { none: true };

// Fields a client may set on each writable record (ids, times and signatures are the vault's).
const SNAPSHOT_FIELDS = ['displayName', 'med', 'tzOffsetMin'];
const RX_DRAFT_FIELDS = [
  'patientId', 'pharmacyId', 'medId', 'drugName', 'rxcui', 'strength', 'form', 'sig',
  'quantityMilli', 'daysSupply', 'refills', 'controlled',
];
const PROVIDER_FIELDS = ['role', 'name', 'org', 'npi'];

function actingRole(req: Request): Role {
  const name = (req.header('x-dosely-role') ?? 'patient').toLowerCase();
  const role = ROLES[name];
  if (!role) throw new RequestError('X-Dosely-Role must be patient, pharmacy or prescriber');
  return role;
}

function purposeOf(req: Request, role: Role): Purpose {
  if (role === Role.PATIENT) return Purpose.PATIENT_REQUEST;
  const purpose = PURPOSES[(req.header('x-dosely-purpose') ?? 'treatment').toLowerCase()];
  if (!purpose) throw new RequestError('X-Dosely-Purpose must be treatment, payment or operations');
  return purpose;
}

function intQuery(req: Request, key: string, max: number): number | undefined {
  const raw = req.query[key];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (typeof raw !== 'string' || !Number.isSafeInteger(n) || n < 0 || n > max) throw new RequestError(`${key} is invalid`);
  return n;
}

function idParam(value: unknown, what: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new RequestError(`invalid ${what}`);
  return value;
}

export function careRouter(vault: VaultClient): Router {
  const router = Router();
  const nonces = new NonceCache();

  router.use(express.json({ limit: '256kb', strict: true }));

  /** Public: is the care network running? */
  router.get('/health', async (_req, res) => {
    if (!vault.available()) return res.json({ ok: false });
    try {
      const reply = await vault.request(Cmd.HELLO, { Id: 'system', Role: Role.SYSTEM });
      const hello = reply.result ? decode('Hello', reply.result) : {};
      return res.json({ ok: reply.status === Err.OK, systemKey: hello.SystemKey && Buffer.from(hello.SystemKey).toString('base64url') });
    } catch {
      return res.json({ ok: false });
    }
  });

  router.use(requireSession, rateLimit(), replayGuard(nonces));

  /** Run one vault command for the signed-in user and send the result as JSON. */
  async function run(
    req: Request,
    res: Response,
    command: Cmd,
    output: Output,
    args: () => ArgMsg = () => ({}),
    role?: Role,
  ) {
    try {
      const requested = actingRole(req); // always validated, even where the role is fixed
      const acting = role ?? requested;
      const reply = await vault.request(
        command,
        { Id: req.care!.userId, Role: acting },
        args(),
        { Purpose: purposeOf(req, acting), StepUpAtMs: req.care!.issuedAtMs },
      );
      if (reply.status !== Err.OK) {
        const [http, code] = ERRORS[reply.status] ?? [500, 'INTERNAL'];
        if (http >= 500) console.error(`[care] vault ${code} on command ${command}`);
        return res.status(http).json({ error: http >= 500 ? 'Something went wrong. Please try again.' : reply.error, code });
      }
      const result = reply.result ?? new Uint8Array(0);
      if ('schema' in output) return res.json(toJson(output.schema, decode(output.schema, result)));
      if ('list' in output) {
        const items = decode('List', result).Item ?? [];
        return res.json({ items: items.map((b) => toJson(output.list, decode(output.list, b))) });
      }
      return res.json({ ok: true });
    } catch (err) {
      if (err instanceof RequestError) return res.status(err.status).json({ error: err.message, code: 'BAD_REQUEST' });
      if (err instanceof VaultUnavailableError) {
        console.error(`[care] ${err.message}`);
        return res.status(503).json({ error: 'The care network is temporarily unavailable.', code: 'UNAVAILABLE' });
      }
      console.error('[care] unexpected error', err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' });
    }
  }

  // --- Providers ---------------------------------------------------------------------
  router.get('/providers/me', (req, res) =>
    run(req, res, Cmd.PROVIDER_GET, { schema: 'Provider' }, () => ({ ProviderId: req.care!.userId }), Role.PATIENT),
  );
  router.put('/providers/me', (req, res) => {
    // Act in the role being registered; the vault rejects any mismatch.
    const acting = req.body?.provider?.role === Role.PRESCRIBER ? Role.PRESCRIBER : Role.PHARMACY;
    return run(req, res, Cmd.PROVIDER_REGISTER, { schema: 'Provider' }, () => ({
      Record: encode('Provider', fromJson('Provider', req.body?.provider, PROVIDER_FIELDS)),
    }), acting);
  });
  router.get('/providers/:id', (req, res) =>
    run(req, res, Cmd.PROVIDER_GET, { schema: 'Provider' }, () => ({ ProviderId: idParam(req.params.id, 'provider id') })),
  );

  // --- Consent -----------------------------------------------------------------------------
  router.post('/invites', (req, res) =>
    run(req, res, Cmd.INVITE_CREATE, { schema: 'Invite' }, () =>
      fromJson('Arg', req.body ?? {}, ['role', 'scopes', 'grantDays', 'expiresInMs']), Role.PATIENT),
  );
  router.post('/invites/redeem', (req, res) =>
    run(req, res, Cmd.INVITE_REDEEM, { schema: 'Grant' }, () => fromJson('Arg', req.body ?? {}, ['token'])),
  );
  router.get('/grants', (req, res) => run(req, res, Cmd.GRANT_LIST, { list: 'Grant' }, undefined, Role.PATIENT));
  router.delete('/grants/:id', (req, res) =>
    run(req, res, Cmd.GRANT_REVOKE, { schema: 'Grant' }, () => ({ GrantId: idParam(req.params.id, 'grant id') })),
  );

  // --- Patient record ------------------------------------------------------------------------
  router.put('/snapshot', (req, res) =>
    run(req, res, Cmd.SNAPSHOT_PUT, { schema: 'Snapshot' }, () => ({
      Record: encode('Snapshot', fromJson('Snapshot', req.body?.snapshot, SNAPSHOT_FIELDS)),
    }), Role.PATIENT),
  );
  router.get('/patients', (req, res) => run(req, res, Cmd.PROVIDER_PATIENTS, { list: 'PatientRef' }));
  router.get('/patients/:id/summary', (req, res) =>
    run(req, res, Cmd.PATIENT_SUMMARY, { schema: 'Summary' }, () => ({
      PatientId: idParam(req.params.id, 'patient id'),
      Scopes: intQuery(req, 'previewScopes', 0xffff),
    })),
  );
  router.post('/erase', (req, res) => run(req, res, Cmd.PATIENT_ERASE, { none: true }, undefined, Role.PATIENT));

  // --- Prescriptions ---------------------------------------------------------------------------
  router.post('/prescriptions', (req, res) =>
    run(req, res, Cmd.RX_CREATE, { schema: 'Rx' }, () => ({
      Record: encode('Rx', fromJson('Rx', req.body?.rx, RX_DRAFT_FIELDS)),
    }), Role.PRESCRIBER),
  );
  router.get('/prescriptions', (req, res) =>
    run(req, res, Cmd.RX_LIST, { list: 'Rx' }, () => ({
      PatientId: req.query.patientId === undefined ? undefined : idParam(req.query.patientId, 'patient id'),
      Status: intQuery(req, 'status', 6),
      Limit: intQuery(req, 'limit', 200),
    })),
  );
  router.get('/prescriptions/:id', (req, res) =>
    run(req, res, Cmd.RX_GET, { schema: 'Rx' }, () => ({ RxId: idParam(req.params.id, 'prescription id') })),
  );
  router.post('/prescriptions/:id/status', (req, res) =>
    run(req, res, Cmd.RX_SET_STATUS, { schema: 'Rx' }, () => ({
      RxId: idParam(req.params.id, 'prescription id'),
      Status: fromJson('Arg', req.body ?? {}, ['status']).Status,
    })),
  );

  // --- Operations -------------------------------------------------------------------------------
  router.get('/worklist', (req, res) =>
    run(req, res, Cmd.WORKLIST, { list: 'Work' }, () => ({ Limit: intQuery(req, 'limit', 500) })),
  );
  router.get('/audit', (req, res) =>
    run(req, res, Cmd.AUDIT_QUERY, { list: 'Audit' }, () => ({
      PatientId: req.query.patientId === undefined ? undefined : idParam(req.query.patientId, 'patient id'),
      Limit: intQuery(req, 'limit', 500),
    })),
  );
  router.get('/audit/verify', (req, res) => run(req, res, Cmd.AUDIT_VERIFY, { schema: 'Stats' }));

  return router;
}
