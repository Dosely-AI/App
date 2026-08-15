/**
 * As-needed (PRN) dosing. Pure helpers for medications taken when needed rather
 * than on a schedule. Because a PRN medication has no fixed times, it never
 * appears in the adherence math (which is driven by expected slots) — instead we
 * simply count the doses logged today and compare them against an optional safe
 * daily maximum.
 *
 * The maximum is a soft, informational guardrail grounded in labeling / a
 * pharmacist's guidance — never a hard block. DoselyAI is not medical advice.
 */

import { dateKey } from '@/features/adherence/dates';
import type { DoseLog, Medication } from '@/store/types';

/** True when a medication is taken as needed rather than on a schedule. */
export function isAsNeeded(med: Pick<Medication, 'asNeeded'>): boolean {
  return med.asNeeded === true;
}

export type PrnStatus = {
  /** Doses logged for this medication today. */
  count: number;
  /** The configured safe daily maximum, or null if none is set. */
  max: number | null;
  /** Doses remaining before the maximum (0 once reached); null if no max. */
  remaining: number | null;
  /** True once the count meets the maximum (a max must be set). */
  atLimit: boolean;
  /** True once the count exceeds the maximum. */
  overLimit: boolean;
  /** ISO timestamp of the most recent dose today, or null if none. */
  lastTakenAt: string | null;
};

/** Today's logged doses for a medication, oldest first. */
export function prnLogsToday(
  med: Pick<Medication, 'id'>,
  logs: DoseLog[],
  today: string = dateKey(new Date()),
): DoseLog[] {
  return logs
    .filter((l) => l.medId === med.id && l.date === today)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/** Count today's doses and compare against the medication's daily maximum. */
export function prnStatus(
  med: Pick<Medication, 'id' | 'maxPerDay'>,
  logs: DoseLog[],
  today: string = dateKey(new Date()),
): PrnStatus {
  const todays = prnLogsToday(med, logs, today);
  const count = todays.length;
  const max = med.maxPerDay ?? null;
  return {
    count,
    max,
    remaining: max == null ? null : Math.max(0, max - count),
    atLimit: max != null && count >= max,
    overLimit: max != null && count > max,
    lastTakenAt: count > 0 ? todays[count - 1].takenAt : null,
  };
}

/** Short "time since" label for the last dose, e.g. "just now", "3h ago". */
export function timeSince(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
