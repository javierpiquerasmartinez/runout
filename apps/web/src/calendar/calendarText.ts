import type { I18n } from '../i18n/context'
import { addDays, dayOfMonth, firstOfMonth, intlDate, monthOf, type CalendarDate, type Month } from './calendar'

type Formatter = Pick<I18n, 'formatDate' | 'locale'>

/** "Noviembre 2026", "November 2026": a month as the Calendar's heading says it. */
export function monthHeading({ formatDate, locale }: Formatter, month: Month): string {
  const name = formatDate(intlDate(firstOfMonth(month)), { month: 'long', timeZone: 'UTC' })
  return `${name.charAt(0).toLocaleUpperCase(locale)}${name.slice(1)} ${month.year}`
}

/** "domingo, 1 de noviembre", "Sunday, November 1": a day as a cell is named. */
export function dayName({ formatDate }: Formatter, date: CalendarDate): string {
  return formatDate(intlDate(date), { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/**
 * "9 – 15 nov 2026", "Nov 30 – Dec 6, 2026": the week starting on `monday`,
 * as the Calendar's heading says it, naming a month or year only where the
 * week crosses into another.
 */
export function weekHeading({ formatDate, t }: Formatter & Pick<I18n, 't'>, monday: CalendarDate): string {
  const sunday = addDays(monday, 6)
  const monthName = (date: CalendarDate) => formatDate(intlDate(date), { month: 'short', timeZone: 'UTC' })
  const from = monthOf(monday)
  const to = monthOf(sunday)
  const params = {
    fromDay: dayOfMonth(monday),
    toDay: dayOfMonth(sunday),
    fromMonth: monthName(monday),
    toMonth: monthName(sunday),
    fromYear: from.year,
    toYear: to.year,
  }
  if (from.year !== to.year) return t('calendar.week.headingAcrossYears', params)
  if (from.month !== to.month) return t('calendar.week.headingAcrossMonths', { ...params, year: to.year })
  return t('calendar.week.heading', { ...params, month: params.fromMonth, year: to.year })
}

/** "lun", "Mon": a day of the week as a column is headed. */
export function weekdayShort({ formatDate }: Formatter, date: CalendarDate): string {
  return formatDate(intlDate(date), { weekday: 'short', timeZone: 'UTC' })
}
