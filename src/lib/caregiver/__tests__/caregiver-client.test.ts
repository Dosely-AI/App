import { dateKey } from '@/features/adherence/dates';

import { summarizePatient } from '../caregiver-client';

const today = dateKey(new Date());

const patientData = {
  medications: [
    {
      id: 'a',
      name: 'Metformin',
      rxcui: null,
      strength: null,
      form: null,
      times: ['08:00', '20:00'],
      daysOfWeek: [],
      createdAt: '2020-01-01T00:00:00.000Z',
      quantityOnHand: 4,
      quantityAsOf: today,
      pillsPerDose: 1,
    },
  ],
  logs: [{ medId: 'a', date: today, time: '08:00', takenAt: `${today}T08:00:00Z` }],
  symptoms: [
    { id: 's1', date: today, severity: 4, note: 'headache', createdAt: `${today}T09:00:00Z` },
    { id: 's2', date: today, severity: 2, note: 'tired', createdAt: `${today}T07:00:00Z` },
  ],
  emergency: null,
};

describe('summarizePatient', () => {
  it("reports today's dose progress", () => {
    const s = summarizePatient(patientData);
    expect(s.todayTotal).toBe(2); // two scheduled slots today
    expect(s.todayTaken).toBe(1); // took the 08:00
  });

  it('surfaces a low refill', () => {
    const s = summarizePatient(patientData);
    // 4 pills on hand, ~2/day -> runs out in ~2 days -> "soon"
    expect(s.refillsLow.some((r) => r.name === 'Metformin')).toBe(true);
  });

  it('lists recent symptoms newest-first', () => {
    const s = summarizePatient(patientData);
    expect(s.recentSymptoms[0].note).toBe('headache');
    expect(s.recentSymptoms).toHaveLength(2);
  });

  it('handles missing or malformed data without throwing', () => {
    expect(summarizePatient(null).todayTotal).toBe(0);
    expect(summarizePatient({}).recentSymptoms).toEqual([]);
    expect(summarizePatient({ medications: 'oops' }).todayTotal).toBe(0);
  });
});
