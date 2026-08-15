import { z } from 'zod';

/** Strict 24-hour "HH:MM". */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Optional numeric text field: empty string, or a non-negative number. */
const optionalCount = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d*\.?\d+$/.test(v) && Number(v) >= 0), 'Enter a number');

/**
 * One combined form for a medication and how often it is taken. Optional text
 * fields allow empty strings (the UI uses '' for empty inputs); the store
 * converts '' to null when saving.
 */
export const medicationFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    // Set automatically when the user picks an RxNorm match; null for free text.
    rxcui: z.string().trim().max(20).nullable(),
    strength: z.string().trim().max(60),
    form: z.string().trim().max(60),
    times: z.array(z.string().regex(TIME_RE, 'Use HH:MM')),
    daysOfWeek: z.array(z.number().int().min(0).max(6)),
    // Taken as needed (PRN) instead of on a schedule.
    asNeeded: z.boolean(),
    // Optional refill tracking. Empty strings mean "not tracking".
    pillsPerDose: optionalCount,
    quantityOnHand: optionalCount,
    refillLeadDays: optionalCount,
    // Optional safe daily maximum for as-needed dosing.
    maxPerDay: optionalCount,
    // Optional pharmacy link (for refill requests). Empty string / null = none.
    rxNumber: z.string().trim().max(40),
    pharmacyId: z.string().nullable(),
  })
  .superRefine((val, ctx) => {
    // A scheduled medication needs at least one time; an as-needed one needs none.
    if (!val.asNeeded && val.times.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['times'], message: 'Add at least one time' });
    }
  });
export type MedicationFormValues = z.infer<typeof medicationFormSchema>;
