/**
 * Refill prediction. Pure, side-effect-free math so it is easy to unit test and
 * reason about. Given how a medication is dosed and a counted quantity on hand,
 * it projects how many units are left today and the date supply runs out.
 *
 * The estimate assumes doses are taken as scheduled (the same "days of supply"
 * math a pharmacy uses). It is an informational planning aid, not a guarantee.
 */

import { dateKey, parseDateKey } from '@/features/adherence/dates';
import type { Medication } from '@/store/types';

/** Default units per dose when a medication does not specify one. */
export const DEFAULT_PILLS_PER_DOSE = 1;
/** Default warning lead time before the projected run-out date. */
export const DEFAULT_LEAD_DAYS = 7;

/** Unique dose slots per applicable day. */
function slotsPerDay(med: Medication): number {
  return new Set(med.times).size;
}

/** How many days each week this medication is scheduled (empty list = daily). */
function applicableDaysPerWeek(med: Medication): number {
  const days = new Set(med.daysOfWeek);
  return days.size === 0 ? 7 : days.size;
}

/**
 * Average units consumed per calendar day, smoothing weekly schedules across
 * the whole week (e.g. a Mon/Wed/Fri pill averages to 3/7 of a dose per day).
 */
export function dailyConsumption(med: Medication): number {
  const perDose = med.pillsPerDose ?? DEFAULT_PILLS_PER_DOSE;
  const perApplicableDay = slotsPerDay(med) * perDose;
  return (perApplicableDay * applicableDaysPerWeek(med)) / 7;
}

/** Whole days from `from` to `to` (date keys); negative if `to` precedes `from`. */
function daysBetween(from: string, to: string): number {
  const ms = parseDateKey(to).getTime() - parseDateKey(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Add `n` whole days to a date key. */
function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export type RefillLevel =
  | 'untracked' // no quantity counted
  | 'unknown' // tracked, but the schedule consumes nothing (as-needed)
  | 'ok'
  | 'soon' // within the lead-time window
  | 'out'; // projected to be depleted

export type RefillStatus = {
  level: RefillLevel;
  /** Average units used per day (0 for as-needed schedules). */
  dailyConsumption: number;
  /** Units projected to remain today (rounded, never below 0). */
  remaining: number;
  /** Whole days of supply left; null when not tracked or not consumed. */
  daysLeft: number | null;
  /** Projected depletion date 'YYYY-MM-DD'; null when not tracked/consumed. */
  runOutDate: string | null;
  /** Lead-time threshold actually used. */
  leadDays: number;
};

/**
 * Project a medication's refill status as of `today` (a local date key,
 * defaulting to the current date).
 */
export function refillStatus(med: Medication, today: string = dateKey(new Date())): RefillStatus {
  const rate = dailyConsumption(med);
  const leadDays = med.refillLeadDays ?? DEFAULT_LEAD_DAYS;

  if (med.quantityOnHand == null || med.quantityAsOf == null) {
    return { level: 'untracked', dailyConsumption: rate, remaining: 0, daysLeft: null, runOutDate: null, leadDays };
  }

  // Units used since the count was taken (clamped so a future asOf can't add stock).
  const elapsed = Math.max(0, daysBetween(med.quantityAsOf, today));
  const remaining = Math.max(0, med.quantityOnHand - elapsed * rate);

  if (rate <= 0) {
    return {
      level: 'unknown',
      dailyConsumption: 0,
      remaining: Math.round(remaining),
      daysLeft: null,
      runOutDate: null,
      leadDays,
    };
  }

  const daysLeft = Math.floor(remaining / rate);
  const runOutDate = addDays(today, daysLeft);
  const level: RefillLevel = remaining <= 0 ? 'out' : daysLeft <= leadDays ? 'soon' : 'ok';

  return { level, dailyConsumption: rate, remaining: Math.round(remaining), daysLeft, runOutDate, leadDays };
}

/** True when a refill is worth surfacing to the user (soon or already out). */
export function needsRefillAttention(status: RefillStatus): boolean {
  return status.level === 'soon' || status.level === 'out';
}

export type MedRefill = { med: Medication; status: RefillStatus };

/**
 * Refill status for every medication that has tracking on, sorted most urgent
 * first (fewest days left). Untracked medications are omitted.
 */
export function upcomingRefills(meds: Medication[], today: string = dateKey(new Date())): MedRefill[] {
  return meds
    .map((med) => ({ med, status: refillStatus(med, today) }))
    .filter(({ status }) => status.level !== 'untracked')
    .sort((a, b) => (a.status.daysLeft ?? Infinity) - (b.status.daysLeft ?? Infinity));
}
