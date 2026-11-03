import { Rejected } from '../rejection/rejection.js';
import {
  SUMMARY_LANGUAGES,
  type SummaryLanguage,
} from './replay/hand-summary.js';

/**
 * What a copy of a Hand is asked for: which version, and for the Hand
 * Summary the language it is written in and the time zone of its date.
 *
 * Query: `as` (`summary` for the Hand Summary, `history` for the Hand
 * History as it came in), `language` (`es` or `en`; `es` if left out) and
 * `timeZone` (an IANA name; `UTC` if left out).
 */
export interface HandCopyRequest {
  as: 'summary' | 'history';
  language: SummaryLanguage;
  timeZone: string;
}

/** Reads a copy request from a request's query; `invalid-hand-copy` if it can't. */
export function parseHandCopy(query: Record<string, unknown>): HandCopyRequest {
  const as = single(query.as);
  const language = single(query.language) ?? 'es';
  const timeZone = single(query.timeZone) ?? 'UTC';
  if (
    (as !== 'summary' && as !== 'history') ||
    !SUMMARY_LANGUAGES.includes(language as SummaryLanguage) ||
    !isTimeZone(timeZone)
  ) {
    throw new Rejected('invalid-hand-copy');
  }
  return { as, language: language as SummaryLanguage, timeZone };
}

function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

function single(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') throw new Rejected('invalid-hand-copy');
  return raw;
}
