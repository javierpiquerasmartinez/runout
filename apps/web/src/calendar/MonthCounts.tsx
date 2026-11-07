import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { dayOfMonth, dayTally, mondayOf, monthGrid, periodPath, type CalendarDate, type Milestone, type Month } from './calendar'
import { dayWithTally, monthHeading, weekdayNarrow } from './calendarText'

/**
 * A month on a narrow screen: each day with how many Milestones it has instead
 * of their titles, the count in brass when one slipped and muted when all are
 * done. Tapping a day opens the week holding it.
 */
export function MonthCounts({
  month,
  today,
  milestones,
}: {
  month: Month
  today: CalendarDate
  /** The Milestones of the grid's days, by date. */
  milestones: ReadonlyMap<CalendarDate, readonly Milestone[]>
}) {
  const i18n = useI18n()
  const { t } = i18n
  const weeks = monthGrid(month)

  return (
    <>
      <div className="calendar-counts__weekdays" aria-hidden="true">
        {weeks[0].map(({ date }) => (
          <span key={date}>{weekdayNarrow(i18n, date)}</span>
        ))}
      </div>
      <div role="group" className="calendar-counts" aria-label={monthHeading(i18n, month)} style={{ gridTemplateRows: `repeat(${weeks.length}, 58px)` }}>
        {weeks.flat().map(({ date, inMonth }) => {
          const tally = dayTally(milestones.get(date) ?? [], today)
          return (
            <a
              key={date}
              href={periodPath({ view: 'week', monday: mondayOf(date) })}
              aria-label={dayWithTally(i18n, date, today, tally)}
              className="calendar-counts__day"
              data-date={date}
              data-outside={inMonth ? undefined : ''}
              data-today={date === today ? '' : undefined}
              onClick={followLink}
            >
              <span className="calendar-counts__number">{dayOfMonth(date)}</span>
              {tally.count > 0 && (
                <span className="calendar-counts__count" data-count data-tone={tally.tone}>
                  {tally.count}
                </span>
              )}
            </a>
          )
        })}
      </div>
      <p className="calendar-counts__hint">{t('calendar.month.tapHint')}</p>
    </>
  )
}
