import type { Medication } from '@/store/types';

import { classify, drugCandidates } from '../local-assistant';

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

const intent = (msg: string, meds: Medication[] = []) => classify(msg, meds).intent;

describe('classify — safety takes priority', () => {
  it('routes overdose/poisoning to emergency', () => {
    expect(intent('I think I took an overdose')).toBe('emergency');
    expect(intent('my child swallowed pills, is this poison?')).toBe('emergency');
  });

  it('routes serious symptoms to emergency even when a drug is named', () => {
    expect(intent('I took lisinopril and now I have chest pain', [med('Lisinopril')])).toBe(
      'emergency',
    );
  });

  it('deflects requests for a personal recommendation', () => {
    expect(intent('what should I take for a headache')).toBe('recommend-deflect');
    expect(intent('can I take ibuprofen with my metformin', [med('Metformin')])).toBe(
      'recommend-deflect',
    );
    expect(intent('is it safe to take these together')).toBe('recommend-deflect');
  });
});

describe('classify — everyday intents', () => {
  it('recognizes greetings and thanks', () => {
    expect(intent('hi')).toBe('greeting');
    expect(intent('Good morning!')).toBe('greeting');
    expect(intent('thanks so much')).toBe('thanks');
  });

  it('answers capability questions with help', () => {
    expect(intent('what can you do?')).toBe('help');
  });

  it('routes feature and privacy questions to app-help', () => {
    expect(intent('how do reminders work?')).toBe('app-help');
    expect(intent('is my data private?')).toBe('app-help');
  });

  it('routes personal-data questions to the right intent', () => {
    expect(intent('how is my adherence?')).toBe('adherence');
    expect(intent('which meds are running low?')).toBe('refill');
    expect(intent('what do I take today?')).toBe('schedule');
  });
});

describe('classify — medication info', () => {
  it('routes a named drug to grounded drug-info', () => {
    expect(intent('what is ibuprofen used for?')).toBe('drug-info');
  });

  it('routes a saved medication to drug-info', () => {
    expect(intent('tell me about metformin side effects', [med('Metformin')])).toBe('drug-info');
  });

  it('falls back when nothing matches', () => {
    expect(intent('the weather is nice')).toBe('fallback');
  });
});

describe('drugCandidates', () => {
  it('prefers the user’s own medications', () => {
    expect(drugCandidates('side effects of my atorvastatin', [med('Atorvastatin')])).toEqual([
      'Atorvastatin',
    ]);
  });

  it('extracts a plausible drug token when none are saved', () => {
    expect(drugCandidates('what is ibuprofen', [])).toContain('ibuprofen');
  });

  it('ignores filler words', () => {
    const out = drugCandidates('what are the side effects of this medication', []);
    expect(out).not.toContain('effects');
    expect(out).not.toContain('medication');
  });
});
