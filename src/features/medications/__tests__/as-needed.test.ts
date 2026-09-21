import type { DoseLog, Medication } from '@/store/types';

import { isAsNeeded, prnLogsToday, prnStatus, timeSince } from '../as-needed';

const TODAY = '2026-07-23';

function med(over: Partial<Medication> = {}): Medication {
  return {
    id: 'm1',
    name: 'Ibuprofen',
    rxcui: null,
    strength: '200 mg',
    form: 'tablet',
    times: [],
    daysOfWeek: [],
    createdAt: '2026-01-01T00:00:00Z',
    asNeeded: true,
    maxPerDay: 4,
    ...over,
  };
}

function log(over: Partial<DoseLog> = {}): DoseLog {
  return { medId: 'm1', date: TODAY, time: '08:00', takenAt: '2026-07-23T08:00:00.000Z', ...over };
}

describe('isAsNeeded', () => {
  it('is true only when asNeeded is set', () => {
    expect(isAsNeeded(med({ asNeeded: true }))).toBe(true);
    expect(isAsNeeded(med({ asNeeded: false }))).toBe(false);
    expect(isAsNeeded({ asNeeded: undefined })).toBe(false);
  });
});

describe('prnLogsToday', () => {
  it('returns only this medication’s doses for today, oldest first', () => {
    const logs = [
      log({ takenAt: '2026-07-23T14:00:00.000Z', time: '14:00' }),
      log({ takenAt: '2026-07-23T09:00:00.000Z', time: '09:00' }),
      log({ medId: 'other', takenAt: '2026-07-23T10:00:00.000Z' }),
      log({ date: '2026-07-22', takenAt: '2026-07-22T09:00:00.000Z' }),
    ];
    const today = prnLogsToday(med(), logs, TODAY);
    expect(today.map((l) => l.time)).toEqual(['09:00', '14:00']);
  });
});

describe('prnStatus', () => {
  it('counts today’s doses and computes remaining under the max', () => {
    const logs = [log({ time: '09:00' }), log({ time: '13:00', takenAt: '2026-07-23T13:00:00.000Z' })];
    const s = prnStatus(med({ maxPerDay: 4 }), logs, TODAY);
    expect(s.count).toBe(2);
    expect(s.max).toBe(4);
    expect(s.remaining).toBe(2);
    expect(s.atLimit).toBe(false);
    expect(s.overLimit).toBe(false);
    expect(s.lastTakenAt).toBe('2026-07-23T13:00:00.000Z');
  });

  it('flags reaching and exceeding the maximum', () => {
    const four = [1, 2, 3, 4].map((h) => log({ takenAt: `2026-07-23T0${h}:00:00.000Z` }));
    const at = prnStatus(med({ maxPerDay: 4 }), four, TODAY);
    expect(at.atLimit).toBe(true);
    expect(at.overLimit).toBe(false);
    expect(at.remaining).toBe(0);

    const five = [...four, log({ takenAt: '2026-07-23T05:00:00.000Z' })];
    const over = prnStatus(med({ maxPerDay: 4 }), five, TODAY);
    expect(over.atLimit).toBe(true);
    expect(over.overLimit).toBe(true);
    expect(over.remaining).toBe(0);
  });

  it('handles no max set', () => {
    const s = prnStatus(med({ maxPerDay: null }), [log()], TODAY);
    expect(s.max).toBeNull();
    expect(s.remaining).toBeNull();
    expect(s.atLimit).toBe(false);
    expect(s.overLimit).toBe(false);
  });

  it('is empty when nothing was taken today', () => {
    const s = prnStatus(med(), [log({ date: '2026-07-22' })], TODAY);
    expect(s.count).toBe(0);
    expect(s.lastTakenAt).toBeNull();
  });
});

describe('timeSince', () => {
  const now = new Date('2026-07-23T12:00:00.000Z');
  it('formats elapsed time in the largest sensible unit', () => {
    expect(timeSince(null, now)).toBeNull();
    expect(timeSince('2026-07-23T11:59:40.000Z', now)).toBe('just now');
    expect(timeSince('2026-07-23T11:30:00.000Z', now)).toBe('30m ago');
    expect(timeSince('2026-07-23T09:00:00.000Z', now)).toBe('3h ago');
    expect(timeSince('2026-07-21T12:00:00.000Z', now)).toBe('2d ago');
  });
});
