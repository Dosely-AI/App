import {
  computeDaily,
  currentStreak,
  expectedSlots,
  overall,
  ratingFor,
} from '@/features/adherence/adherence';
import { dateKey, lastNDays, parseDateKey } from '@/features/adherence/dates';
import { formatTime12 } from '@/features/medications/schedule';
import { refillStatus, upcomingRefills } from '@/features/refill/refill';
import { fetchOverview, formatOverviewText, type MedOverview } from '@/lib/drug/openfda';
import type { DoseLog, Medication } from '@/store/types';

/**
 * A fully on-device chat assistant. There is NO language model and no network
 * dependency beyond the same anonymous FDA drug-info lookups the rest of the app
 * already uses. It routes each message to an intent and answers from either the
 * user's own data (schedule, adherence, refills) or grounded FDA labeling.
 *
 * Because it's rule-based, its answers are safe and predictable: it never
 * invents drug facts, never recommends what to take, and always points personal
 * decisions to a doctor or pharmacist — the same stance as the adherence tips.
 */

export type ChatContext = { medications: Medication[]; logs: DoseLog[] };

export const GREETING = 'Ready when you are.';

const DISCLAIMER =
  'This is general information, not medical advice — always check with your doctor or pharmacist.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Intent =
  | 'emergency'
  | 'recommend-deflect'
  | 'greeting'
  | 'thanks'
  | 'help'
  | 'app-help'
  | 'adherence'
  | 'refill'
  | 'schedule'
  | 'drug-info'
  | 'fallback';

const has = (s: string, ...words: string[]) => words.some((w) => s.includes(w));

/** Filler words that look drug-like but aren't a medication name. */
const STOPWORDS = new Set([
  'about', 'what', 'when', 'where', 'which', 'while', 'there', 'their', 'these', 'those',
  'take', 'taking', 'taken', 'side', 'effects', 'effect', 'dose', 'doses', 'dosage',
  'medication', 'medications', 'medicine', 'medicines', 'drug', 'drugs', 'pill', 'pills',
  'tablet', 'tablets', 'capsule', 'should', 'could', 'would', 'with', 'from', 'this',
  'that', 'they', 'them', 'have', 'does', 'help', 'tell', 'more', 'much', 'many', 'safe',
  'good', 'work', 'works', 'used', 'using', 'today', 'schedule', 'refill', 'refills',
  'adherence', 'streak', 'reminder', 'reminders', 'dosely', 'private', 'privacy',
]);

/** Candidate medication names: saved meds mentioned first, then plausible tokens. */
export function drugCandidates(message: string, meds: Medication[]): string[] {
  const lower = ` ${message.toLowerCase()} `;
  const saved = meds.map((m) => m.name.trim()).filter((n) => n && lower.includes(n.toLowerCase()));
  if (saved.length > 0) return [...new Set(saved)].slice(0, 2);

  const tokens = message
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w));
  return [...new Set(tokens)].slice(0, 3);
}

/** Route a message to an intent. Pure and deterministic — the core of the tests. */
export function classify(message: string, meds: Medication[]): { intent: Intent; candidates: string[] } {
  const s = ` ${message.toLowerCase().trim()} `;
  const candidates = drugCandidates(message, meds);

  // 1. Safety first — never let anything else pre-empt an emergency.
  if (
    has(
      s,
      'overdose', 'over dose', 'overdosed', 'poison', 'chest pain', "can't breathe",
      'cant breathe', 'cannot breathe', 'trouble breathing', 'not breathing', 'anaphyla',
      'allergic reaction', 'heart attack', 'stroke', 'unconscious', 'seizure', 'suicid',
      'kill myself', 'end my life',
    )
  ) {
    return { intent: 'emergency', candidates };
  }

  // 2. Requests for a personal recommendation — deflect to a professional.
  if (
    has(
      s,
      'what should i take', 'what can i take', 'should i take', 'can i take', 'what do you recommend',
      'recommend', "what's good for", 'whats good for', 'what helps with', 'best medicine',
      'best medication', 'which medication should', 'is it safe to take', 'safe to take',
      'take together', 'take with', 'mix with', 'combine',
    )
  ) {
    return { intent: 'recommend-deflect', candidates };
  }

  // 3. Small talk & meta.
  if (/^\s*(hi|hey+|hello|yo|howdy|hiya|good (morning|afternoon|evening))\b/.test(s)) {
    return { intent: 'greeting', candidates };
  }
  if (has(s, 'thank', 'appreciate')) return { intent: 'thanks', candidates };
  if (has(s, 'what can you do', 'what do you do', 'how can you help', 'what can you help', 'who are you')) {
    return { intent: 'help', candidates };
  }

  // 4. "How does <feature> work" and privacy → app help (before data intents).
  if (has(s, 'how do', 'how does', 'how to', 'how can i') && has(s, 'remind', 'refill', 'scan', 'add')) {
    return { intent: 'app-help', candidates };
  }
  if (has(s, 'my data', 'privacy', 'private', 'stored', 'upload', 'my info')) {
    return { intent: 'app-help', candidates };
  }

  // 5. The user's own data.
  if (has(s, 'adherence', 'on track', 'how am i doing', 'my streak', 'streak', 'consistent')) {
    return { intent: 'adherence', candidates };
  }
  if (has(s, 'refill', 'run out', 'running out', 'running low', 'low on', 'getting low', 'almost out', 'how many left', 'need more', 'out of')) {
    return { intent: 'refill', candidates };
  }
  if (has(s, 'when do i take', 'my schedule', 'today', 'next dose', 'what do i take', 'my meds', 'due')) {
    return { intent: 'schedule', candidates };
  }

  // 6. A specific medication was named — but only treat it as a drug question
  // given a real cue, so ordinary sentences don't get mistaken for drug names.
  const savedMatch = meds.some((m) => m.name.trim() && s.includes(m.name.trim().toLowerCase()));
  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  const drugCue = has(
    s,
    'what is', 'what are', "what's", 'what does', 'about', 'used for', 'use for', 'used to',
    'side effect', 'side-effect', 'tell me about', 'warning',
  );
  if (candidates.length > 0 && (savedMatch || drugCue || wordCount === 1)) {
    return { intent: 'drug-info', candidates };
  }

  return { intent: 'fallback', candidates };
}

