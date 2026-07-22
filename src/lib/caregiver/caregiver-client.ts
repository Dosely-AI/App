import {
  computeDaily,
  currentStreak,
  expectedSlots,
  missedDoses,
  overall,
  ratingFor,
} from '@/features/adherence/adherence';
import { dateKey, lastNDays } from '@/features/adherence/dates';
import { upcomingRefills } from '@/features/refill/refill';
import { AUTH_URL } from '@/lib/auth/passkey-client';
import type { DoseLog, Medication, SymptomLog } from '@/store/types';

/**
 * Caregiver sharing client: create/redeem invites, list linked patients, and
 * read a patient's status. The patient's status is computed from their synced
 * data with the same engines the patient's own app uses, so a caregiver sees
 * exactly the same numbers.
 */

export type PatientRef = { id: string; name: string; updatedAt?: string | null };

type SyncedData = { medications?: Medication[]; logs?: DoseLog[]; symptoms?: SymptomLog[] };

export type PatientSummary = {
  todayTaken: number;
  todayTotal: number;
  adherencePct: number | null;
  ratingLabel: string;
  streak: number;
  /** Doses due earlier today that haven't been taken — the caregiver alert. */
  missedToday: { name: string; time: string }[];
  refillsLow: { name: string; daysLeft: number | null; out: boolean }[];
  recentSymptoms: { date: string; severity: number; note: string }[];
};

/** Compute a caregiver-facing status snapshot from a patient's synced data. Pure. */
export function summarizePatient(data: unknown): PatientSummary {
  const d = (data ?? {}) as SyncedData;
  const meds = Array.isArray(d.medications) ? d.medications : [];
  const logs = Array.isArray(d.logs) ? d.logs : [];
  const symptoms = Array.isArray(d.symptoms) ? d.symptoms : [];

  const today = dateKey(new Date());
  let todayTaken = 0;
  let todayTotal = 0;
  for (const med of meds) {
    for (const time of expectedSlots(med, today)) {
      todayTotal += 1;
      if (logs.some((l) => l.medId === med.id && l.date === today && l.time === time)) todayTaken += 1;
    }
  }

  const days = lastNDays(14);
  const totals = overall(computeDaily(meds, logs, days));

  return {
    todayTaken,
    todayTotal,
    adherencePct: totals.pct,
    ratingLabel: ratingFor(totals.pct).label,
    streak: currentStreak(meds, logs, days),
    missedToday: missedDoses(meds, logs).map((x) => ({ name: x.name, time: x.time })),
    refillsLow: upcomingRefills(meds)
      .filter((r) => r.status.level === 'soon' || r.status.level === 'out')
      .map((r) => ({ name: r.med.name, daysLeft: r.status.daysLeft, out: r.status.level === 'out' })),
    recentSymptoms: [...symptoms]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((s) => ({ date: s.date, severity: s.severity, note: s.note })),
  };
}

// --- Network ----------------------------------------------------------------

function auth(token: string): HeadersInit {
  return { 'content-type': 'application/json', authorization: `Bearer ${token}` };
}

export async function createInvite(token: string): Promise<{ code: string; expiresAt: string } | null> {
  try {
    const res = await fetch(`${AUTH_URL}/caregiver/invite`, { method: 'POST', headers: auth(token) });
    return res.ok ? ((await res.json()) as { code: string; expiresAt: string }) : null;
  } catch {
    return null;
  }
}

export async function acceptInvite(
  token: string,
  code: string,
): Promise<{ ok: true; patient: PatientRef } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${AUTH_URL}/caregiver/accept`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ code }),
    });
    const data = (await res.json().catch(() => ({}))) as { patient?: PatientRef; error?: string };
    if (!res.ok || !data.patient) return { ok: false, error: data.error ?? 'Could not accept the code.' };
    return { ok: true, patient: data.patient };
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }
}

export async function listPatients(token: string): Promise<PatientRef[]> {
  try {
    const res = await fetch(`${AUTH_URL}/caregiver/patients`, { headers: auth(token) });
    if (!res.ok) return [];
    return ((await res.json()) as { patients: PatientRef[] }).patients ?? [];
  } catch {
    return [];
  }
}

export async function getPatient(
  token: string,
  id: string,
): Promise<{ patient: PatientRef; data: unknown; updatedAt: string | null } | null> {
  try {
    const res = await fetch(`${AUTH_URL}/caregiver/patients/${id}`, { headers: auth(token) });
    if (!res.ok) return null;
    return (await res.json()) as { patient: PatientRef; data: unknown; updatedAt: string | null };
  } catch {
    return null;
  }
}

export async function listMyCaregivers(token: string): Promise<PatientRef[]> {
  try {
    const res = await fetch(`${AUTH_URL}/caregiver/my-caregivers`, { headers: auth(token) });
    if (!res.ok) return [];
    return ((await res.json()) as { caregivers: PatientRef[] }).caregivers ?? [];
  } catch {
    return [];
  }
}

export async function revokeCaregiver(token: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${AUTH_URL}/caregiver/my-caregivers/${id}`, {
      method: 'DELETE',
      headers: auth(token),
    });
    return res.ok;
  } catch {
    return false;
  }
}
