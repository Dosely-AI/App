/** Local-date helpers. We key days by local calendar date so "today" matches
 * the user's wall clock, not UTC. */

/** Date -> 'YYYY-MM-DD' using local time. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' -> local Date at midnight. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 0=Sun..6=Sat for a date key. */
export function dayOfWeek(key: string): number {
  return parseDateKey(key).getDay();
}

/** The last `n` local dates ending at `upto` (inclusive), oldest first. */
export function lastNDays(n: number, upto: Date = new Date()): string[] {
  const base = new Date(upto.getFullYear(), upto.getMonth(), upto.getDate());
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(dateKey(d));
  }
  return out;
}
