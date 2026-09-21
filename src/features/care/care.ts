/**
 * Care network: pure helpers shared by the patient hub and the provider portal.
 *
 * The vault enforces every rule; these mirror them only so the UI never offers
 * an action that would be refused, and speaks in plain language.
 */
import { perMed } from '@/features/adherence/adherence';
import { lastNDays } from '@/features/adherence/dates';
import { refillStatus } from '@/features/refill/refill';
import { doseTimings } from '@/features/timing/timing';
import {
  RefillLevel,
  RiskReason,
  Role,
  RxStatus,
  Scope,
  WorkKind,
  type MedJson,
  type RxJson,
  type SnapshotJson,
} from '@/lib/care/protocol.gen';
import type { DoseLog, Medication } from '@/store/types';

// --- Consent scopes -------------------------------------------------------------

export type ScopeInfo = { flag: number; label: string; detail: string };

/** What each permission means, in the words a patient would use. */
export const SCOPES: readonly ScopeInfo[] = [
  { flag: Scope.READ_MEDS, label: 'Medication list', detail: 'Names, strengths and forms. Always included.' },
  { flag: Scope.READ_REFILL, label: 'Refills', detail: 'How much you have left and when you will run out.' },
  { flag: Scope.READ_ADHERENCE, label: 'Adherence', detail: 'How often doses are taken, and refill history.' },
  { flag: Scope.READ_TIMING, label: 'Dose timing', detail: 'How late doses tend to be taken.' },
  { flag: Scope.RECEIVE_RX, label: 'Receive prescriptions', detail: 'Your prescribers can send prescriptions here.' },
  { flag: Scope.PRESCRIBE, label: 'Send prescriptions', detail: 'Can send signed prescriptions to your pharmacy.' },
];

/** Scopes that make sense for each kind of provider. */
export function scopesFor(role: Role): readonly ScopeInfo[] {
  return SCOPES.filter((s) =>
    role === Role.PHARMACY ? s.flag !== Scope.PRESCRIBE : role === Role.PRESCRIBER ? s.flag !== Scope.RECEIVE_RX : false,
  );
}

/** Sensible starting points: what a pharmacy or prescriber usually needs. */
export const DEFAULT_SCOPES: Record<number, number> = {
  [Role.PHARMACY]: Scope.READ_MEDS | Scope.READ_REFILL | Scope.RECEIVE_RX,
  [Role.PRESCRIBER]: Scope.READ_MEDS | Scope.READ_ADHERENCE | Scope.READ_TIMING | Scope.PRESCRIBE,
};

export function scopeLabels(scopes: number): string[] {
  return SCOPES.filter((s) => (scopes & s.flag) !== 0).map((s) => s.label);
}

// --- Identity -------------------------------------------------------------------

