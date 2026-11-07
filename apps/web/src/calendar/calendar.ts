/**
 * The Calendar's dates, periods and addresses, with no React and no I/O. It
 * is the only place that does date arithmetic. A calendar date is a day with
 * no time and no zone, so every sum is made on UTC days, where no
 * daylight-saving change can move one.
 */

/** A calendar date written `YYYY-MM-DD`, as the API sends it. Two of them compare as text. */
export type CalendarDate = string

/** A month of a year; `month` runs from 1 (January) to 12. */
export interface Month {
  year: number
  month: number
}

/** The two ways the Calendar shows its Milestones. */
export type CalendarView = 'month' | 'week'

/** What the Calendar shows: a month, or the week starting on a Monday. */
export type Period = { view: 'month'; month: Month } | { view: 'week'; monday: CalendarDate }

/** A day of the month grid, and whether it belongs to the month or to a neighbouring one. */
export interface GridDay {
  date: CalendarDate
  inMonth: boolean
}

/** The days from `from` to `to`, both included. */
export interface CalendarSpan {
  from: CalendarDate
  to: CalendarDate
}

/** A Milestone as the API sends it. */
export interface Milestone {
  id: string
  title: string
  /** Empty when there is none. */
  description: string
  date: CalendarDate
  done: boolean
  /** When it was created, as an ISO instant. */
  createdAt: string
}

/** The Calendar ("Calendario"): an Account's study plan. It opens on the current month. */
export const calendarPath = '/calendar'

/** How long a Milestone's title may be, as the server allows it. */
export const MAX_MILESTONE_TITLE_LENGTH = 80

/** How long a Milestone's description may be, as the server allows it. */
export const MAX_MILESTONE_DESCRIPTION_LENGTH = 500

/** How many of a day's Milestones a month cell shows before "+N más". */
export const MILESTONES_PER_CELL = 3

const DAY_MS = 24 * 60 * 60 * 1000

/** The date of a UTC midnight. */
function fromUtc(ms: number): CalendarDate {
  return new Date(ms).toISOString().slice(0, 10)
}

/** The UTC midnight of a date. */
function toUtc(date: CalendarDate): number {
  return Date.parse(`${date}T00:00:00Z`)
}

const pad = (value: number, length: number) => String(value).padStart(length, '0')

/** The date of a day of a month; `day` may run past either end, into the neighbouring months. */
function dateOf(year: number, month: number, day: number): CalendarDate {
  const utc = new Date(0)
  utc.setUTCFullYear(year, month - 1, day)
  return fromUtc(utc.getTime())
}

/** The date written `YYYY-MM-DD`, when it is a real day (no 30 February); null otherwise. */
export function parseDate(text: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  if (month < 1 || month > 12) return null
  return dateOf(year, month, day) === text ? text : null
}

