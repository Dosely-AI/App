import { z } from 'zod';

import { getApiKey } from './key';

/**
 * Read a medication label from a photo using Claude's vision support.
 *
 * This is deliberately a *transcription* task, not a knowledge task: the model
 * is told to copy what is printed on the label and to leave a field blank
 * rather than guess. Drug facts still come from FDA data elsewhere in the app —
 * nothing here invents dosing or medical information.
 *
 * The response is constrained with structured outputs, so we get a schema-valid
 * object back instead of prose we'd have to parse.
 */

/** Fields we ask the model to transcribe. Empty string = not legible. */
export const labelSchema = z.object({
  name: z.string(),
  strength: z.string(),
  form: z.string(),
  quantity: z.string(),
  directions: z.string(),
  timesPerDay: z.number().int().min(0).max(24),
  isMedicationLabel: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type ScannedLabel = z.infer<typeof labelSchema>;

/** JSON Schema handed to the API. Mirrors `labelSchema` above. */
const JSON_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Medication name exactly as printed. Empty string if not legible.' },
    strength: { type: 'string', description: 'Strength as printed, e.g. "200 mg". Empty string if absent.' },
    form: { type: 'string', description: 'Dosage form as printed, e.g. "tablet", "capsule". Empty if absent.' },
    quantity: { type: 'string', description: 'Number of units in the container, digits only, e.g. "30". Empty if absent.' },
    directions: { type: 'string', description: 'The directions line copied verbatim, e.g. "Take 1 tablet by mouth twice daily".' },
    timesPerDay: {
      type: 'integer',
      description: 'How many times per day the directions say to take it. 0 if the directions do not clearly say.',
    },
    isMedicationLabel: { type: 'boolean', description: 'True only if this image really shows a medication label.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['name', 'strength', 'form', 'quantity', 'directions', 'timesPerDay', 'isMedicationLabel', 'confidence'],
  additionalProperties: false,
} as const;

const SYSTEM = [
  'You transcribe prescription and over-the-counter medication labels from photographs.',
  'Copy ONLY what is visibly printed on the label. Never infer, complete, or correct a value from your own knowledge of the drug —',
  'if a field is blurry, cut off, or absent, return an empty string for it (or 0 for timesPerDay).',
  'Never provide dosing guidance, medical advice, or any statement about what the medication treats.',
  'If the image is not a medication label, set isMedicationLabel to false and leave the other fields empty.',
  'Set confidence to "low" whenever the image is blurry, angled, or partially obscured.',
].join(' ');

export type ScanOutcome =
  | { status: 'ok'; label: ScannedLabel }
  | { status: 'no-key' }
  | { status: 'not-a-label' }
  | { status: 'error'; message: string };

/** Media type must match the bytes we send; Expo's camera gives us JPEG. */
type ImageInput = { base64: string; mediaType?: 'image/jpeg' | 'image/png' };

/**
 * Send the photo to Claude and return the transcribed fields. Requires the
 * user's own Anthropic key (Settings → AI summaries); without one this returns
 * `no-key` so the caller can fall back to barcode scanning or manual entry.
 */
export async function scanMedicationLabel(
  image: ImageInput,
  signal?: AbortSignal,
): Promise<ScanOutcome> {
  const apiKey = await getApiKey();
  if (!apiKey) return { status: 'no-key' };

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal,
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        // Headroom for adaptive thinking plus the small JSON payload.
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        output_config: {
          // Reading a label is a short task and this runs on a phone — keep
          // latency down rather than paying for deep reasoning.
          effort: 'low',
          format: { type: 'json_schema', schema: JSON_SCHEMA },
        },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mediaType ?? 'image/jpeg',
                  data: image.base64,
                },
              },
              { type: 'text', text: 'Transcribe this medication label.' },
            ],
          },
        ],
      }),
    });
  } catch {
    return { status: 'error', message: 'Could not reach the network. Check your connection and try again.' };
  }

  if (res.status === 401) {
    return { status: 'error', message: 'Your API key was rejected. Re-enter it in Settings.' };
  }
  if (res.status === 429) {
    return { status: 'error', message: 'Rate limited. Wait a moment and try again.' };
  }
  if (!res.ok) {
    return { status: 'error', message: `The AI service returned an error (${res.status}).` };
  }

  let data: {
    content?: { type: string; text?: string }[];
    stop_reason?: string;
  };
  try {
    data = await res.json();
  } catch {
    return { status: 'error', message: 'Unreadable response from the AI service.' };
  }

  // A refusal or a truncated response means we have no trustworthy fields.
  if (data.stop_reason === 'refusal') {
    return { status: 'error', message: 'The AI declined to read this image.' };
  }
  if (data.stop_reason === 'max_tokens') {
    return { status: 'error', message: 'The response was cut short. Try a clearer, closer photo.' };
  }

  const text = data.content?.find((b) => b.type === 'text')?.text;
  if (!text) return { status: 'error', message: 'The AI returned an empty response.' };

  // Structured outputs guarantee the shape, but validate anyway — this data
  // goes on to prefill a medication record.
  const parsed = labelSchema.safeParse(safeJson(text));
  if (!parsed.success) {
    return { status: 'error', message: "Couldn't understand the scan result. Try again." };
  }
  if (!parsed.data.isMedicationLabel || !parsed.data.name.trim()) {
    return { status: 'not-a-label' };
  }

  return { status: 'ok', label: parsed.data };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Evenly spaced dose times for a "N times per day" instruction. */
export function suggestTimes(timesPerDay: number): string[] {
  switch (timesPerDay) {
    case 1:
      return ['09:00'];
    case 2:
      return ['09:00', '21:00'];
    case 3:
      return ['08:00', '14:00', '20:00'];
    case 4:
      return ['08:00', '12:00', '16:00', '20:00'];
    default:
      return [];
  }
}
