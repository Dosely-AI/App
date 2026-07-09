import type { Medication } from '@/store/types';

import {
  DEFAULT_LEAD_DAYS,
  dailyConsumption,
  needsRefillAttention,
  refillStatus,
  upcomingRefills,
} from '../refill';

/** Build a medication with sensible refill defaults, overridable per test. */
function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'm1',
    name: 'Test',
    rxcui: null,
    strength: null,
    form: null,
    times: ['08:00'],
    daysOfWeek: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    pillsPerDose: null,
    quantityOnHand: null,
    quantityAsOf: null,
    refillLeadDays: null,
    ...overrides,
  };
}

describe('dailyConsumption', () => {
  it('is one per day for a single daily dose', () => {
    expect(dailyConsumption(med())).toBe(1);
  });

  it('multiplies by dose slots and pills per dose', () => {
    expect(dailyConsumption(med({ times: ['08:00', '20:00'], pillsPerDose: 2 }))).toBe(4);
  });

  it('ignores duplicate times', () => {
    expect(dailyConsumption(med({ times: ['08:00', '08:00'] }))).toBe(1);
  });

  it('averages weekly schedules across the whole week', () => {
    // Mon/Wed/Fri, one pill each of those days -> 3/7 per calendar day.
    expect(dailyConsumption(med({ daysOfWeek: [1, 3, 5] }))).toBeCloseTo(3 / 7);
  });
});

describe('refillStatus', () => {
  it('is untracked when no quantity is counted', () => {
    const s = refillStatus(med(), '2024-01-10');
    expect(s.level).toBe('untracked');
    expect(s.daysLeft).toBeNull();
    expect(s.runOutDate).toBeNull();
  });

  it('projects days left and run-out date from the counted quantity', () => {
    const s = refillStatus(
      med({ quantityOnHand: 30, quantityAsOf: '2024-01-01' }),
      '2024-01-01',
    );
    expect(s.remaining).toBe(30);
    expect(s.daysLeft).toBe(30);
    expect(s.runOutDate).toBe('2024-01-31');
    expect(s.level).toBe('ok');
  });

  it('depletes the counted quantity as days pass', () => {
    const s = refillStatus(
      med({ quantityOnHand: 30, quantityAsOf: '2024-01-01' }),
      '2024-01-21', // 20 days later, 1/day -> 10 left
    );
    expect(s.remaining).toBe(10);
    expect(s.daysLeft).toBe(10);
  });

  it('flags "soon" inside the lead-time window', () => {
    const s = refillStatus(
      med({ quantityOnHand: 30, quantityAsOf: '2024-01-01', refillLeadDays: 7 }),
      '2024-01-25', // 24 days elapsed -> 6 left, within 7-day lead
    );
    expect(s.daysLeft).toBe(6);
    expect(s.level).toBe('soon');
    expect(needsRefillAttention(s)).toBe(true);
  });

  it('reports "out" once supply is depleted', () => {
    const s = refillStatus(
      med({ quantityOnHand: 30, quantityAsOf: '2024-01-01' }),
      '2024-03-01',
    );
    expect(s.remaining).toBe(0);
    expect(s.level).toBe('out');
    expect(s.daysLeft).toBe(0);
    expect(needsRefillAttention(s)).toBe(true);
  });

  it('uses the default lead time when none is set', () => {
    expect(refillStatus(med({ quantityOnHand: 30, quantityAsOf: '2024-01-01' })).leadDays).toBe(
      DEFAULT_LEAD_DAYS,
    );
  });

  it('does not add stock when the count date is in the future', () => {
    const s = refillStatus(
      med({ quantityOnHand: 30, quantityAsOf: '2024-02-01' }),
      '2024-01-01',
    );
    expect(s.remaining).toBe(30);
  });

  it('is "unknown" for an as-needed schedule (no scheduled times)', () => {
    const s = refillStatus(med({ times: [], quantityOnHand: 30, quantityAsOf: '2024-01-01' }));
    expect(s.level).toBe('unknown');
    expect(s.daysLeft).toBeNull();
  });
});

describe('upcomingRefills', () => {
  it('drops untracked meds and sorts most urgent first', () => {
    const a = med({ id: 'a', quantityOnHand: 30, quantityAsOf: '2024-01-01' }); // 20 left on 1/11
    const b = med({ id: 'b', quantityOnHand: 5, quantityAsOf: '2024-01-01' }); // 0 left
    const c = med({ id: 'c' }); // untracked
    const list = upcomingRefills([a, b, c], '2024-01-11');
    expect(list.map((r) => r.med.id)).toEqual(['b', 'a']);
  });
});
