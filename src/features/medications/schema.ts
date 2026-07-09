import { z } from 'zod';

/** Strict 24-hour "HH:MM". */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One combined form for a medication and how often it is taken. Optional text
 * fields allow empty strings (the UI uses '' for empty inputs); the store
 * converts '' to null when saving.
 */
export const medicationFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  // Set automatically when the user picks an RxNorm match; null for free text.
  rxcui: z.string().trim().max(20).nullable(),
  strength: z.string().trim().max(60),
  form: z.string().trim().max(60),
  times: z.array(z.string().regex(TIME_RE, 'Use HH:MM')).min(1, 'Add at least one time'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
});
export type MedicationFormValues = z.infer<typeof medicationFormSchema>;
