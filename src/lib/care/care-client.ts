/**
 * Client for the care network API (server/src/care). Every call is made as the
 * signed-in account, in one role at a time (patient, pharmacy or prescriber).
 * State-changing calls carry a one-time nonce and timestamp so a captured
 * request can't be replayed.
 */
import { AUTH_URL } from '@/lib/auth/passkey-client';

import type {
  AuditJson,
  GrantJson,
  InviteJson,
  PatientRefJson,
  ProviderJson,
  Role,
  RxJson,
  SnapshotJson,
  StatsJson,
  SummaryJson,
  WorkJson,
} from './protocol.gen';

export type CareRole = 'patient' | 'pharmacy' | 'prescriber';

/** A refused or failed request. `code` is stable (e.g. STEP_UP_REQUIRED, FORBIDDEN). */
export class CareError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CareError';
  }
}

/** 128 random bits, base64url. Uniqueness is what matters for replay protection. */
function nonce(): string {
  const bytes = new Uint8Array(16);
  const c = globalThis.crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type Options = { role?: CareRole; body?: unknown; query?: Record<string, string | number | undefined> };

async function call<T>(token: string, method: string, path: string, opts: Options = {}): Promise<T> {
  const query = Object.entries(opts.query ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    'x-dosely-role': opts.role ?? 'patient',
  };
  if (method !== 'GET') {
    headers['x-dosely-nonce'] = nonce();
    headers['x-dosely-timestamp'] = String(Date.now());
  }

  let res: Response;
  try {
    res = await fetch(`${AUTH_URL}/care${path}${query ? `?${query}` : ''}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new CareError('Could not reach the Dosely server.', 'OFFLINE', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new CareError(data.error ?? `Request failed (${res.status}).`, data.code ?? 'ERROR', res.status);
  return data as T;
}

type List<T> = { items: T[] };

export const care = {
  health: async (): Promise<boolean> => {
    try {
      const res = await fetch(`${AUTH_URL}/care/health`);
      return res.ok && ((await res.json()) as { ok?: boolean }).ok === true;
    } catch {
      return false;
    }
  },

  // Providers
  myProvider: (token: string) => call<ProviderJson>(token, 'GET', '/providers/me'),
  registerProvider: (token: string, provider: { role: Role; name: string; org?: string; npi: string }) =>
    call<ProviderJson>(token, 'PUT', '/providers/me', { body: { provider } }),

  // Consent
  createInvite: (token: string, invite: { role: Role; scopes: number; grantDays?: number }) =>
    call<InviteJson>(token, 'POST', '/invites', { body: invite }),
  redeemInvite: (token: string, role: CareRole, inviteToken: string) =>
    call<GrantJson>(token, 'POST', '/invites/redeem', { role, body: { token: inviteToken } }),
  grants: (token: string) => call<List<GrantJson>>(token, 'GET', '/grants').then((r) => r.items),
  revokeGrant: (token: string, role: CareRole, grantId: string) =>
    call<GrantJson>(token, 'DELETE', `/grants/${encodeURIComponent(grantId)}`, { role }),

  // Patient record
  share: (token: string, snapshot: SnapshotJson) =>
    call<SnapshotJson>(token, 'PUT', '/snapshot', { body: { snapshot } }),
  summary: (token: string, role: CareRole, patientId: string, previewScopes?: number) =>
    call<SummaryJson>(token, 'GET', `/patients/${encodeURIComponent(patientId)}/summary`, {
      role,
      query: { previewScopes },
    }),
  patients: (token: string, role: CareRole) =>
    call<List<PatientRefJson>>(token, 'GET', '/patients', { role }).then((r) => r.items),
  erase: (token: string) => call<{ ok: true }>(token, 'POST', '/erase'),

  // Prescriptions
  prescribe: (token: string, rx: RxJson) => call<RxJson>(token, 'POST', '/prescriptions', { role: 'prescriber', body: { rx } }),
  prescriptions: (token: string, role: CareRole, query: { patientId?: string; status?: number } = {}) =>
    call<List<RxJson>>(token, 'GET', '/prescriptions', { role, query }).then((r) => r.items),
  prescription: (token: string, role: CareRole, id: string) =>
    call<RxJson>(token, 'GET', `/prescriptions/${encodeURIComponent(id)}`, { role }),
  setRxStatus: (token: string, role: CareRole, id: string, status: number) =>
    call<RxJson>(token, 'POST', `/prescriptions/${encodeURIComponent(id)}/status`, { role, body: { status } }),

  // Operations
  worklist: (token: string, role: CareRole) =>
    call<List<WorkJson>>(token, 'GET', '/worklist', { role }).then((r) => r.items),
  accessLog: (token: string, role: CareRole = 'patient') =>
    call<List<AuditJson>>(token, 'GET', '/audit', { role }).then((r) => r.items),
  verifyLog: (token: string) => call<StatsJson>(token, 'GET', '/audit/verify'),
};

/** The shareable link a provider opens (or scans) to accept an invite. */
export function inviteLink(base: string, token: string): string {
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}redeem=${encodeURIComponent(token)}`;
}

/** Pull an invite token out of a pasted/scanned link, or accept a bare token. */
export function tokenFromInput(input: string): string | null {
  const text = input.trim();
  const match = /[?&]redeem=([A-Za-z0-9_%-]+)/.exec(text);
  const token = match ? decodeURIComponent(match[1]) : text;
  return /^[A-Za-z0-9_-]{40,1400}$/.test(token) ? token : null;
}
