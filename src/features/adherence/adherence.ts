import { formatTime12 } from '@/features/medications/schedule';
import type { DoseLog, Medication } from '@/store/types';

import { dateKey, dayOfWeek } from './dates';

/**
 * Does this medication apply on the given date? A medication is never expected
 * before the day it was added (so days prior to it don't count as "missed"),
 * and an empty days-of-week list means every day.
 */
export function dayApplies(med: Medication, date: string): boolean {
  if (date < dateKey(new Date(med.createdAt))) return false;
  if (med.daysOfWeek.length === 0) return true;
  return med.daysOfWeek.includes(dayOfWeek(date));
}

/** The dose slots ("HH:MM") expected for a medication on a given date. */
export function expectedSlots(med: Medication, date: string): string[] {
  if (!dayApplies(med, date)) return [];
  return [...new Set(med.times)];
}

function logKey(medId: string, date: string, time: string): string {
  return `${medId}|${date}|${time}`;
}

function logLookup(logs: DoseLog[]): Set<string> {
  return new Set(logs.map((l) => logKey(l.medId, l.date, l.time)));
}

export type DailyPoint = {
  date: string;
  expected: number;
  taken: number;
  /** null when nothing was expected that day. */
  pct: number | null;
};

/** Per-day expected vs taken across all medications, for the given dates. */
export function computeDaily(meds: Medication[], logs: DoseLog[], days: string[]): DailyPoint[] {
  const taken = logLookup(logs);
  return days.map((date) => {
    let expected = 0;
    let done = 0;
    for (const med of meds) {
      for (const slot of expectedSlots(med, date)) {
        expected += 1;
        if (taken.has(logKey(med.id, date, slot))) done += 1;
      }
    }
    return { date, expected, taken: done, pct: expected === 0 ? null : Math.round((done / expected) * 100) };
  });
}

export type Totals = { expected: number; taken: number; pct: number | null };

/** Aggregate a set of daily points into an overall adherence figure. */
export function overall(daily: DailyPoint[]): Totals {
  const expected = daily.reduce((s, d) => s + d.expected, 0);
  const taken = daily.reduce((s, d) => s + d.taken, 0);
  return { expected, taken, pct: expected === 0 ? null : Math.round((taken / expected) * 100) };
}

export type MedAdherence = { medId: string; name: string } & Totals;

/** Adherence broken down per medication over the given dates. */
export function perMed(meds: Medication[], logs: DoseLog[], days: string[]): MedAdherence[] {
  const taken = logLookup(logs);
  return meds.map((med) => {
    let expected = 0;
    let done = 0;
    for (const date of days) {
      for (const slot of expectedSlots(med, date)) {
        expected += 1;
        if (taken.has(logKey(med.id, date, slot))) done += 1;
      }
    }
    return {
      medId: med.id,
      name: med.name,
      expected,
      taken: done,
      pct: expected === 0 ? null : Math.round((done / expected) * 100),
    };
  });
}

export type MissedDose = { medId: string; name: string; time: string };

/**
 * Doses scheduled for today whose time has passed (beyond a grace period) and
 * that haven't been logged. This powers caregiver alerts — "Mom missed her 8am
 * dose." A slot within the grace window isn't counted yet (it may just be late).
 */
export function missedDoses(
  meds: Medication[],
  logs: DoseLog[],
  now: Date = new Date(),
  graceMinutes = 30,
): MissedDose[] {
  const today = dateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const out: MissedDose[] = [];

  for (const med of meds) {
    for (const time of expectedSlots(med, today)) {
      const [h, m] = time.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) continue;
      // Only "missed" once the slot time plus grace has elapsed.
      if (h * 60 + m + graceMinutes > nowMinutes) continue;
      const taken = logs.some((l) => l.medId === med.id && l.date === today && l.time === time);
      if (!taken) out.push({ medId: med.id, name: med.name, time });
    }
  }
  return out;
}

/** Consecutive most-recent days fully taken. Days with nothing scheduled are
 * skipped (they neither break nor extend the streak). */
export function currentStreak(meds: Medication[], logs: DoseLog[], days: string[]): number {
  const daily = computeDaily(meds, logs, days);
  let streak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    const d = daily[i];
    if (d.expected === 0) continue;
    if (d.taken === d.expected) streak += 1;
    else break;
  }
  return streak;
}

export type Rating = {
  label: string;
  tone: 'success' | 'warning' | 'danger';
  blurb: string;
};

/** Map an adherence percentage to a supportive rating band. */
export function ratingFor(pct: number | null): Rating {
  if (pct === null) {
    return { label: 'No data yet', tone: 'warning', blurb: 'Log a few doses to see your rating.' };
  }
  if (pct >= 90) {
    return { label: 'Excellent', tone: 'success', blurb: 'You are taking your medications very consistently.' };
  }
  if (pct >= 75) {
    return { label: 'Good', tone: 'success', blurb: 'Solid consistency — a little tightening gets you to excellent.' };
  }
  if (pct >= 50) {
    return { label: 'Needs work', tone: 'warning', blurb: 'Several doses are being missed. Small changes can help a lot.' };
  }
  return { label: 'At risk', tone: 'danger', blurb: 'Many doses are being missed. Let us make this easier to keep up.' };
}

/**
 * Deterministic, rule-based adherence tips derived from the user's own pattern.
 * Rules-based (not AI) on purpose: tips must be safe, predictable, and never
 * invent medical guidance. At most three, most relevant first.
 */
export function generateTips(meds: Medication[], logs: DoseLog[], days: string[]): string[] {
  if (meds.length === 0) {
    return ['Add your medications and how often you take them to start tracking adherence.'];
  }

  const daily = computeDaily(meds, logs, days);
  const total = overall(daily);
  if (total.pct === null) {
    return ['Tap “I took it” on the Today tab when you take a dose — that is what builds your adherence picture.'];
  }

  const tips: string[] = [];
  const taken = logLookup(logs);

  // Worst time-of-day slot (needs enough occurrences to be meaningful).
  const slotStats = new Map<string, { expected: number; taken: number }>();
  for (const med of meds) {
    for (const date of days) {
      for (const slot of expectedSlots(med, date)) {
        const s = slotStats.get(slot) ?? { expected: 0, taken: 0 };
        s.expected += 1;
        if (taken.has(logKey(med.id, date, slot))) s.taken += 1;
        slotStats.set(slot, s);
      }
    }
  }
  let worst: { time: string; pct: number } | null = null;
  for (const [time, s] of slotStats) {
    if (s.expected < 3) continue;
    const pct = (s.taken / s.expected) * 100;
    if (worst === null || pct < worst.pct) worst = { time, pct };
  }
  if (worst && worst.pct < 80) {
    tips.push(
      `Your ${formatTime12(worst.time)} dose is the one missed most. Try linking it to something you already do at that time, like a meal.`,
    );
  }

  // Hardest medication.
  const ranked = perMed(meds, logs, days)
    .filter((m) => m.expected >= 3 && m.pct !== null)
    .sort((a, b) => (a.pct as number) - (b.pct as number));
  if (ranked.length > 1 && (ranked[0].pct as number) < 70) {
    tips.push(
      `${ranked[0].name} is missed more than your other medications. Keeping it somewhere you will see it at dose time helps.`,
    );
  }

  // General nudge by band.
  if (total.pct < 90 && tips.length < 3) {
    tips.push('A daily alarm for each dose time is one of the most effective ways to stay consistent.');
  } else if (total.pct >= 90 && tips.length < 3) {
    tips.push('Great consistency — keep it up. When you travel, pack an extra day of doses just in case.');
  }

  return tips.slice(0, 3);
}
