import {
  formatTime12,
  sortTimes,
  summarizeDays,
  summarizeSchedule,
} from '@/features/medications/schedule';

describe('formatTime12', () => {
  it('formats midnight and noon', () => {
    expect(formatTime12('00:00')).toBe('12:00 AM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
  });
  it('formats morning and evening', () => {
    expect(formatTime12('09:30')).toBe('9:30 AM');
    expect(formatTime12('13:05')).toBe('1:05 PM');
    expect(formatTime12('23:59')).toBe('11:59 PM');
  });
  it('returns input unchanged when malformed', () => {
    expect(formatTime12('not-a-time')).toBe('not-a-time');
  });
});

describe('summarizeDays', () => {
  it('treats empty or all-seven as every day', () => {
    expect(summarizeDays([])).toBe('Every day');
    expect(summarizeDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
  });
  it('recognizes weekdays and weekends', () => {
    expect(summarizeDays([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(summarizeDays([0, 6])).toBe('Weekends');
  });
  it('lists specific days, sorted', () => {
    expect(summarizeDays([3, 1])).toBe('Mon, Wed');
  });
});

describe('sortTimes', () => {
  it('sorts ascending and de-duplicates', () => {
    expect(sortTimes(['20:00', '08:00', '08:00'])).toEqual(['08:00', '20:00']);
  });
});

describe('summarizeSchedule', () => {
  it('combines day label and sorted 12h times', () => {
    expect(summarizeSchedule(['20:00', '08:00'], [])).toBe('Every day · 8:00 AM, 8:00 PM');
  });
  it('handles an empty schedule', () => {
    expect(summarizeSchedule([], [])).toBe('No times set');
  });
});
