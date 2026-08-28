/**
 * Local-date helpers.
 *
 * Every date in this app is a calendar day in the worker's own timezone, not an
 * instant. That distinction matters: toISOString() converts to UTC first, so at
 * 00:30 IST it returns *yesterday's* date and "Today's Kamai" silently shows the
 * wrong day for the first five and a half hours of every morning.
 *
 * These build the string from local components instead.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD in local time. */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today, as YYYY-MM-DD in local time. */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/** N days before today, as YYYY-MM-DD in local time. */
export function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
}
