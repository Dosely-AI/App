import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_PALETTE } from '@/constants/palettes';
import { dateKey } from '@/features/adherence/dates';

import type {
  AuthSession,
  DoseLog,
  EmergencyInfo,
  Medication,
  Pharmacy,
  Profile,
  SymptomLog,
} from './types';

/** Fields a caller provides; id and createdAt are assigned by the store. */
export type MedicationInput = Omit<Medication, 'id' | 'createdAt'>;

/** Fields a caller provides for a pharmacy; id and createdAt are assigned by the store. */
export type PharmacyInput = Omit<Pharmacy, 'id' | 'createdAt'>;

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

  /** Selected appearance palette id — recolors the accent + aurora wallpaper. */
  palette: string;
  setPalette: (id: string) => void;

  addMedication: (input: MedicationInput) => Medication;
  updateMedication: (id: string, input: MedicationInput) => void;
  removeMedication: (id: string) => void;

  logDose: (medId: string, date: string, time: string) => void;
  unlogDose: (medId: string, date: string, time: string) => void;

  /** Log an as-needed (PRN) dose taken right now. */
  logPrnDose: (medId: string) => void;
  /** Remove today's most recently logged PRN dose (an "undo"). */
  undoLastPrnDose: (medId: string) => void;

  /** Symptom / how-you-feel journal. */
  symptoms: SymptomLog[];
  addSymptom: (note: string, severity: number) => void;
  removeSymptom: (id: string) => void;

  /** Emergency medical card details (null until the user fills it in). */
  emergency: EmergencyInfo | null;
  setEmergency: (info: EmergencyInfo) => void;

  /** Pharmacies the user fills prescriptions at (empty until they add one). */
  pharmacies: Pharmacy[];
  addPharmacy: (input: PharmacyInput) => Pharmacy;
  updatePharmacy: (id: string, input: PharmacyInput) => void;
  /** Remove a pharmacy and unlink any medications that referenced it. */
  removePharmacy: (id: string) => void;

  /** Logical modification time of the synced data (ISO), or null if never set. */
  dataUpdatedAt: string | null;
  /** Adopt a full snapshot pulled from the account (server wins). */
  applyServerData: (data: unknown, updatedAt: string) => void;

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

/** Logical modification time for synced data — LWW uses it to resolve conflicts. */
function stamp(): string {
  return new Date().toISOString();
}

/** The subset of state that syncs to the account. */
export type SyncedData = Pick<AppState, 'medications' | 'logs' | 'symptoms' | 'emergency' | 'pharmacies'>;

const sameSlot = (l: DoseLog, medId: string, date: string, time: string) =>
  l.medId === medId && l.date === date && l.time === time;

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      medications: [],
      logs: [],
      symptoms: [],
      emergency: null,
      pharmacies: [],
      dataUpdatedAt: null,
      profile: null,
      session: null,
      unlocked: false,
      hydrated: false,
      palette: DEFAULT_PALETTE,

      addMedication: (input) => {
        const med: Medication = { ...input, id: newId(), createdAt: new Date().toISOString() };
        set((s) => ({ medications: [...s.medications, med], dataUpdatedAt: stamp() }));
        return med;
      },

      updateMedication: (id, input) =>
        set((s) => ({
          medications: s.medications.map((m) => (m.id === id ? { ...m, ...input } : m)),
          dataUpdatedAt: stamp(),
        })),

      removeMedication: (id) =>
        set((s) => ({
          medications: s.medications.filter((m) => m.id !== id),
          logs: s.logs.filter((l) => l.medId !== id),
          dataUpdatedAt: stamp(),
        })),

      logDose: (medId, date, time) =>
        set((s) => {
          if (s.logs.some((l) => sameSlot(l, medId, date, time))) return s;
          return {
            logs: [...s.logs, { medId, date, time, takenAt: new Date().toISOString() }],
            dataUpdatedAt: stamp(),
          };
        }),

      unlogDose: (medId, date, time) =>
        set((s) => ({
          logs: s.logs.filter((l) => !sameSlot(l, medId, date, time)),
          dataUpdatedAt: stamp(),
        })),

      logPrnDose: (medId) =>
        set((s) => {
          const now = new Date();
          const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          return {
            logs: [...s.logs, { medId, date: dateKey(now), time, takenAt: now.toISOString() }],
            dataUpdatedAt: stamp(),
          };
        }),

      undoLastPrnDose: (medId) =>
        set((s) => {
          const today = dateKey(new Date());
          const todays = s.logs.filter((l) => l.medId === medId && l.date === today);
          if (todays.length === 0) return s;
          const last = todays.reduce((a, b) => (a.takenAt > b.takenAt ? a : b));
          return { logs: s.logs.filter((l) => l !== last), dataUpdatedAt: stamp() };
        }),

      addSymptom: (note, severity) =>
        set((s) => ({
          symptoms: [
            {
              id: newId(),
              date: dateKey(new Date()),
              severity,
              note: note.trim(),
              createdAt: new Date().toISOString(),
            },
            ...s.symptoms,
          ],
          dataUpdatedAt: stamp(),
        })),

      removeSymptom: (id) =>
        set((s) => ({ symptoms: s.symptoms.filter((x) => x.id !== id), dataUpdatedAt: stamp() })),

      setEmergency: (info) => set({ emergency: info, dataUpdatedAt: stamp() }),

      addPharmacy: (input) => {
        const pharmacy: Pharmacy = { ...input, id: newId(), createdAt: new Date().toISOString() };
        set((s) => ({ pharmacies: [...s.pharmacies, pharmacy], dataUpdatedAt: stamp() }));
        return pharmacy;
      },

      updatePharmacy: (id, input) =>
        set((s) => ({
          pharmacies: s.pharmacies.map((p) => (p.id === id ? { ...p, ...input } : p)),
          dataUpdatedAt: stamp(),
        })),

      removePharmacy: (id) =>
        set((s) => ({
          pharmacies: s.pharmacies.filter((p) => p.id !== id),
          medications: s.medications.map((m) => (m.pharmacyId === id ? { ...m, pharmacyId: null } : m)),
          dataUpdatedAt: stamp(),
        })),

      applyServerData: (data, updatedAt) => {
        const d = (data ?? {}) as Partial<SyncedData>;
        set({
          medications: Array.isArray(d.medications) ? d.medications : [],
          logs: Array.isArray(d.logs) ? d.logs : [],
          symptoms: Array.isArray(d.symptoms) ? d.symptoms : [],
          emergency: d.emergency ?? null,
          pharmacies: Array.isArray(d.pharmacies) ? d.pharmacies : [],
          dataUpdatedAt: updatedAt,
        });
      },

      setSession: (session) => set({ session }),

      setPalette: (palette) => set({ palette }),

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
        set({
          medications: [],
          logs: [],
          symptoms: [],
          emergency: null,
          pharmacies: [],
          dataUpdatedAt: stamp(),
          profile: null,
          session: null,
          unlocked: false,
        }),
    }),
    {
      name: 'dosely-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist data + profile, but never the in-memory `unlocked`/`hydrated` flags
      // or actions — a locked profile must re-authenticate on each launch.
      partialize: (s) => ({
        medications: s.medications,
        logs: s.logs,
        symptoms: s.symptoms,
        emergency: s.emergency,
        pharmacies: s.pharmacies,
        dataUpdatedAt: s.dataUpdatedAt,
        profile: s.profile,
        session: s.session,
        palette: s.palette,
      }),
      onRehydrateStorage: () => () => {
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);
