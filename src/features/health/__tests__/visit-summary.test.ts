import { dateKey, lastNDays } from '@/features/adherence/dates';
import type { DoseLog, Medication, SymptomLog } from '@/store/types';

import { buildVisitSummary, severityLabel } from '../visit-summary';

const med = (over: Partial<Medication> = {}): Medication => ({
  id: 'm',
  name: 'Metformin',
  rxcui: null,
  strength: '500 mg',
  form: 'tablet',
  times: ['08:00', '20:00'],
  daysOfWeek: [],
  createdAt: '2020-01-01T00:00:00.000Z',
  ...over,
});

const symptom = (over: Partial<SymptomLog> = {}): SymptomLog => ({
  id: 's',
  date: dateKey(new Date()),
  severity: 3,
  note: 'headache',
  createdAt: new Date().toISOString(),
  ...over,
});

describe('severityLabel', () => {
  it('maps 1–5 to words and clamps out-of-range', () => {
    expect(severityLabel(1)).toBe('Very mild');
    expect(severityLabel(3)).toBe('Moderate');
    expect(severityLabel(5)).toBe('Very severe');
    expect(severityLabel(0)).toBe('—');
    expect(severityLabel(99)).toBe('Very severe');
  });
});

describe('buildVisitSummary', () => {
  it('lists current medications with schedule', () => {
    const out = buildVisitSummary({ medications: [med()], logs: [], symptoms: [] });
    expect(out).toContain('DOCTOR VISIT SUMMARY');
    expect(out).toContain('Metformin (500 mg tablet)');
    expect(out).toContain('Every day');
  });

  it('reports adherence from real dose history', () => {
    const days = lastNDays(14);
    const m = med({ id: 'x', createdAt: '2020-01-01T00:00:00.000Z' });
    // Take both doses every day in the window → 100%.
    const logs: DoseLog[] = days.flatMap((d) => [
      { medId: 'x', date: d, time: '08:00', takenAt: `${d}T08:00:00Z` },
      { medId: 'x', date: d, time: '20:00', takenAt: `${d}T20:00:00Z` },
    ]);
    const out = buildVisitSummary({ medications: [m], logs, symptoms: [] });
    expect(out).toMatch(/Took 100% of scheduled doses/);
  });

  it('includes recent symptoms and a symptom-related question', () => {
    const out = buildVisitSummary({
      medications: [med()],
      logs: [],
      symptoms: [symptom({ note: 'dizzy after breakfast', severity: 4 })],
    });
    expect(out).toContain('RECENT SYMPTOMS');
    expect(out).toContain('dizzy after breakfast');
    expect(out).toContain('Severe');
    expect(out).toContain('related to any of my medications');
  });

  it('asks about interactions when there are multiple medications', () => {
    const out = buildVisitSummary({
      medications: [med({ id: 'a', name: 'Aspirin' }), med({ id: 'b', name: 'Lisinopril' })],
      logs: [],
      symptoms: [],
    });
    expect(out).toContain('interact with each other');
  });

  it('handles an empty record gracefully', () => {
    const out = buildVisitSummary({ medications: [], logs: [], symptoms: [] });
    expect(out).toContain('None recorded.');
    expect(out).toContain('QUESTIONS TO ASK');
  });
});
