import { computeDaily, currentStreak, overall, ratingFor } from '@/features/adherence/adherence';
import { lastNDays, parseDateKey } from '@/features/adherence/dates';
import { summarizeSchedule } from '@/features/medications/schedule';
import { upcomingRefills } from '@/features/refill/refill';
import type { DoseLog, Medication, SymptomLog } from '@/store/types';

/** Human label for a 1–5 symptom severity. */
export function severityLabel(n: number): string {
  return ['—', 'Very mild', 'Mild', 'Moderate', 'Severe', 'Very severe'][Math.max(0, Math.min(5, n))] ?? '—';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(key: string): string {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export type VisitContext = {
  name?: string;
  medications: Medication[];
  logs: DoseLog[];
  symptoms: SymptomLog[];
};

/**
 * Build a plain-text summary a patient can bring to (or share with) their
 * doctor: current medications, how consistently they've been taking them,
 * refills coming up, recent symptoms, and a few tailored questions to ask.
 *
 * Pure and offline — assembled entirely from the user's own data, so there is
 * nothing invented and nothing that needs a network or a key.
 */
export function buildVisitSummary(ctx: VisitContext): string {
  const today = new Date();
  const lines: string[] = [];
  const H = (t: string) => lines.push('', t.toUpperCase());

  lines.push('DOCTOR VISIT SUMMARY');
  lines.push(`${ctx.name ? `${ctx.name} · ` : ''}${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`);
  lines.push('Prepared with DoselyAI · general information, not medical advice');

  // Medications
  H('Current medications');
  if (ctx.medications.length === 0) {
    lines.push('None recorded.');
  } else {
    for (const m of ctx.medications) {
      const detail = [m.strength, m.form].filter(Boolean).join(' ');
      lines.push(`• ${m.name}${detail ? ` (${detail})` : ''} — ${summarizeSchedule(m.times, m.daysOfWeek)}`);
    }
  }

  // Adherence
  const days = lastNDays(14);
  const daily = computeDaily(ctx.medications, ctx.logs, days);
  const total = overall(daily);
  const streak = currentStreak(ctx.medications, ctx.logs, days);
  H('Adherence (last 14 days)');
  if (total.pct === null) {
    lines.push('Not enough dose history yet.');
  } else {
    lines.push(`Took ${total.pct}% of scheduled doses — ${ratingFor(total.pct).label.toLowerCase()}.`);
    if (streak > 0) lines.push(`Current streak: ${streak} day${streak === 1 ? '' : 's'}.`);
  }

  // Refills
  const refills = upcomingRefills(ctx.medications).filter(
    (r) => r.status.level === 'soon' || r.status.level === 'out',
  );
  if (refills.length > 0) {
    H('Refills needed soon');
    for (const r of refills) {
      lines.push(
        r.status.level === 'out'
          ? `• ${r.med.name}: out`
          : `• ${r.med.name}: ~${r.status.daysLeft} day${r.status.daysLeft === 1 ? '' : 's'} left`,
      );
    }
  }

  // Symptoms
  const recent = [...ctx.symptoms].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  if (recent.length > 0) {
    H('Recent symptoms');
    for (const s of recent) {
      lines.push(`• ${shortDate(s.date)} — ${severityLabel(s.severity)}${s.note ? `: ${s.note}` : ''}`);
    }
  }

  // Tailored questions
  H('Questions to ask');
  const questions: string[] = [];
  if (total.pct !== null && total.pct < 80) {
    questions.push('I’ve been missing some doses — is there a simpler schedule or a reminder that would help?');
  }
  if (recent.length > 0) {
    questions.push('Could the symptoms I logged be related to any of my medications?');
  }
  if (ctx.medications.length >= 2) {
    questions.push('Are any of my medications known to interact with each other?');
  }
  questions.push('Are all of these medications still necessary at their current doses?');
  for (const q of questions) lines.push(`• ${q}`);

  return lines.join('\n').trim();
}
