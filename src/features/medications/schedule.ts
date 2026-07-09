/** Pure helpers for displaying dosing schedules. No I/O — easy to unit test. */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** "08:00" -> "8:00 AM", "13:05" -> "1:05 PM". */
export function formatTime12(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Human label for a day-of-week set. Empty or all-seven means every day. */
export function summarizeDays(days: number[]): string {
  if (days.length === 0 || days.length === 7) return 'Every day';
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const key = sorted.join(',');
  if (key === '1,2,3,4,5') return 'Weekdays';
  if (key === '0,6') return 'Weekends';
  return sorted.map((d) => DAY_LABELS[d]).join(', ');
}

/** Unique, ascending list of "HH:MM" times. */
export function sortTimes(times: string[]): string[] {
  return [...new Set(times)].sort();
}

/** e.g. "Every day · 8:00 AM, 8:00 PM" or "Mon, Wed · 9:00 AM". */
export function summarizeSchedule(times: string[], days: number[]): string {
  if (times.length === 0) return 'No times set';
  const timeStr = sortTimes(times).map(formatTime12).join(', ');
  return `${summarizeDays(days)} · ${timeStr}`;
}
