import type { SyncedData } from '@/store/app-store';

/**
 * Pure sync-decision logic, separated so it can be unit-tested without a network
 * or a running store. Last-write-wins by logical modification time — good enough
 * for one person across their own devices (rare true-concurrent edits).
 */

export type SyncInputs = {
  /** Does the account have any stored data yet? */
  serverPresent: boolean;
  /** Is the local device's synced data empty (a fresh sign-in)? */
  localEmpty: boolean;
  serverUpdatedAt: string | null;
  localUpdatedAt: string | null;
};

export type SyncDecision = 'adopt' | 'push' | 'in-sync';

export function decideSync(p: SyncInputs): SyncDecision {
  if (!p.serverPresent) return p.localEmpty ? 'in-sync' : 'push';
  if (p.localEmpty) return 'adopt';

  const server = p.serverUpdatedAt ?? '';
  const local = p.localUpdatedAt ?? '';
  if (server > local) return 'adopt';
  if (local > server) return 'push';
  return 'in-sync';
}

/** Stable serialization of the synced slice, for change detection. */
export function serializeSynced(s: Pick<SyncedData, keyof SyncedData>): string {
  return JSON.stringify({
    medications: s.medications,
    logs: s.logs,
    symptoms: s.symptoms,
    emergency: s.emergency,
  });
}

export function pickSynced(s: SyncedData): SyncedData {
  return { medications: s.medications, logs: s.logs, symptoms: s.symptoms, emergency: s.emergency };
}