/** US National Provider Identifier: 10 digits with a Luhn check over "80840" + NPI. */
export function isValidNpi(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;
  let sum = 0;
  let double = false;
  for (const ch of `80840${npi}`.split('').reverse()) {
    let d = Number(ch);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// --- Days -------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Local 'YYYY-MM-DD' -> day number (days since 1970-01-01), matching the vault. */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** Day number -> a short readable date, e.g. "Mon, Oct 13". */
export function formatDay(day: number): string {
  return new Date(day * MS_PER_DAY).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Milli-units -> a human quantity ("30", "1.5"). */
export function formatUnits(milli: number): string {
  const units = milli / 1000;
  return Number.isInteger(units) ? String(units) : units.toFixed(1);
}

// --- Prescriptions -------------------------------------------------------------------

const RX_LABELS: Record<number, string> = {
  [RxStatus.SENT]: 'Sent to pharmacy',
  [RxStatus.RECEIVED]: 'Received',
  [RxStatus.IN_PROGRESS]: 'Being filled',
  [RxStatus.READY]: 'Ready for pickup',
  [RxStatus.PICKED_UP]: 'Picked up',
  [RxStatus.CANCELLED]: 'Cancelled',
};

export function rxStatusLabel(status: number | undefined): string {
  return RX_LABELS[status ?? 0] ?? 'Unknown';
}

export type RxAction = { status: RxStatus; label: string; destructive?: boolean };

/**
 * The status changes this role can make next. Mirrors the vault's state
 * machine (domain::rxTransitionAllowed); the vault remains the authority.
 */
export function rxActions(status: number, role: Role, refillsLeft: number): RxAction[] {
  const open = status !== RxStatus.PICKED_UP && status !== RxStatus.CANCELLED;
  const actions: RxAction[] = [];
  if (role === Role.PHARMACY) {
    const next: Record<number, RxAction | undefined> = {
      [RxStatus.SENT]: { status: RxStatus.RECEIVED, label: 'Accept' },
      [RxStatus.RECEIVED]: { status: RxStatus.IN_PROGRESS, label: 'Start filling' },
      [RxStatus.IN_PROGRESS]: { status: RxStatus.READY, label: 'Mark ready for pickup' },
      [RxStatus.READY]: { status: RxStatus.PICKED_UP, label: 'Mark picked up' },
    };
    const step = next[status];
    if (step) actions.push(step);
    if (open) actions.push({ status: RxStatus.CANCELLED, label: 'Decline', destructive: true });
  } else if (role === Role.PRESCRIBER) {
    if (open) actions.push({ status: RxStatus.CANCELLED, label: 'Cancel prescription', destructive: true });
  } else if (role === Role.PATIENT) {
    if (status === RxStatus.PICKED_UP && refillsLeft > 0) actions.push({ status: RxStatus.SENT, label: 'Request a refill' });
    if (status === RxStatus.SENT || status === RxStatus.RECEIVED) {
      actions.push({ status: RxStatus.CANCELLED, label: 'Cancel', destructive: true });
    }
  }
  return actions;
}

/** Refills remaining on a prescription (the vault reports how many were used). */
export function refillsLeft(refills: number | undefined, refillsUsed: number | undefined): number {
  return Math.max(0, (refills ?? 0) - (refillsUsed ?? 0));
}

/** The patient's medication a prescription belongs to, if they have it. */
export function linkedMed(meds: Medication[], rx: RxJson): Medication | undefined {
  return meds.find((m) => (rx.id && m.careRxId === rx.id) || (rx.medId && m.id === rx.medId));
}

/** The latest pickup not yet added to this medication's supply count, if any. */
export function pendingPickup(med: Medication | undefined, rx: RxJson): { atMs: number; units: number } | null {
  if (!med || !rx.quantityMilli) return null;
  const pickups = (rx.history ?? []).filter((e) => e.status === RxStatus.PICKED_UP && e.atMs);
  const last = pickups[pickups.length - 1];
  if (!last?.atMs || (med.careFillAt ?? 0) >= last.atMs) return null;
  return { atMs: last.atMs, units: rx.quantityMilli / 1000 };
}

/** Supply after adding a pickup: what's projected to remain today, plus the new fill. */
export function supplyAfterPickup(
  med: Medication,
  pickup: { atMs: number; units: number },
  today: string,
): Pick<Medication, 'quantityOnHand' | 'quantityAsOf' | 'careFillAt'> {
  const tracked = med.quantityOnHand != null && med.quantityAsOf != null;
  const remaining = tracked ? refillStatus(med, today).remaining : 0;
  return { quantityOnHand: remaining + pickup.units, quantityAsOf: today, careFillAt: pickup.atMs };
}

// --- Analytics labels ------------------------------------------------------------------

export function refillLevelLabel(level: number | undefined, daysLeft?: number): string {
  switch (level) {
    case RefillLevel.OUT:
      return 'Out of supply';
    case RefillLevel.SOON:
      return daysLeft === undefined ? 'Refill soon' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
    case RefillLevel.OK:
      return daysLeft === undefined ? 'Supply OK' : `${daysLeft} days left`;
    case RefillLevel.UNKNOWN:
      return 'Taken as needed';
    case RefillLevel.UNTRACKED:
      return 'Supply not tracked';
    default:
      return '';
  }
}

export function riskLabel(score: number | undefined): { label: string; tone: 'ok' | 'watch' | 'high' } {
  const s = score ?? 0;
  if (s >= 6) return { label: 'Needs outreach', tone: 'high' };
  if (s >= 3) return { label: 'Keep an eye on', tone: 'watch' };
  return { label: 'On track', tone: 'ok' };
}

const REASONS: [number, string][] = [
  [RiskReason.REFILL_OVERDUE, 'out of medication'],
  [RiskReason.REFILL_SOON, 'refill due soon'],
  [RiskReason.LOW_PDC, 'low refill adherence'],
  [RiskReason.MISSED_DOSES, 'missed doses'],
  [RiskReason.LATE_DOSES, 'late doses'],
];

export function riskReasons(flags: number | undefined): string[] {
  return REASONS.filter(([f]) => ((flags ?? 0) & f) !== 0).map(([, label]) => label);
}

const WORK_LABELS: Record<number, string> = {
  [WorkKind.REFILL_OVERDUE]: 'Out of medication',
  [WorkKind.NEW_RX]: 'New prescription',
  [WorkKind.REFILL_DUE]: 'Refill due',
  [WorkKind.HIGH_RISK]: 'Adherence outreach',
  [WorkKind.LOW_PDC]: 'Low refill adherence',
  [WorkKind.MED_SYNC]: 'Med sync opportunity',
};

export function workLabel(kind: number | undefined): string {
  return WORK_LABELS[kind ?? 0] ?? 'Task';
}

// --- Snapshot ------------------------------------------------------------------------------

const clip = (s: string | null | undefined, max: number) => (s ?? '').trim().slice(0, max);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const WINDOW_DAYS = 30;

/**
 * What the patient shares: their medication list plus the last 30 days of
 * self-reported adherence and timing, computed with the same engines the app
 * itself shows. Quantities are converted to the vault's fixed-point units.
 */
export function buildSnapshot(
  displayName: string,
  meds: Medication[],
  logs: DoseLog[],
  now: Date = new Date(),
): SnapshotJson {
  const days = lastNDays(WINDOW_DAYS, now);
  const adherence = new Map(perMed(meds, logs, days).map((a) => [a.medId, a]));
  const timings = doseTimings(meds, logs, days, now);

  const med: MedJson[] = meds
    .filter((m) => ID.test(m.id))
    .slice(0, 64)
    .map((m) => {
      const a = adherence.get(m.id);
      const mine = timings.filter((t) => t.medId === m.id && (t.status === 'onTime' || t.status === 'late'));
      const late = mine.filter((t) => t.status === 'late').length;
      const delays = mine.map((t) => t.delayMinutes ?? 0);
      const tracked = m.quantityOnHand != null && m.quantityAsOf != null;
      const rxcui = m.rxcui && /^\d{1,12}$/.test(m.rxcui) ? m.rxcui : undefined;
      const taken = a?.taken ?? 0;

      const out: MedJson = {
        id: m.id,
        name: clip(m.name, 120) || 'Medication',
        rxcui,
        strength: clip(m.strength, 60) || undefined,
        form: clip(m.form, 60) || undefined,
        slotsPerDay: m.asNeeded ? 0 : Math.min(24, new Set(m.times).size),
        daysMask: m.daysOfWeek.reduce((mask, d) => mask | (1 << d), 0),
        unitsPerDoseMilli: Math.max(1, Math.round((m.pillsPerDose ?? 1) * 1000)),
        asNeeded: Boolean(m.asNeeded),
        dosesDue: a?.expected ?? 0,
        dosesTaken: taken,
        dosesLate: Math.min(late, taken),
        supplyTracked: tracked,
        leadDays: Math.min(90, Math.max(0, m.refillLeadDays ?? 7)),
      };
      if (a?.pct != null) out.selfAdherencePct = a.pct;
      if (delays.length) out.avgDelayMin = Math.round(delays.reduce((x, y) => x + y, 0) / delays.length);
      if (tracked) {
        out.onHandMilli = Math.min(1_000_000_000, Math.max(0, Math.round(m.quantityOnHand! * 1000)));
        out.asOfDay = dayNumber(m.quantityAsOf!);
      }
      if (m.careRxId && ID.test(m.careRxId)) out.rxId = m.careRxId;
      return out;
    });

  // Minutes east of UTC, so the vault counts refill days on the patient's calendar.
  const tzOffsetMin = -now.getTimezoneOffset();
  return { displayName: clip(displayName, 80) || undefined, med, tzOffsetMin: tzOffsetMin || undefined };
}

/** A stable fingerprint, so an unchanged snapshot isn't re-uploaded. */
export function snapshotKey(s: SnapshotJson): string {
  return JSON.stringify(s);
}
