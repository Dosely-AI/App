import { dateKey } from '@/features/adherence/dates';
import type { MedicationInput } from '@/store/app-store';

import type { MedicationFormValues } from './schema';

/** Empty string -> null; otherwise the parsed number. */
function toNumber(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** The prior refill count, so we only re-stamp "as of today" on a real change. */
type PrevRefill = { quantityOnHand: number | null; quantityAsOf: string | null };

/** Convert validated form values into a store medication (empty text -> null). */
export function formToInput(v: MedicationFormValues, prev?: PrevRefill): MedicationInput {
  const quantityOnHand = toNumber(v.quantityOnHand);

  // Keep the original count date if the number is unchanged; otherwise the count
  // was just taken, so stamp today. Null quantity means tracking is off.
  let quantityAsOf: string | null = null;
  if (quantityOnHand != null) {
    quantityAsOf =
      prev && prev.quantityOnHand === quantityOnHand && prev.quantityAsOf
        ? prev.quantityAsOf
        : dateKey(new Date());
  }

  return {
    name: v.name.trim(),
    rxcui: v.rxcui,
    strength: v.strength.trim() || null,
    form: v.form.trim() || null,
    times: v.times,
    daysOfWeek: v.daysOfWeek,
    pillsPerDose: toNumber(v.pillsPerDose),
    quantityOnHand,
    quantityAsOf,
    refillLeadDays: toNumber(v.refillLeadDays),
  };
}
