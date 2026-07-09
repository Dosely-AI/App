import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { DoseLog, Medication } from './types';

/** Fields a caller provides; id and createdAt are assigned by the store. */
export type MedicationInput = Omit<Medication, 'id' | 'createdAt'>;

type AppState = {
  medications: Medication[];
  logs: DoseLog[];
  /** False until persisted data has been loaded from device storage. */
  hydrated: boolean;

  addMedication: (input: MedicationInput) => Medication;
  updateMedication: (id: string, input: MedicationInput) => void;
  removeMedication: (id: string) => void;

  logDose: (medId: string, date: string, time: string) => void;
  unlogDose: (medId: string, date: string, time: string) => void;

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

      resetAll: () => set({ medications: [], logs: [] }),
    }),
    {
      name: 'dosely-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist data, not the derived `hydrated` flag or the actions.
      partialize: (s) => ({ medications: s.medications, logs: s.logs }),
      onRehydrateStorage: () => () => {
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);
