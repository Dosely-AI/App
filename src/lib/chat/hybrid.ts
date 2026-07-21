import { AUTH_URL } from '@/lib/auth/passkey-client';

import {
  buildFdaContext,
  classify,
  formatDrugAnswer,
  resolveDrug,
  respondLocally,
  type ChatContext,
} from './local-assistant';

/**
 * The hybrid router. Anything the local engine recognizes — medications, the
 * user's own data, app help, safety — is answered on-device (free, offline,
 * grounded). Only genuinely open-ended messages go to the LLM via the app's
 * backend, so users get adaptive conversation without ever holding a key.
 */

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** True when a message should go to the LLM rather than the local engine. */
export function shouldUseAI(message: string, meds: ChatContext['medications']): boolean {
  return classify(message, meds).intent === 'fallback';
}

export type HybridReply = { text: string; source: 'local' | 'ai' };

async function remoteChat(
  messages: ChatTurn[],
  drugContext: string,
): Promise<{ reply?: string; error?: string; offline?: boolean }> {
  try {
    const res = await fetch(`${AUTH_URL}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, drugContext }),
    });
    const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
    if (!res.ok) return { error: data.error ?? `Server error (${res.status}).` };
    return { reply: data.reply };
  } catch {
    return { offline: true };
  }
}

/**
 * Produce the assistant's reply for the latest turn, routing local vs. AI.
 * `history` is the full thread ending in the newest user message.
 */
export async function respondHybrid(
  history: ChatTurn[],
  ctx: ChatContext,
  signal?: AbortSignal,
): Promise<HybridReply> {
  const last = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const { intent, candidates } = classify(last, ctx.medications);

  // A named drug is only handled locally if the FDA actually recognizes it;
  // otherwise it wasn't really a medication question, so let the LLM take it.
  if (intent === 'drug-info') {
    const drug = await resolveDrug(candidates, ctx.medications, signal);
    if (drug) return { text: formatDrugAnswer(drug), source: 'local' };
  } else if (intent !== 'fallback') {
    return { text: await respondLocally(last, ctx, signal), source: 'local' };
  }

  // Open-ended (or an unrecognized "drug") → the LLM, grounded if a real
  // medication is mentioned.
  const drugContext = await buildFdaContext(last, ctx.medications, signal);
  const { reply, error, offline } = await remoteChat(history, drugContext);

  if (reply) return { text: reply, source: 'ai' };
  if (offline) {
    return {
      text: 'I can answer questions about your medications, schedule, refills, and the app right now — but open-ended chat needs the Dosely server, which looks unavailable at the moment.',
      source: 'local',
    };
  }
  return { text: error ?? 'Something went wrong reaching the assistant.', source: 'local' };
}
