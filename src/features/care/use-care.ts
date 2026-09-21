import { useCallback, useEffect, useRef } from 'react';

import { signInWithPasskey } from '@/lib/auth/passkey-client';
import { care, CareError } from '@/lib/care/care-client';
import { useAppStore } from '@/store/app-store';

import { buildSnapshot, snapshotKey } from './care';

/**
 * The signed-in account plus `run`, which performs a care request and handles
 * step-up transparently: if the vault asks the user to confirm it's them
 * (prescribing, erasing), the passkey prompt appears once and the request is
 * retried with the fresh session. No passwords, no extra screens.
 */
export function useCareSession() {
  const session = useAppStore((s) => s.session);
  const setSession = useAppStore((s) => s.setSession);

  const run = useCallback(
    async <T>(request: (token: string) => Promise<T>): Promise<T> => {
      if (!session) throw new CareError('Sign in with a passkey to use the care network.', 'UNAUTHORIZED', 401);
      try {
        return await request(session.token);
      } catch (err) {
        if (!(err instanceof CareError) || err.code !== 'STEP_UP_REQUIRED') throw err;
        const auth = await signInWithPasskey();
        if (auth.status !== 'ok') throw new CareError('Confirmation was cancelled.', 'CANCELLED', 0);
        setSession(auth.session);
        return request(auth.session.token);
      }
    },
    [session, setSession],
  );

  return { session, run };
}

/**
 * Keeps the patient's shared snapshot current while sharing is on: a few
 * seconds after medications or doses change, the new snapshot is uploaded
 * (encrypted by the vault under the patient's own key). Unchanged data is not
 * re-sent. Mounted once at the app root.
 */
export function useCareAutoShare() {
  const session = useAppStore((s) => s.session);
  const sharing = useAppStore((s) => s.careSharing);
  const meds = useAppStore((s) => s.medications);
  const logs = useAppStore((s) => s.logs);
  const name = useAppStore((s) => s.profile?.name ?? s.session?.name ?? '');
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!session || !sharing) return;
    const timer = setTimeout(() => {
      const snapshot = buildSnapshot(name, meds, logs);
      const key = snapshotKey(snapshot);
      if (key === lastSent.current) return;
      care
        .share(session.token, snapshot)
        .then(() => {
          lastSent.current = key;
        })
        .catch(() => {
          // Offline or signed out: the next change (or app start) retries.
        });
    }, 4000);
    return () => clearTimeout(timer);
  }, [session, sharing, meds, logs, name]);
}
