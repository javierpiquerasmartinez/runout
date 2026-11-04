/*
 * The rules a password follows (ADR 0008, after NIST SP 800-63B): long
 * enough, not absurdly long, any characters at all, and not one everybody
 * guesses first. No mix of upper case, digits or symbols is asked for. The
 * web shows the same rules while typing; the server is the one that decides.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export type PasswordProblem = 'too-short' | 'too-long' | 'common';

/** What is wrong with a password, or null when it may be used. */
export function passwordProblem(
  password: string,
  common: ReadonlySet<string>,
): PasswordProblem | null {
  // In Unicode code points, as NIST counts them, so most emoji are one.
  // oxlint-disable-next-line typescript/no-misused-spread
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return 'too-short';
  if (length > PASSWORD_MAX_LENGTH) return 'too-long';
  if (common.has(password.toLowerCase())) return 'common';
  return null;
}

/** Failed password sign-ins at one email that cost nothing. */
export const FREE_FAILURES = 5;

const MINUTE = 60_000;
/** The wait after each failure past the free ones; the last one repeats. */
const WAITS = [1, 5, 15, 60].map((minutes) => minutes * MINUTE);

/**
 * How long, in ms, the next attempt at an email waits after its `failures`-th
 * consecutive failure. A growing pause, never a lock: nobody can keep someone
 * else out of their Account for good.
 */
export function waitAfterFailures(failures: number): number {
  if (failures <= FREE_FAILURES) return 0;
  return WAITS[Math.min(failures - FREE_FAILURES, WAITS.length) - 1];
}
