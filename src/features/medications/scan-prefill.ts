import { TIME_RE, type MedicationFormValues } from './schema';

/**
 * Scanner → form handoff. Kept pure (no React, no navigation) so the parsing
 * that feeds a medication record is unit-testable on its own.
 */

/** Query params handed over by the scanner. All optional and untrusted. */
export type ScanParams = {
  name?: string;
  strength?: string;
  form?: string;
  quantityOnHand?: string;
  /** Comma-separated "HH:MM" values suggested from the label directions. */
  times?: string;
  confidence?: string;
  source?: string;
};

/**
 * Turn scanner params into form values, dropping anything malformed. A scan is
 * a suggestion, so a bad field is silently omitted (leaving the input blank for
 * the user to fill) rather than pushed into the form as an error.
 */
export function prefillFrom(params: ScanParams): Partial<MedicationFormValues> {
  const times = (params.times ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => TIME_RE.test(t));

  const initial: Partial<MedicationFormValues> = {};
  if (params.name?.trim()) initial.name = params.name.trim();
  if (params.strength?.trim()) initial.strength = params.strength.trim();
  if (params.form?.trim()) initial.form = params.form.trim();
  if (params.quantityOnHand?.trim()) initial.quantityOnHand = params.quantityOnHand.trim();
  if (times.length > 0) initial.times = times;
  return initial;
}
