import { Rejected, type RejectionReason } from '../rejection/rejection.js';

/** The longest span of days the Calendar lists at once, both ends counted. */
export const MAX_SPAN_DAYS = 62;

/** The days from `from` to `to`, both included, that the Calendar lists. */
export interface CalendarSpan {
  from: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A calendar date written `YYYY-MM-DD`, when it is a real day (no 30
 * February); `reason` otherwise. Returned as written.
 */
export function calendarDate(raw: unknown, reason: RejectionReason): string {
  if (typeof raw !== 'string') throw new Rejected(reason);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) throw new Rejected(reason);
  const [year, month, day] = match.slice(1).map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Rejected(reason);
  }
  return raw;
}

/**
 * Reads the viewer's today from a request's query (`today`, a real date);
 * `invalid-calendar-span` if it can't.
 */
export function parseCalendarToday(query: Record<string, unknown>): string {
  return calendarDate(query.today, 'invalid-calendar-span');
}

/**
 * Reads the span from a request's query (`from` and `to`, both real dates,
 * `from` not after `to`, at most `MAX_SPAN_DAYS` days);
 * `invalid-calendar-span` if it can't.
 */
export function parseCalendarSpan(
  query: Record<string, unknown>,
): CalendarSpan {
  const from = calendarDate(query.from, 'invalid-calendar-span');
  const to = calendarDate(query.to, 'invalid-calendar-span');
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (days < 1 || days > MAX_SPAN_DAYS) {
    throw new Rejected('invalid-calendar-span');
  }
  return { from, to };
}
