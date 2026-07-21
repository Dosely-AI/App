import { Router } from 'express';

import { config } from '../config.js';

/**
 * Hybrid chat — the open-ended half. The app answers medication, personal-data,
 * and emergency questions locally (grounded, offline); anything it doesn't
 * recognize comes here, where Claude answers conversationally with the app's
 * server-held key. Users never supply a key.
 *
 * The same safety rules the local engine follows are enforced in the system
 * prompt: explain and educate, never give personalized dosing or tell anyone to
 * start/stop/change a medication, and route real decisions to a professional.
 */
export const chatRouter = Router();

const SYSTEM = [
  'You are Dosely, a warm, plain-spoken health companion inside a medication-management app.',
  'Answer helpfully and conversationally. You can handle general and health-adjacent questions.',
  '',
  'When a question touches a specific medication and FDA label information is provided below,',
  'ground your answer in it and prefer it over memory; never contradict the label or invent drug',
  'facts. Be thorough and clear.',
  '',
  'Safety rules you never break:',
  '• You are not a doctor or pharmacist. Never tell the user to start, stop, change, or combine',
  '  medications, and never give personalized dosing.',
  '• For decisions about their specific situation or dose, tell them to check with their doctor or',
  '  pharmacist.',
  '• If a message suggests an emergency, tell them to contact a medical professional or emergency',
  '  services right away.',
  '',
  'Keep answers friendly and concise. End any medication-related answer with a brief reminder that',
  'this is general information, not medical advice.',
].join('\n');

type InboundMessage = { role: 'user' | 'assistant'; content: string };

chatRouter.post('/', async (req, res) => {
  if (!config.anthropicKey) {
    return res.status(503).json({
      error: 'Open-ended AI chat is not set up yet. Add an Anthropic API key to the server (.env) to enable it.',
    });
  }

  const raw = Array.isArray(req.body?.messages) ? (req.body.messages as InboundMessage[]) : [];
  const drugContext = typeof req.body?.drugContext === 'string' ? req.body.drugContext : '';

  // Keep only well-formed turns and cap history so a runaway client can't blow
  // up the prompt.
  const messages = raw
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    return res.status(400).json({ error: 'Expected a conversation ending in a user message.' });
  }

  const system = drugContext ? `${SYSTEM}\n\n--- FDA label information ---\n${drugContext}` : SYSTEM;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: config.chatModel, max_tokens: 1024, system, messages }),
    });

    if (!r.ok) {
      const status = r.status === 401 ? 500 : 502; // hide a bad server key as a 500
      return res.status(status).json({ error: `The AI service returned an error (${r.status}).` });
    }

    const data = (await r.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
    };
    if (data.stop_reason === 'refusal') {
      return res.json({ reply: 'I can’t help with that one — try rephrasing your question.' });
    }
    const reply = data.content?.find((b) => b.type === 'text')?.text?.trim();
    if (!reply) return res.status(502).json({ error: 'The AI returned an empty response.' });
    return res.json({ reply });
  } catch {
    return res.status(502).json({ error: 'Could not reach the AI service.' });
  }
});
