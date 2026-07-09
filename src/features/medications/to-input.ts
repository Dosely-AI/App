import type { MedicationInput } from '@/store/app-store';

import type { MedicationFormValues } from './schema';

/** Convert validated form values into a store medication (empty text -> null). */
export function formToInput(v: MedicationFormValues): MedicationInput {
  return {
    name: v.name.trim(),
    rxcui: v.rxcui,
    strength: v.strength.trim() || null,
    form: v.form.trim() || null,
    times: v.times,
    daysOfWeek: v.daysOfWeek,
  };
}
