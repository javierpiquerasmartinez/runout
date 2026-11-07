import type { MouseEvent } from 'react'
import { useI18n } from '../i18n'
import { Icon } from '../ui/Icon'
import { cellMilestones, dayOfMonth, monthGrid, type CalendarDate, type Milestone, type Month } from './calendar'
import { dayName, monthHeading, weekdayShort } from './calendarText'
import { MilestoneItem } from './MilestoneItem'

/**
 * A month, Monday first, each day with the titles of its Milestones. Days of
 * the neighbouring months are set apart and today is marked. A click on a
 * day's empty space, or on its "+", asks to create a Milestone on that day.
 */
export function MonthGrid({
  month,
  today,
  milestones,
  onCreate,
}: {
  month: Month
  today: CalendarDate
  /** The Milestones of the grid's days, by date. */
  milestones: ReadonlyMap<CalendarDate, readonly Milestone[]>
  onCreate: (date: CalendarDate) => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const weeks = monthGrid(month)

  function create(event: MouseEvent<HTMLElement>, date: CalendarDate) {
    if ((event.target as Element).closest('[data-milestone]')) return
    onCreate(date)
  }

  return (
    <>
      <div className="calendar-month__weekdays" aria-hidden="true">
        {weeks[0].map(({ date }) => (
          <span key={date} className="calendar-month__weekday">
            {weekdayShort(i18n, date)}
          </span>
        ))}
      </div>
      <div role="grid" aria-label={monthHeading(i18n, month)} className="calendar-month" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((week) => (
          <div role="row" key={week[0].date} className="calendar-month__week">
            {week.map(({ date, inMonth }) => {
              const name = dayName(i18n, date)
              const isToday = date === today
              const { shown, more } = cellMilestones(milestones.get(date) ?? [])
              return (
                <div
                  key={date}
                  role="gridcell"
                  aria-label={isToday ? t('calendar.day.today', { day: name }) : name}
                  className="calendar-month__day"
                  data-date={date}
                  data-outside={inMonth ? undefined : ''}
                  data-today={isToday ? '' : undefined}
                  onClick={(event) => create(event, date)}
                >
                  <span className="calendar-month__number" aria-hidden="true">
                    {dayOfMonth(date)}
                  </span>
                  {shown.map((milestone) => (
                    <MilestoneItem key={milestone.id} milestone={milestone} />
                  ))}
                  {more > 0 && <span className="calendar-month__more">{t('calendar.more', { count: more })}</span>}
                  <button type="button" className="calendar-month__add" aria-label={t('calendar.day.add', { day: name })}>
                    {shown.length === 0 && (
                      <span className="calendar-month__add-hint" aria-hidden="true">
                        <Icon name="add" size={12} />
                        {t('calendar.newMilestone')}
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}