/** The date `days` days after `date`, or before it when negative. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromUtc(toUtc(date) + days * DAY_MS)
}

/** Today in the browser's own zone: the date its clock shows at `now`. */
export function todayOf(now: Date = new Date()): CalendarDate {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`
}

/** The day of the month, from 1 to 31. */
export function dayOfMonth(date: CalendarDate): number {
  return Number(date.slice(8, 10))
}

/** The date as the UTC midnight that starts it: format it with `timeZone: 'UTC'` and Intl names the same day anywhere. */
export function intlDate(date: CalendarDate): Date {
  return new Date(toUtc(date))
}

/** The month a date falls in. */
export function monthOf(date: CalendarDate): Month {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) }
}

/** The day of the week, Monday first: 0 for Monday to 6 for Sunday. */
export function weekdayOf(date: CalendarDate): number {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7
}

/** The Monday of the week a date falls in. */
export function mondayOf(date: CalendarDate): CalendarDate {
  return addDays(date, -weekdayOf(date))
}

/** The seven days of the week starting on `monday`. */
export function weekDays(monday: CalendarDate): CalendarDate[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

/** The first day of a month. */
export function firstOfMonth({ year, month }: Month): CalendarDate {
  return dateOf(year, month, 1)
}

/** The weeks, Monday first, that hold the month's days: four to six of them. */
export function monthGrid({ year, month }: Month): GridDay[][] {
  const first = dateOf(year, month, 1)
  const last = dateOf(year, month + 1, 0)
  const weeks: GridDay[][] = []
  for (let monday = mondayOf(first); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(weekDays(monday).map((date) => ({ date, inMonth: date >= first && date <= last })))
  }
  return weeks
}

/** The month or week before. */
export function previousPeriod(period: Period): Period {
  return movePeriod(period, -1)
}

/** The month or week after. */
export function nextPeriod(period: Period): Period {
  return movePeriod(period, 1)
}

function movePeriod(period: Period, step: number): Period {
  if (period.view === 'week') return { view: 'week', monday: addDays(period.monday, 7 * step) }
  return { view: 'month', month: monthOf(dateOf(period.month.year, period.month.month + step, 1)) }
}

/** The month or the week that holds `today`. */
export function todayPeriod(view: CalendarView, today: CalendarDate): Period {
  return view === 'month' ? { view, month: monthOf(today) } : { view, monday: mondayOf(today) }
}

/**
 * The other view of what is on screen: a month becomes the week of its first
 * day, or today's week when it is the current month; a week becomes the month
 * of its Monday.
 */
export function switchView(period: Period, today: CalendarDate): Period {
  if (period.view === 'week') return { view: 'month', month: monthOf(period.monday) }
  const { year, month } = monthOf(today)
  const current = period.month.year === year && period.month.month === month
  return { view: 'week', monday: mondayOf(current ? today : firstOfMonth(period.month)) }
}

/** The Milestones to fetch for a period: a month's whole grid, neighbouring days included, or a week's seven days. */
export function periodSpan(period: Period): CalendarSpan {
  if (period.view === 'week') return { from: period.monday, to: addDays(period.monday, 6) }
  const weeks = monthGrid(period.month)
  return { from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date }
}

/** Whether this path is the Calendar's or one of its views' or Milestones'. */
export function isCalendarPath(path: string): boolean {
  return path === calendarPath || path.startsWith(`${calendarPath}/`)
}

/** A period's own address: `/calendar/month/YYYY-MM` or `/calendar/week/YYYY-MM-DD` on its Monday. */
export function periodPath(period: Period): string {
  if (period.view === 'week') return `${calendarPath}/week/${period.monday}`
  return `${calendarPath}/month/${pad(period.month.year, 4)}-${pad(period.month.month, 2)}`
}

/**
 * The period an address shows, or null when it shows none or an invalid one.
 * A week's address on another day than Monday is read as that day's week.
 */
export function periodFromPath(path: string): Period | null {
  const monthMatch = /^\/calendar\/month\/(\d{4})-(\d{2})$/.exec(path)
  if (monthMatch) {
    const [year, month] = monthMatch.slice(1).map(Number)
    return month >= 1 && month <= 12 ? { view: 'month', month: { year, month } } : null
  }
  const weekMatch = /^\/calendar\/week\/([^/]+)$/.exec(path)
  const date = weekMatch ? parseDate(weekMatch[1]) : null
  return date ? { view: 'week', monday: mondayOf(date) } : null
}

/** A day's Milestones in the order a day shows them: pending before done, then by creation. */
export function orderDay(milestones: readonly Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt.localeCompare(b.createdAt))
}

/** What a month cell shows of a day's Milestones: the first three in the day's order, and how many more there are. */
export function cellMilestones(milestones: readonly Milestone[]): { shown: Milestone[]; more: number } {
  const ordered = orderDay(milestones)
  return { shown: ordered.slice(0, MILESTONES_PER_CELL), more: Math.max(0, ordered.length - MILESTONES_PER_CELL) }
}

/** Whether a Milestone slipped: not done, on a day before today. */
export function isPending(milestone: Milestone, today: CalendarDate): boolean {
  return !milestone.done && milestone.date < today
}
