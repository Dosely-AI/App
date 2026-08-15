/**
 * Pharmacy refill requests. Pure, side-effect-free helpers that turn the refill
 * prediction the app already computes into an actionable request: which
 * medications are due for a refill, grouped by the pharmacy that fills them, and
 * a plain-text request the user can Call in, Text, or Share.
 *
 * Honest scope: DoselyAI does not talk to any pharmacy system. It only assembles
 * a message from the user's own data and hands it to the phone's dialer / SMS /
 * share sheet — the user always sends it themselves. Nothing is invented.
 */

import { dateKey } from '@/features/adherence/dates';
import { needsRefillAttention, refillStatus, type RefillStatus } from '@/features/refill/refill';
import type { Medication, Pharmacy } from '@/store/types';

export type RefillItem = { med: Medication; status: RefillStatus };

/** Medications due for a refill, grouped by the pharmacy that fills them. */
export type PharmacyGroup = {
  /** The pharmacy, or null for medications with none set (or a deleted one). */
  pharmacy: Pharmacy | null;
  /** Items in this group, most urgent first. */
  items: RefillItem[];
};

/** Fewer days left = more urgent; 'out' sorts to the very front (daysLeft 0). */
function urgency(status: RefillStatus): number {
  return status.daysLeft ?? Number.POSITIVE_INFINITY;
}

/** The pharmacy a medication is filled at, or null when unset / not found. */
export function pharmacyForMed(med: Medication, pharmacies: Pharmacy[]): Pharmacy | null {
  if (!med.pharmacyId) return null;
  return pharmacies.find((p) => p.id === med.pharmacyId) ?? null;
}

/**
 * Group every medication that needs a refill (running low or already out) by its
 * pharmacy. Groups with a pharmacy come first, most urgent first; medications
 * with no pharmacy set are collected into a trailing null-pharmacy group so the
 * UI can prompt the user to add one.
 */
export function buildRefillGroups(
  meds: Medication[],
  pharmacies: Pharmacy[],
  today: string = dateKey(new Date()),
): PharmacyGroup[] {
  const byId = new Map(pharmacies.map((p) => [p.id, p]));

  const items: RefillItem[] = meds
    .map((med) => ({ med, status: refillStatus(med, today) }))
    .filter(({ status }) => needsRefillAttention(status))
    .sort((a, b) => urgency(a.status) - urgency(b.status));

  const groups = new Map<string, PharmacyGroup>();
  for (const item of items) {
    const pharmacy = (item.med.pharmacyId && byId.get(item.med.pharmacyId)) || null;
    const key = pharmacy?.id ?? '__none__';
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { pharmacy, items: [item] });
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.pharmacy) return 1; // no-pharmacy group always last
    if (!b.pharmacy) return -1;
    return urgency(a.items[0].status) - urgency(b.items[0].status);
  });
}

/** How many medications, across all pharmacies, currently need a refill. */
export function refillDueCount(
  meds: Medication[],
  today: string = dateKey(new Date()),
): number {
  return meds.filter((med) => needsRefillAttention(refillStatus(med, today))).length;
}

/**
 * A plain-language refill request the user can send to a pharmacy. Built only
 * from their own medication list — name, strength/form, and Rx number if known.
 */
export function composeRefillMessage(
  patientName: string,
  pharmacy: Pharmacy | null,
  items: RefillItem[],
): string {
  const who = patientName.trim() || 'a DoselyAI user';
  const lines: string[] = [];
  lines.push(`Hello${pharmacy?.name ? ` ${pharmacy.name}` : ''},`);
  lines.push('');
  lines.push(
    `This is ${who}. I'd like to request a refill for the following ` +
      `prescription${items.length === 1 ? '' : 's'}:`,
  );
  lines.push('');
  for (const { med } of items) {
    const detail = [med.strength, med.form].filter(Boolean).join(' ');
    const rx = med.rxNumber ? ` — Rx #${med.rxNumber}` : '';
    lines.push(`• ${med.name}${detail ? ` (${detail})` : ''}${rx}`);
  }
  lines.push('');
  lines.push('Thank you.');
  return lines.join('\n');
}

/** Digits (and a single leading +) of a phone number, for tel:/sms: links. */
export function sanitizePhone(phone: string): string {
  const trimmed = phone.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/\D/g, '');
}

/** True when a pharmacy has a phone number worth dialing/texting. */
export function hasPhone(pharmacy: Pharmacy | null): boolean {
  return !!pharmacy && sanitizePhone(pharmacy.phone).replace('+', '').length >= 7;
}

/** `tel:` link for a pharmacy phone number. */
export function telUrl(phone: string): string {
  return `tel:${sanitizePhone(phone)}`;
}

/**
 * `sms:` link with a prefilled body. iOS wants `&body=`, most others `?body=`,
 * so the platform separator is passed in (keeping this function pure).
 */
export function smsUrl(phone: string, body: string, separator: '?' | '&' = '?'): string {
  const num = sanitizePhone(phone);
  return body ? `sms:${num}${separator}body=${encodeURIComponent(body)}` : `sms:${num}`;
}
