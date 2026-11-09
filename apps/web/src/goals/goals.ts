/**
 * What a Goal's numbers come to, and how they are written, with no React and
 * no I/O. It is the only place that decides any of this.
 */
import { daysBetween, type CalendarDate } from '../calendar/calendar'
import type { Locale } from '../i18n'

/** A Goal as the API sends it. */
export interface Goal {
  id: string
  name: string
  /** Empty when there is none. */
  description: string
  target: number
  currentValue: number
  startDate: CalendarDate
  deadline: CalendarDate
  createdAt: string
}

/** What a Goal's Goal Status and countdown are worked out from. */
export type GoalStanding = Pick<Goal, 'currentValue' | 'target' | 'startDate' | 'deadline'>

/** Where a Goal stands on a given day. It is always worked out, never stored or set by anyone. */
export type GoalStatus = 'notStarted' | 'inProgress' | 'achieved' | 'expired'

/** How much time a Goal has, for the screen to put into words; a Goal that is Achieved has none. */
export type Countdown = { kind: 'startsIn' | 'daysLeft' | 'expiredAgo'; days: number } | { kind: 'lastDay' } | null

/** The section's address. */
export const goalsPath = '/goals'

/** How long a Goal's name may be, in characters. */
export const MAX_GOAL_NAME_LENGTH = 80

/** How long a Goal's description may be, in characters. */
export const MAX_GOAL_DESCRIPTION_LENGTH = 500

/** The largest a Target or a Current Value may be. */
const MAX_GOAL_NUMBER = 999_999_999

/** How many decimals a Target or a Current Value may have. */
const MAX_DECIMALS = 2

/** A Target or a Current Value has two decimals at most, so in hundredths it is a whole number. */
const hundredths = (value: number) => Math.round(value * 100)

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

/**
 * A Goal's Goal Status on a given day: Achieved once its Current Value reaches
 * its Target, whatever the date; otherwise Not Started before the Start Date,
 * In Progress up to and including the Deadline, and Expired after it.
 */
export function goalStatusOn({ currentValue, target, startDate, deadline }: GoalStanding, today: CalendarDate): GoalStatus {
  if (hundredths(currentValue) >= hundredths(target)) return 'achieved'
  if (today < startDate) return 'notStarted'
  return today <= deadline ? 'inProgress' : 'expired'
}

/** A Goal's countdown on a given day. */
export function countdownOn(goal: GoalStanding, today: CalendarDate): Countdown {
  switch (goalStatusOn(goal, today)) {
    case 'achieved':
      return null
    case 'notStarted':
      return { kind: 'startsIn', days: daysBetween(today, goal.startDate) }
    case 'expired':
      return { kind: 'expiredAgo', days: daysBetween(goal.deadline, today) }
    case 'inProgress':
      return today === goal.deadline ? { kind: 'lastDay' } : { kind: 'daysLeft', days: daysBetween(today, goal.deadline) }
  }
}

/**
 * The Goals in the order of the list: what is still open first, soonest
 * Deadline on top; then what is over, latest Deadline on top. Ties go by
 * creation, oldest first.
 */
export function orderGoals(goals: readonly Goal[], today: CalendarDate): Goal[] {
  const isOver = (goal: Goal) => ['achieved', 'expired'].includes(goalStatusOn(goal, today))
  return [...goals].sort((a, b) => {
    const group = Number(isOver(a)) - Number(isOver(b))
    if (group !== 0) return group
    const byDeadline = a.deadline.localeCompare(b.deadline)
    return (isOver(a) ? -byDeadline : byDeadline) || a.createdAt.localeCompare(b.createdAt)
  })
}

/** The shape of a number each UI language writes: its digits, grouped in thousands or not, then its decimals. */
const numberShapes: Record<Locale, { pattern: RegExp; group: string; decimal: string }> = {
  es: { pattern: /^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/, group: '.', decimal: ',' },
  en: { pattern: /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/, group: ',', decimal: '.' },
}

/**
 * A number as typed, the way the UI language writes numbers; null when it
 * isn't one. A separator that the language wouldn't put there is refused
 * rather than guessed at, so "5.5" in Spanish is no number.
 */
export function readGoalNumber(text: string, locale: Locale): number | null {
  const { pattern, group, decimal } = numberShapes[locale]
  const typed = text.trim()
  if (!pattern.test(typed)) return null
  return Number(typed.replaceAll(group, '').replace(decimal, '.'))
}

/** How many decimals a number has as typed: "5,500" has three, though it is worth 5.5. */
function typedDecimals(text: string, locale: Locale): number {
  const [, decimals = ''] = text.trim().split(numberShapes[locale].decimal)
  return decimals.length
}

/** A Current Value as typed; null when it can't be one, by what it is worth or by its decimals as typed. */
export function readCurrentValue(text: string, locale: Locale): number | null {
  const value = readGoalNumber(text, locale)
  return value !== null && typedDecimals(text, locale) <= MAX_DECIMALS && isValidCurrentValue(value) ? value : null
}

/** A Target as typed; null when it can't be one, by what it is worth or by its decimals as typed. */
export function readTarget(text: string, locale: Locale): number | null {
  const value = readCurrentValue(text, locale)
  return value !== null && isValidTarget(value) ? value : null
}

/** A Target or a Current Value written the way the UI language does, with the language's own `formatNumber`. */
export function writeGoalNumber(value: number, formatNumber: (value: number, options: Intl.NumberFormatOptions) => string): string {
  return formatNumber(value, { maximumFractionDigits: 2 })
}

/** Whether a number can be a Current Value: from 0 up to 999,999,999, with two decimals at most. */
export function isValidCurrentValue(value: number): boolean {
  return value <= MAX_GOAL_NUMBER && /^\d+(\.\d{1,2})?$/.test(String(value))
}

/** Whether a number can be a Target: as a Current Value, but above 0. */
export function isValidTarget(value: number): boolean {
  return value > 0 && isValidCurrentValue(value)
}
