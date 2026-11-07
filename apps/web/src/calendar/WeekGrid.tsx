import type { MouseEvent } from 'react'
import { useI18n } from '../i18n'
import { Icon } from '../ui/Icon'
import { dayOfMonth, orderDay, weekDays, type CalendarDate, type Milestone } from './calendar'
import { dayName, weekdayShort } from './calendarText'
import { MilestoneItem } from './MilestoneItem'

/**
 * A week in seven columns, Monday to Sunday, each listing every Milestone of
 * its day in the day's order. Today is marked. A click on a day's empty space,
 * or on its "+", asks to create a Milestone on that day.
 */
export function WeekGrid({
  monday,
  today,
  milestones,
  onCreate,
}: {
  monday: CalendarDate
  today: CalendarDate
  /** The Milestones of the week's days, by date. */
  milestones: ReadonlyMap<CalendarDate, readonly Milestone[]>
  onCreate: (date: CalendarDate) => void
}) {
  const i18n = useI18n()
  const { t } = i18n

  function create(event: MouseEvent<HTMLElement>, date: CalendarDate) {
    if ((event.target as Element).closest('[data-milestone]')) return
    onCreate(date)
  }

  return (
    <div className="calendar-week">
      {weekDays(monday).map((date) => {
        const name = dayName(i18n, date)
        const isToday = date === today
        const listed = orderDay(milestones.get(date) ?? [])
        return (
          <section
            key={date}
            aria-label={isToday ? t('calendar.day.today', { day: name }) : name}
            className="calendar-week__day"
            data-date={date}
            data-today={isToday ? '' : undefined}
            onClick={(event) => create(event, date)}
          >
            <header className="calendar-week__head" aria-hidden="true">
              <span className="calendar-week__weekday">{weekdayShort(i18n, date)}</span>
              <span className="calendar-week__number">{dayOfMonth(date)}</span>
            </header>
            <div className="calendar-week__list">
              {listed.map((milestone) => (
                <MilestoneItem key={milestone.id} milestone={milestone} />
              ))}
              <button type="button" className="calendar-week__add" aria-label={t('calendar.day.add', { day: name })}>
                <span className="calendar-week__add-hint" aria-hidden="true">
                  <Icon name="add" size={13} />
                  {t('calendar.newMilestone')}
                </span>
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