// --- Canned responses -------------------------------------------------------

const EMERGENCY =
  'If this might be an emergency, call 911 (or your local emergency number) right now.\n\n' +
  'For a suspected overdose or poisoning in the U.S., contact Poison Control at 1-800-222-1222 — ' +
  "they're available 24/7. I'm not able to help with a medical emergency, but they can.";

const RECOMMEND_DEFLECT =
  "I can explain what a medication is and what it's used for, but I can't tell you what to take, " +
  'whether to take something, or how to combine medicines — those depend on your health history and ' +
  'are decisions for your doctor or pharmacist.\n\nWant me to explain what a specific medication is for instead?';

const GREETING_REPLY =
  "Hi! I'm Dosely. Ask me about a medication — what it's for, its side effects, or warnings — or about " +
  'your own meds, schedule, adherence, and refills.';

const THANKS_REPLY = "You're welcome! Anything else I can help you with?";

const HELP_REPLY =
  'Here’s what I can help with, all on your device:\n\n' +
  '• Explain a medication — “What is ibuprofen used for?” (grounded in FDA labeling)\n' +
  '• Your schedule — “What do I take today?”\n' +
  '• Your adherence — “How am I doing?”\n' +
  '• Your refills — “Which meds are running low?”\n' +
  '• How the app works — reminders, scanning, privacy\n\n' +
  'For anything about your personal treatment, your doctor or pharmacist is the best source.';

const FALLBACK =
  'I can answer questions about specific medications (what they’re for, side effects, warnings) and ' +
  'about your own meds, schedule, adherence, and refills. Try “What is ibuprofen used for?” or ' +
  '“What’s on my schedule today?”\n\nFor personal medical advice, please ask your doctor or pharmacist.';

function appHelp(message: string): string {
  const s = message.toLowerCase();
  if (has(s, 'remind')) {
    return 'Reminders are scheduled right on your device for each dose time — no account needed. Turn them on in Settings → Dose reminders, and you’ll get a notification with a “Mark as taken” button at each time.';
  }
  if (has(s, 'refill')) {
    return 'Refill prediction works from a pill count: open a medication, enter how many you have and how many you take per dose, and Dosely projects when you’ll run out — and can remind you before you do.';
  }
  if (has(s, 'scan')) {
    return 'You can add a medication by scanning: the Meds tab → Scan. A barcode is looked up in the FDA’s directory; a photo of the label is read on-device. You always review the details before saving.';
  }
  return 'Everything you enter stays on your device — there’s no account and nothing is uploaded to a server. The only network calls are anonymous drug-info lookups (drug name only). You can erase everything anytime in Settings → Reset all data.';
}

function adherenceReply(ctx: ChatContext): string {
  const days = lastNDays(14);
  const daily = computeDaily(ctx.medications, ctx.logs, days);
  const total = overall(daily);
  const streak = currentStreak(ctx.medications, ctx.logs, days);

  if (ctx.medications.length === 0) return 'Add your medications first and I can track how consistently you take them.';
  if (total.pct === null) return 'Once you log a few doses on the Today tab, I can tell you how you’re doing.';

  const rating = ratingFor(total.pct);
  const streakLine = streak > 0 ? ` You’re on a ${streak}-day perfect streak — nice work.` : '';
  return `Over the last 14 days you’ve taken ${total.pct}% of your scheduled doses — ${rating.label.toLowerCase()}.${streakLine}`;
}

