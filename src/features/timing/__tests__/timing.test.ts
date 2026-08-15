import {
  dailyTimings,
  doseSlots,
  doseTimings,
  primaryDose,
  recentDoseSlots,
  timingInsight,
  timingStats,
  type TimingStats,
} from '@/features/timing/timing';
import type { DoseLog, Medication } from '@/store/types';

const med = (over: Partial<Medication> = {}): Medication => ({
  id: 'a',
  name: 'A',
  rxcui: null,
  strength: null,
  form: null,
  times: ['08:00', '20:00'],
  daysOfWeek: [],
  createdAt: '2026-07-01T00:00:00',
  ...over,
});

const log = (medId: string, date: string, time: string, takenAt: string): DoseLog => ({
  medId,
  date,
  time,
  takenAt,
});

const NOW = new Date(2026, 6, 7, 12, 0, 0); // Jul 7 2026, 12:00 local
const DAYS = ['2026-07-06', '2026-07-07'];

const takenLogs = [
  log('a', '2026-07-06', '08:00', '2026-07-06T08:10:00'), // 10 min -> onTime
  log('a', '2026-07-06', '20:00', '2026-07-06T21:30:00'), // 90 min -> late
  log('a', '2026-07-07', '08:00', '2026-07-07T09:00:00'), // 60 min -> late
  // 2026-07-07 20:00 has no log and is in the future -> upcoming
];

describe('doseTimings', () => {
  it('classifies on-time, late, and upcoming with delays', () => {
    const t = doseTimings([med()], takenLogs, DAYS, NOW);
    expect(t.map((x) => [x.date, x.time, x.status, x.delayMinutes])).toEqual([
      ['2026-07-06', '08:00', 'onTime', 10],
      ['2026-07-06', '20:00', 'late', 90],
      ['2026-07-07', '08:00', 'late', 60],
      ['2026-07-07', '20:00', 'upcoming', null],
    ]);
  });

  it('treats a dose logged the next day as missed, not a 24h delay', () => {
    const t = doseTimings([med()], [log('a', '2026-07-06', '08:00', '2026-07-07T07:00:00')], ['2026-07-06'], NOW);
    expect(t[0].status).toBe('missed');
    expect(t[0].delayMinutes).toBeNull();
  });

  it('marks a past unlogged dose as missed and a future one as upcoming', () => {
    const past = doseTimings([med({ times: ['10:00'] })], [], ['2026-07-06'], NOW);
    expect(past[0].status).toBe('missed');
    const future = doseTimings([med({ times: ['20:00'] })], [], ['2026-07-07'], NOW);
    expect(future[0].status).toBe('upcoming');
  });
});

describe('timingStats', () => {
  it('summarizes taken/on-time/late/missed and delays', () => {
    const s = timingStats(doseTimings([med()], takenLogs, DAYS, NOW));
    expect(s).toMatchObject({
      total: 3,
      taken: 3,
      onTime: 1,
      late: 2,
      missed: 0,
      avgDelayMin: 53, // (10+90+60)/3
      medianDelayMin: 60,
      onTimeRate: 33,
      missedRate: 0,
    });
  });
});

describe('dailyTimings', () => {
  it('produces one point per day with avg delay and missed count', () => {
    const d = dailyTimings(doseTimings([med()], takenLogs, DAYS, NOW), DAYS);
    expect(d[0]).toMatchObject({ date: '2026-07-06', taken: 2, missed: 0, avgDelayMin: 50 });
    expect(d[1]).toMatchObject({ date: '2026-07-07', taken: 1, missed: 0, avgDelayMin: 60 });
  });
});

describe('primaryDose', () => {
  it('returns the most-recently-due untaken dose', () => {
    const p = primaryDose(doseSlots([med()], [], DAYS), NOW);
    expect(p).toMatchObject({ date: '2026-07-07', time: '08:00' });
  });

  it('falls back to the soonest upcoming dose when none are due', () => {
    const p = primaryDose(doseSlots([med({ times: ['20:00'] })], [], ['2026-07-07']), NOW);
    expect(p?.time).toBe('20:00');
  });

  it('returns null when everything is taken', () => {
    const logs = DAYS.flatMap((d) =>
      ['08:00', '20:00'].map((tm) => log('a', d, tm, `${d}T${tm}:00`)),
    );
    expect(primaryDose(doseSlots([med()], logs, DAYS), NOW)).toBeNull();
  });
});

describe('recentDoseSlots', () => {
  it('returns only slots within the last 24 hours', () => {
    const rs = recentDoseSlots([med()], [], NOW, 24);
    expect(rs.map((s) => `${s.date} ${s.time}`)).toEqual([
      '2026-07-06 20:00',
      '2026-07-07 08:00',
      '2026-07-07 20:00',
    ]);
  });
});

describe('timingInsight', () => {
  const mk = (over: Partial<TimingStats>): TimingStats => ({
    total: 10,
    taken: 10,
    onTime: 10,
    late: 0,
    missed: 0,
    avgDelayMin: 0,
    medianDelayMin: 0,
    onTimeRate: 100,
    missedRate: 0,
    ...over,
  });

  it('maps patterns to clinical terms', () => {
    expect(timingInsight(mk({ total: 2 })).term).toMatch(/enough data/i);
    expect(timingInsight(mk({ missedRate: 60 })).term).toBe('Medication nonadherence');
    expect(timingInsight(mk({ missedRate: 30 })).term).toBe('Suboptimal adherence');
    expect(timingInsight(mk({ missedRate: 0, avgDelayMin: 120, taken: 5 })).term).toBe(
      'Inconsistent dose timing',
    );
    expect(timingInsight(mk({ missedRate: 0, avgDelayMin: 45 })).term).toBe('Minor timing drift');
    expect(timingInsight(mk({ missedRate: 0, avgDelayMin: 10 })).term).toBe('Good adherence');
  });
});
