import type { Medication } from '@/store/types';

import { shouldUseAI } from '../hybrid';

const med = (name: string): Medication => ({
  id: name,
  name,
  rxcui: null,
  strength: null,
  form: null,
  times: ['08:00'],
  daysOfWeek: [],
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('shouldUseAI — routing boundary', () => {
  it('keeps medication questions local (grounded, offline)', () => {
    expect(shouldUseAI('what is ibuprofen used for?', [])).toBe(false);
    expect(shouldUseAI('side effects of my metformin', [med('Metformin')])).toBe(false);
  });

  it('keeps personal-data questions local', () => {
    expect(shouldUseAI('how is my adherence?', [])).toBe(false);
    expect(shouldUseAI('what do I take today?', [])).toBe(false);
    expect(shouldUseAI('which meds are running low?', [])).toBe(false);
  });

  it('keeps safety questions local', () => {
    expect(shouldUseAI('I think I overdosed', [])).toBe(false);
    expect(shouldUseAI('what should I take for a cold?', [])).toBe(false);
  });

  it('sends clearly open-ended questions to the AI', () => {
    expect(shouldUseAI('why do I feel tired in the afternoons?', [])).toBe(true);
    expect(shouldUseAI('can you explain that more simply?', [])).toBe(true);
    expect(shouldUseAI('tell me a joke', [])).toBe(true);
  });

  // "what is a clinical trial?" classifies as drug-info, then respondHybrid asks
  // the FDA — a miss falls through to the AI. That's validated at runtime, not here.
  it('treats a "what is X" phrasing as a drug question to check against the FDA', () => {
    expect(shouldUseAI('what is a clinical trial?', [])).toBe(false);
  });
});