function refillReply(ctx: ChatContext): string {
  const refills = upcomingRefills(ctx.medications);
  if (refills.length === 0) {
    return 'No refills are being tracked yet. Open a medication and add a pill count, and I’ll predict when it runs out.';
  }
  const lines = refills.slice(0, 3).map(({ med, status }) => {
    if (status.level === 'out') return `• ${med.name}: out — time to refill`;
    if (status.level === 'unknown') return `• ${med.name}: taken as needed`;
    const runOut = status.runOutDate ? `, runs out ${shortDate(status.runOutDate)}` : '';
    return `• ${med.name}: about ${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} left${runOut}`;
  });
  return `Here’s your refill outlook:\n\n${lines.join('\n')}`;
}

function scheduleReply(ctx: ChatContext, candidates: string[]): string {
  const today = dateKey(new Date());
  const named = candidates
    .map((c) => ctx.medications.find((m) => m.name.toLowerCase() === c.toLowerCase()))
    .filter((m): m is Medication => Boolean(m));
  const meds = named.length > 0 ? named : ctx.medications;

  const items: { name: string; time: string }[] = [];
  for (const med of meds) {
    for (const time of expectedSlots(med, today)) items.push({ name: med.name, time });
  }
  items.sort((a, b) => a.time.localeCompare(b.time));

  if (items.length === 0) {
    return named.length > 0
      ? `${named[0].name} isn’t scheduled for today.`
      : 'You have nothing scheduled today.';
  }
  const lines = items.map((i) => `• ${formatTime12(i.time)} — ${i.name}`);
  const lead = named.length > 0 ? `Here’s when you take ${named[0].name} today:` : 'Here’s today’s schedule:';
  return `${lead}\n\n${lines.join('\n')}`;
}

export type ResolvedDrug = { name: string; overview: MedOverview };

/**
 * Look up the first candidate the FDA actually recognizes. A null result is the
 * signal that the message isn't really about a medication — the hybrid router
 * uses it to hand ambiguous questions ("what is a clinical trial?") to the LLM.
 */
export async function resolveDrug(
  candidates: string[],
  meds: Medication[],
  signal?: AbortSignal,
): Promise<ResolvedDrug | null> {
  for (const raw of candidates) {
    const rxcui = meds.find((m) => m.name.toLowerCase() === raw.toLowerCase())?.rxcui ?? null;
    const overview = await fetchOverview({ name: raw, rxcui, signal });
    if (overview) return { name: titleCase(raw), overview };
  }
  return null;
}

/** Format an FDA overview into a grounded chat answer. */
export function formatDrugAnswer(drug: ResolvedDrug): string {
  const grounded = formatOverviewText(drug.name, drug.overview);
  const safety = drug.overview.warning ? `\n\nSafety note from the label: ${drug.overview.warning}` : '';
  return `Here’s what the FDA label says about ${drug.name}:\n\n${grounded}${safety}\n\n${DISCLAIMER}`;
}

const NO_DRUG_MATCH = `I couldn’t find FDA information for that one — double-check the spelling, or ask your pharmacist, who’ll have the full details.\n\n${DISCLAIMER}`;

/**
 * FDA label text for any medication named in a message, for grounding the
 * hybrid AI path. Reuses the same candidate detection as the local engine.
 */
export async function buildFdaContext(
  message: string,
  meds: Medication[],
  signal?: AbortSignal,
): Promise<string> {
  const blocks: string[] = [];
  for (const name of drugCandidates(message, meds)) {
    const rxcui = meds.find((m) => m.name.toLowerCase() === name.toLowerCase())?.rxcui ?? null;
    const overview = await fetchOverview({ name, rxcui, signal });
    if (overview) {
      const display = titleCase(name);
      blocks.push(`${display}:\n${formatOverviewText(display, overview)}`);
      if (blocks.length >= 2) break;
    }
  }
  return blocks.join('\n\n');
}

/** Answer a message entirely on-device. Only drug-info touches the network (FDA). */
export async function respondLocally(
  message: string,
  ctx: ChatContext,
  signal?: AbortSignal,
): Promise<string> {
  const { intent, candidates } = classify(message, ctx.medications);
  switch (intent) {
    case 'emergency':
      return EMERGENCY;
    case 'recommend-deflect':
      return RECOMMEND_DEFLECT;
    case 'greeting':
      return GREETING_REPLY;
    case 'thanks':
      return THANKS_REPLY;
    case 'help':
      return HELP_REPLY;
    case 'app-help':
      return appHelp(message);
    case 'adherence':
      return adherenceReply(ctx);
    case 'refill':
      return refillReply(ctx);
    case 'schedule':
      return scheduleReply(ctx, candidates);
    case 'drug-info': {
      const drug = await resolveDrug(candidates, ctx.medications, signal);
      return drug ? formatDrugAnswer(drug) : NO_DRUG_MATCH;
    }
    default:
      return FALLBACK;
  }
}

function shortDate(key: string): string {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
