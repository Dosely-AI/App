import { useEffect, useRef } from 'react';

import { AUTH_URL } from '@/lib/auth/passkey-client';
import { useAppStore } from '@/store/app-store';

import { decideSync, pickSynced, serializeSynced } from './sync-core';

/**
 * Mirrors the account's data to the backend. Runs only when a passkey session
 * exists (the web accounts path) — on native, which has no account yet, it's a
 * no-op. Pulls once on sign-in to reconcile, then pushes (debounced) on change.
 * If the server is unreachable the app keeps working entirely on-device.
 */

type Pulled = { data: unknown; updatedAt: string | null };

async function pull(token: string): Promise<Pulled | null> {
  try {
    const res = await fetch(`${AUTH_URL}/sync`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()) as Pulled;
  } catch {
    return null;
  }
}

async function push(token: string, data: unknown, updatedAt: string): Promise<boolean> {
  try {
    const res = await fetch(`${AUTH_URL}/sync`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ data, updatedAt }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isLocalEmpty(): boolean {
  const s = useAppStore.getState();
  return s.medications.length === 0 && s.logs.length === 0 && s.symptoms.length === 0 && !s.emergency;
}

export function useSync(): void {
  const token = useAppStore((s) => s.session?.token);
  // The last payload we know the server has, so store changes we caused (by
  // adopting server data) don't bounce straight back as a push.
  const lastSynced = useRef<string | null>(null);

  // Reconcile once whenever a session becomes available.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      const server = await pull(token);
      if (cancelled) return;

      const s = useAppStore.getState();
      const decision = decideSync({
        serverPresent: Boolean(server) && server?.data != null,
        localEmpty: isLocalEmpty(),
        serverUpdatedAt: server?.updatedAt ?? null,
        localUpdatedAt: s.dataUpdatedAt,
      });

      if (decision === 'adopt' && server) {
        s.applyServerData(server.data, server.updatedAt ?? new Date().toISOString());
      } else if (decision === 'push') {
        const cur = useAppStore.getState();
        await push(token, pickSynced(cur), cur.dataUpdatedAt ?? new Date().toISOString());
      }
      lastSynced.current = serializeSynced(useAppStore.getState());
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Push local changes to the account, debounced.
  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsub = useAppStore.subscribe((s) => {
      const payload = serializeSynced(s);
      if (payload === lastSynced.current) return; // no synced change
      clearTimeout(timer);
      timer = setTimeout(() => {
        const cur = useAppStore.getState();
        void push(token, pickSynced(cur), cur.dataUpdatedAt ?? new Date().toISOString()).then((ok) => {
          if (ok) lastSynced.current = serializeSynced(cur);
        });
      }, 1500);
    });

    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [token]);
}
