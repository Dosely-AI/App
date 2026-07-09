import { fetchOverview, formatOverviewText, type MedOverview } from '@/lib/drug/openfda';

import { getApiKey } from './key';

export type MedSummary = {
  text: string;
  /** Where the summary came from: an AI rewrite, raw FDA text, or nothing found. */
  source: 'ai' | 'fda' | 'none';
  overview: MedOverview | null;
};

const DISCLAIMER =
  'This is general information, not medical advice. Always follow your doctor or pharmacist.';

/**
 * Explain what a medication is for. Always grounded in FDA labeling. If the user
 * has added their own Anthropic key, Claude rewrites the grounded text into a
 * short, plain-language summary; otherwise we show the grounded text directly.
 */
export async function summarizeMedication(input: {
  name: string;
  rxcui?: string | null;
  signal?: AbortSignal;
}): Promise<MedSummary> {
  const overview = await fetchOverview(input);
  if (!overview) {
    return {
      text: `We couldn't find FDA information for “${input.name}”. Your pharmacist can tell you what it's for and how it works.`,
      source: 'none',
      overview: null,
    };
  }

  const grounded = formatOverviewText(input.name, overview);
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { text: grounded, source: 'fda', overview };
  }

  try {
    const ai = await rewriteWithClaude(input.name, grounded, apiKey, input.signal);
    return { text: ai, source: 'ai', overview };
  } catch {
    // Any AI failure degrades gracefully to the grounded text.
    return { text: grounded, source: 'fda', overview };
  }
}

/**
 * Calls Anthropic's Messages API directly with the user's own key. We use raw
 * fetch rather than the Node/browser SDK because this runs in React Native.
 * The model only *rewrites* the grounded FDA text — it is told never to add
 * facts, dosing, or advice.
 */
async function rewriteWithClaude(
  name: string,
  groundedText: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const system =
    'You explain medications to patients in plain, simple language. You are given ' +
    'the official FDA label text for a medication. Summarize ONLY what it is used ' +
    'for and, if stated, how it works, in 2–3 short sentences a non-expert can ' +
    'understand. Do NOT add any facts not in the provided text. Never give dosing, ' +
    'never tell the user to start/stop/change a medication, never give medical advice. ' +
    `End with exactly this sentence on its own line: "${DISCLAIMER}"`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal,
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 400,
      system,
      messages: [
        {
          role: 'user',
          content: `Medication: ${name}\n\nFDA label text:\n${groundedText}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('Empty AI response');
  return text;
}
