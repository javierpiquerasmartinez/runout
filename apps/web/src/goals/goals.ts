/**
 * What a Goal's numbers come to, and how they are written, with no React and
 * no I/O. It is the only place that decides any of this.
 */
import type { Locale } from '../i18n'

/** A Goal as the API sends it. */
export interface Goal {
  id: string
  name: string
  /** Empty when there is none. */
  description: string
  target: number
  currentValue: number
  /** A calendar date, `YYYY-MM-DD`. */
  startDate: string
  /** A calendar date, `YYYY-MM-DD`. */
  deadline: string
  createdAt: string
}

/** The section's address. */
export const goalsPath = '/goals'

/** How long a Goal's name may be, in characters. */
export const MAX_GOAL_NAME_LENGTH = 80

/** The largest a Target may be. */
const MAX_AMOUNT = 999_999_999

/** An amount has two decimals at most, so in hundredths it is a whole number. */
const hundredths = (amount: number) => Math.round(amount * 100)

/**
 * A Goal's Progress as a whole percentage, rounded down, with no upper limit.
 * Made on whole hundredths, where floating-point error can't push it past the
 * true value or hold it short.
 */
export function progressOf({ currentValue, target }: Pick<Goal, 'currentValue' | 'target'>): number {
  return Math.floor((hundredths(currentValue) * 100) / hundredths(target))
}

/** How full a Goal's bar is, as a percentage: its Progress, stopping at 100. */
export function barFill(goal: Pick<Goal, 'currentValue' | 'target'>): number {
  return Math.min(progressOf(goal), 100)
}

/** The shape of a number each UI language writes: its digits, grouped in thousands or not, then its decimals. */
const amountShape: Record<Locale, { pattern: RegExp; group: string; decimal: string }> = {
  es: { pattern: /^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/, group: '.', decimal: ',' },
  en: { pattern: /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/, group: ',', decimal: '.' },
}

/**
 * A number as typed, the way the UI language writes numbers; null when it
 * isn't one. A separator that the language wouldn't put there is refused
 * rather than guessed at, so "5.5" in Spanish is no number.
 */
export function readAmount(text: string, locale: Locale): number | null {
  const { pattern, group, decimal } = amountShape[locale]
  const typed = text.trim()
  if (!pattern.test(typed)) return null
  return Number(typed.replaceAll(group, '').replace(decimal, '.'))
}

/** A number written the way the UI language does. */
export function writeAmount(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount)
}

/** Whether a number can be a Target: above 0, up to 999,999,999, with two decimals at most. */
export function isValidTarget(amount: number): boolean {
  return amount > 0 && amount <= MAX_AMOUNT && /^\d+(\.\d{1,2})?$/.test(String(amount))
}
