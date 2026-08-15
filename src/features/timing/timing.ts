import { expectedSlots } from '@/features/adherence/adherence';
import { dateKey, lastNDays, parseDateKey } from '@/features/adherence/dates';
import type { DoseLog, Medication } from '@/store/types';

/**
 * Dose-timing analysis: how late each dose was taken, and which were missed.
 *
 * Product rule: a dose logged on a *later calendar day* than it was scheduled is
 * treated as **missed** (a red mark on the graph), NOT a ~24h delay. Delay is
 * only meaningful within the scheduled day.
 */

/** Doses taken within this many minutes of the scheduled time count as "on time". */
export const ONTIME_GRACE_MIN = 30;

export type DoseStatus = 'onTime' | 'late' | 'missed' | 'upcoming';

export type DoseTiming = {
  medId: string;
  name: string;
  date: string; // slot date 'YYYY-MM-DD'
  time: string; // 'HH:MM'
  scheduledMs: number;
  status: DoseStatus;
  /** Minutes late (>= 0) when taken; null for missed/upcoming. Early = 0. */
  delayMinutes: number | null;
};

/** Absolute local time (ms) for a scheduled 'YYYY-MM-DD' + 'HH:MM'. */
export function scheduledMsFor(date: string, time: string): number {
  const d = parseDateKey(date);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function logIndex(logs: DoseLog[]): Map<string, DoseLog> {
  const map = new Map<string, DoseLog>();
  for (const l of logs) map.set(`${l.medId}|${l.date}|${l.time}`, l);
  return map;
}

/** Timing record for every expected dose across the given day keys. */
export function doseTimings(
  meds: Medication[],
  logs: DoseLog[],
  days: string[],
  now: Date = new Date(),
): DoseTiming[] {
  const byKey = logIndex(logs);
  const nowMs = now.getTime();
  const out: DoseTiming[] = [];

  for (const date of days) {
    for (const med of meds) {
      for (const time of expectedSlots(med, date)) {
        const scheduledMs = scheduledMsFor(date, time);
        const log = byKey.get(`${med.id}|${date}|${time}`);
        let status: DoseStatus;
        let delayMinutes: number | null = null;

        if (log) {
          const takenMs = new Date(log.takenAt).getTime();
          if (dateKey(new Date(log.takenAt)) > date) {
            // Logged on a later day -> counts as missed, not a huge delay.
            status = 'missed';
          } else {
            delayMinutes = Math.max(0, Math.round((takenMs - scheduledMs) / 60000));
            status = delayMinutes <= ONTIME_GRACE_MIN ? 'onTime' : 'late';
          }
        } else if (scheduledMs > nowMs) {
          status = 'upcoming';
        } else {
          status = 'missed';
        }

        out.push({ medId: med.id, name: med.name, date, time, scheduledMs, status, delayMinutes });
      }
    }
  }

  out.sort((a, b) => a.scheduledMs - b.scheduledMs);
  return out;
}

export type TimingStats = {
  /** Doses whose time has passed (excludes upcoming). */
  total: number;
  taken: number; // onTime + late
  onTime: number;
  late: number;
  missed: number;
  avgDelayMin: number | null; // over taken doses
  medianDelayMin: number | null;
  onTimeRate: number | null; // % of taken doses that were on time
  missedRate: number | null; // % of past doses that were missed
};

export function timingStats(timings: DoseTiming[]): TimingStats {
  const past = timings.filter((t) => t.status !== 'upcoming');
  const takenArr = past.filter((t) => t.status === 'onTime' || t.status === 'late');
  const delays = takenArr.map((t) => t.delayMinutes ?? 0);
  const onTime = past.filter((t) => t.status === 'onTime').length;
  const missed = past.filter((t) => t.status === 'missed').length;
  const sorted = [...delays].sort((a, b) => a - b);

  return {
    total: past.length,
    taken: takenArr.length,
    onTime,
    late: takenArr.length - onTime,
    missed,
    avgDelayMin: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    medianDelayMin: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    onTimeRate: takenArr.length ? Math.round((onTime / takenArr.length) * 100) : null,
    missedRate: past.length ? Math.round((missed / past.length) * 100) : null,
  };
}

export type DailyTiming = {
  date: string;
  taken: number;
  missed: number;
  avgDelayMin: number | null; // over taken doses that day
};

/** One point per day for the timing graph. */
export function dailyTimings(timings: DoseTiming[], days: string[]): DailyTiming[] {
  const byDate = new Map<string, DoseTiming[]>();
  for (const t of timings) {
    const list = byDate.get(t.date);
    if (list) list.push(t);
    else byDate.set(t.date, [t]);
  }
  return days.map((date) => {
    const list = byDate.get(date) ?? [];
    const delays = list
      .filter((t) => t.status === 'onTime' || t.status === 'late')
      .map((t) => t.delayMinutes ?? 0);
    return {
      date,
      taken: delays.length,
      missed: list.filter((t) => t.status === 'missed').length,
      avgDelayMin: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    };
  });
}

export type TimingInsight = {
  /** Short clinical term, e.g. "Medication nonadherence". */
  term: string;
  headline: string;
  body: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
};

/**
 * A short, grounded read on the pattern using established clinical terminology
 * (the language clinicians and health systems use — e.g. "medication
 * nonadherence"). Rule-based and non-diagnostic on purpose; the UI pairs it with
 * a "not medical advice" disclaimer.
 */
export function timingInsight(stats: TimingStats): TimingInsight {
  if (stats.total < 3) {
    return {
      term: 'Not enough data yet',
      headline: 'Keep logging your doses',
      body: 'Log doses over a few days and a timing picture — how often and how promptly you take your medications — will appear here.',
      tone: 'neutral',
    };
  }

  const missedRate = stats.missedRate ?? 0;
  const avg = stats.avgDelayMin ?? 0;

  if (missedRate >= 50) {
    return {
      term: 'Medication nonadherence',
      headline: 'Doses are frequently missed',
      body: 'More than half of your scheduled doses in this period were not logged as taken. Clinicians call a consistent pattern of missing or mistiming medication "medication nonadherence," and it can meaningfully reduce how well a treatment works. It is common and usually fixable — a pharmacist or doctor can help identify what gets in the way (cost, side effects, forgetfulness, or a schedule that is hard to keep).',
      tone: 'danger',
    };
  }

  if (missedRate >= 20) {
    return {
      term: 'Suboptimal adherence',
      headline: 'Several doses are being missed',
      body: 'A meaningful share of doses in this period were missed. Even partial "medication nonadherence" can lower a treatment\'s benefit. Simple aids — reminders, a pill organizer, or linking doses to a daily routine — often help. Consider mentioning the pattern to your pharmacist.',
      tone: 'warning',
    };
  }

  if (avg > 90 && stats.taken > 0) {
    return {
      term: 'Inconsistent dose timing',
      headline: 'Doses are usually taken, but late',
      body: 'You take most doses, but often well after the scheduled time (averaging over an hour and a half late). For some medications, consistent timing matters nearly as much as taking them at all. Ask your pharmacist whether timing is important for yours.',
      tone: 'warning',
    };
  }

  if (avg > ONTIME_GRACE_MIN) {
    return {
      term: 'Minor timing drift',
      headline: 'Mostly on schedule',
      body: 'You take your doses reliably, usually within about an hour of schedule. That is solid consistency; tightening the timing a little is easy if your medication is time-sensitive.',
      tone: 'success',
    };
  }

  return {
    term: 'Good adherence',
    headline: 'Consistent and on time',
    body: 'You are taking your medications consistently and close to schedule. This is exactly the pattern that gets the most benefit from a treatment — keep it up.',
    tone: 'success',
  };
}

// ---------------------------------------------------------------------------
// Helpers for the "big dose button" on the home screen.
// ---------------------------------------------------------------------------

export type DoseSlot = {
  medId: string;
  name: string;
  date: string;
  time: string;
  scheduledMs: number;
  taken: boolean;
};

/** Expected dose slots across the given days, each flagged taken/not, by time. */
export function doseSlots(meds: Medication[], logs: DoseLog[], days: string[]): DoseSlot[] {
  const takenSet = new Set(logs.map((l) => `${l.medId}|${l.date}|${l.time}`));
  const out: DoseSlot[] = [];
  for (const date of days) {
    for (const med of meds) {
      for (const time of expectedSlots(med, date)) {
        out.push({
          medId: med.id,
          name: med.name,
          date,
          time,
          scheduledMs: scheduledMsFor(date, time),
          taken: takenSet.has(`${med.id}|${date}|${time}`),
        });
      }
    }
  }
  out.sort((a, b) => a.scheduledMs - b.scheduledMs);
  return out;
}

/**
 * The single dose the big button should surface: the most-recently-due dose not
 * yet taken (so it switches to a newer medication as its time arrives), else the
 * soonest upcoming dose, else null (all caught up).
 */
export function primaryDose(slots: DoseSlot[], now: Date = new Date()): DoseSlot | null {
  const nowMs = now.getTime();
  const untaken = slots.filter((s) => !s.taken);
  const due = untaken.filter((s) => s.scheduledMs <= nowMs);
  if (due.length) return due[due.length - 1];
  const upcoming = untaken.filter((s) => s.scheduledMs > nowMs);
  return upcoming.length ? upcoming[0] : null;
}

/** Dose slots from the last `hours` window (default 24h), for the timeline dropdown. */
export function recentDoseSlots(
  meds: Medication[],
  logs: DoseLog[],
  now: Date = new Date(),
  hours = 24,
): DoseSlot[] {
  const days = [...new Set([dateKey(new Date(now.getTime() - hours * 3_600_000)), dateKey(now)])];
  const cutoff = now.getTime() - hours * 3_600_000;
  return doseSlots(meds, logs, days).filter((s) => s.scheduledMs >= cutoff);
}

/** Day keys for the timing graph window. */
export function windowDays(kind: 'week' | 'month' | 'all', meds: Medication[], now: Date = new Date()): string[] {
  if (kind === 'week') return lastNDays(7, now);
  if (kind === 'month') return lastNDays(30, now);
  // "all": from the earliest medication add-date to today, capped at a year.
  if (meds.length === 0) return lastNDays(7, now);
  const earliest = meds.reduce((min, m) => (m.createdAt < min ? m.createdAt : min), meds[0].createdAt);
  const startKey = dateKey(new Date(earliest));
  const today = dateKey(now);
  const spanDays = Math.round((parseDateKey(today).getTime() - parseDateKey(startKey).getTime()) / 86_400_000) + 1;
  return lastNDays(Math.min(Math.max(spanDays, 7), 365), now);
}
