import { dateKey, dayOfWeek, lastNDays, parseDateKey } from '@/features/adherence/dates';

describe('dateKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 6, 6))).toBe('2026-07-06');
    expect(dateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('parseDateKey', () => {
  it('round-trips with dateKey', () => {
    const d = parseDateKey('2026-07-06');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(6);
  });
});

describe('dayOfWeek', () => {
  it('matches the native Date day', () => {
    expect(dayOfWeek('2026-07-06')).toBe(new Date(2026, 6, 6).getDay());
  });
});

describe('lastNDays', () => {
  it('returns n consecutive local dates, oldest first, inclusive of upto', () => {
    expect(lastNDays(3, new Date(2026, 6, 8))).toEqual(['2026-07-06', '2026-07-07', '2026-07-08']);
  });
  it('handles month boundaries', () => {
    expect(lastNDays(2, new Date(2026, 7, 1))).toEqual(['2026-07-31', '2026-08-01']);
  });
});
