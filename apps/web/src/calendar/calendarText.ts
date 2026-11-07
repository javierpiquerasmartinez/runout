import type { I18n } from '../i18n/context'
import { firstOfMonth, intlDate, type CalendarDate, type Month } from './calendar'

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

/** "lun", "Mon": a day of the week as a column is headed. */
export function weekdayShort({ formatDate }: Formatter, date: CalendarDate): string {
  return formatDate(intlDate(date), { weekday: 'short', timeZone: 'UTC' })
}
