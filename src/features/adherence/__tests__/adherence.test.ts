import {
  computeDaily,
  currentStreak,
  expectedSlots,
  generateTips,
  overall,
  perMed,
  ratingFor,
} from '@/features/adherence/adherence';
import type { DoseLog, Medication } from '@/store/types';

const med = (over: Partial<Medication> = {}): Medication => ({
  id: 'a',
  name: 'Ibuprofen',
  rxcui: null,
  strength: null,
  form: null,
  times: ['08:00', '20:00'],
  daysOfWeek: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const log = (medId: string, date: string, time: string): DoseLog => ({
  medId,
  date,
  time,
  takenAt: `${date}T00:00:00.000Z`,
});

const DAYS = ['2026-07-06', '2026-07-07', '2026-07-08'];

describe('expectedSlots', () => {
  it('returns all times on an applicable day', () => {
    expect(expectedSlots(med(), '2026-07-06')).toEqual(['08:00', '20:00']);
  });

  it('honors days-of-week restrictions', () => {
    const key = '2026-07-06';
    const dow = new Date(2026, 6, 6).getDay();
    expect(expectedSlots(med({ daysOfWeek: [dow] }), key)).toHaveLength(2);
    expect(expectedSlots(med({ daysOfWeek: [(dow + 1) % 7] }), key)).toEqual([]);
  });

  it('is not expected before the medication was added', () => {
    const m = med({ createdAt: '2026-07-10T12:00:00.000Z' });
    expect(expectedSlots(m, '2026-07-08')).toEqual([]); // before it existed
    expect(expectedSlots(m, '2026-07-10')).toHaveLength(2); // the day it was added
    expect(expectedSlots(m, '2026-07-12')).toHaveLength(2); // after
  });

  it('does not let pre-existence days drag down adherence', () => {
    // Added 07-10, took both doses that day; days 07-08/09 must not count as missed.
    const m = med({ id: 'x', createdAt: '2026-07-10T12:00:00.000Z' });
    const taken = [log('x', '2026-07-10', '08:00'), log('x', '2026-07-10', '20:00')];
    const daily = computeDaily([m], taken, ['2026-07-08', '2026-07-09', '2026-07-10']);
    expect(daily[0].pct).toBeNull(); // no data before it existed
    expect(daily[1].pct).toBeNull();
    expect(daily[2].pct).toBe(100);
    expect(overall(daily).pct).toBe(100); // not 33%
  });
});

describe('computeDaily / overall / perMed', () => {
  const meds = [med()];
  const logs = [
    log('a', '2026-07-06', '08:00'),
    log('a', '2026-07-06', '20:00'),
    log('a', '2026-07-07', '08:00'),
  ];

  it('computes per-day expected/taken/pct', () => {
    const daily = computeDaily(meds, logs, DAYS);
    expect(daily).toEqual([
      { date: '2026-07-06', expected: 2, taken: 2, pct: 100 },
      { date: '2026-07-07', expected: 2, taken: 1, pct: 50 },
      { date: '2026-07-08', expected: 2, taken: 0, pct: 0 },
    ]);
  });

  it('aggregates overall adherence', () => {
    expect(overall(computeDaily(meds, logs, DAYS))).toEqual({ expected: 6, taken: 3, pct: 50 });
  });

  it('reports null pct when nothing is expected', () => {
    const daily = computeDaily([med({ daysOfWeek: [] })], [], []);
    expect(overall(daily)).toEqual({ expected: 0, taken: 0, pct: null });
  });

  it('breaks adherence down per medication', () => {
    const pm = perMed(meds, logs, DAYS);
    expect(pm).toEqual([{ medId: 'a', name: 'Ibuprofen', expected: 6, taken: 3, pct: 50 }]);
  });
});

describe('currentStreak', () => {
  it('counts consecutive fully-taken most-recent days', () => {
    const logs = [
      log('a', '2026-07-07', '08:00'),
      log('a', '2026-07-07', '20:00'),
      log('a', '2026-07-08', '08:00'),
      log('a', '2026-07-08', '20:00'),
    ];
    expect(currentStreak([med()], logs, DAYS)).toBe(2);
  });

  it('breaks the streak on a missed most-recent day', () => {
    const logs = [log('a', '2026-07-07', '08:00'), log('a', '2026-07-07', '20:00')];
    expect(currentStreak([med()], logs, DAYS)).toBe(0);
  });
});

describe('ratingFor', () => {
  it('maps percentages to bands', () => {
    expect(ratingFor(null).label).toBe('No data yet');
    expect(ratingFor(95).label).toBe('Excellent');
    expect(ratingFor(80).label).toBe('Good');
    expect(ratingFor(60).label).toBe('Needs work');
    expect(ratingFor(20).label).toBe('At risk');
  });
});

describe('generateTips', () => {
  it('prompts to add meds when there are none', () => {
    expect(generateTips([], [], DAYS)[0]).toMatch(/add your medications/i);
  });

  it('prompts to log when nothing has been taken/expected', () => {
    expect(generateTips([med()], [], [])[0]).toMatch(/took it/i);
  });

  it('surfaces the worst time-of-day when data supports it', () => {
    // 08:00 always taken, 20:00 never taken across 3 days -> 20:00 is worst.
    const logs = DAYS.map((d) => log('a', d, '08:00'));
    const tips = generateTips([med()], logs, DAYS);
    expect(tips.join(' ')).toMatch(/8:00 PM/);
    expect(tips.length).toBeLessThanOrEqual(3);
  });
});
