import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AuthSession, DoseLog, Medication, Profile } from './types';

/** Fields a caller provides; id and createdAt are assigned by the store. */
export type MedicationInput = Omit<Medication, 'id' | 'createdAt'>;

type AppState = {
  medications: Medication[];
  logs: DoseLog[];
  /** The local profile, or null before the user has set one up. */
  profile: Profile | null;
  /** A server-backed passkey account (web path), or null when not signed in. */
  session: AuthSession | null;
  /**
   * Whether the app is unlocked for this session. In-memory only (never
   * persisted) so a biometric-locked profile must re-authenticate each launch.
   */
  unlocked: boolean;
  /** False until persisted data has been loaded from device storage. */
  hydrated: boolean;

  addMedication: (input: MedicationInput) => Medication;
  updateMedication: (id: string, input: MedicationInput) => void;
  removeMedication: (id: string) => void;

  logDose: (medId: string, date: string, time: string) => void;
  unlogDose: (medId: string, date: string, time: string) => void;

  /** Store a passkey session after a successful sign up / sign in. */
  setSession: (session: AuthSession) => void;
  /** Create or replace the local profile (used by sign up and profile edit). */
  setProfile: (name: string, biometricLock: boolean) => void;
  /** Mark the app unlocked for this session (after a successful auth). */
  unlock: () => void;
  /** Re-lock the app (returns the user to the lock screen). */
  lock: () => void;
  /** Remove the profile and lock — returns the user to sign up. */
  signOut: () => void;

  resetAll: () => void;
};

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const sameSlot = (l: DoseLog, medId: string, date: string, time: string) =>
  l.medId === medId && l.date === date && l.time === time;

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      medications: [],
      logs: [],
      profile: null,
      session: null,
      unlocked: false,
      hydrated: false,

      addMedication: (input) => {
        const med: Medication = { ...input, id: newId(), createdAt: new Date().toISOString() };
        set((s) => ({ medications: [...s.medications, med] }));
        return med;
      },

      updateMedication: (id, input) =>
        set((s) => ({
          medications: s.medications.map((m) => (m.id === id ? { ...m, ...input } : m)),
        })),

      removeMedication: (id) =>
        set((s) => ({
          medications: s.medications.filter((m) => m.id !== id),
          logs: s.logs.filter((l) => l.medId !== id),
        })),

      logDose: (medId, date, time) =>
        set((s) => {
          if (s.logs.some((l) => sameSlot(l, medId, date, time))) return s;
          return { logs: [...s.logs, { medId, date, time, takenAt: new Date().toISOString() }] };
        }),

      unlogDose: (medId, date, time) =>
        set((s) => ({ logs: s.logs.filter((l) => !sameSlot(l, medId, date, time)) })),

      setSession: (session) => set({ session }),

      setProfile: (name, biometricLock) =>
        set((s) => ({
          profile: {
            name: name.trim(),
            biometricLock,
            createdAt: s.profile?.createdAt ?? new Date().toISOString(),
          },
          unlocked: true,
        })),

      unlock: () => set({ unlocked: true }),
      lock: () => set({ unlocked: false }),
      signOut: () => set({ profile: null, session: null, unlocked: false }),

      resetAll: () =>
        set({ medications: [], logs: [], profile: null, session: null, unlocked: false }),
    }),
    {
      name: 'dosely-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist data + profile, but never the in-memory `unlocked`/`hydrated` flags
      // or actions — a locked profile must re-authenticate on each launch.
      partialize: (s) => ({
        medications: s.medications,
        logs: s.logs,
        profile: s.profile,
        session: s.session,
      }),
      onRehydrateStorage: () => () => {
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);
