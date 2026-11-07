import type { MouseEvent } from 'react'
import { useI18n } from '../i18n'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { dayOfMonth, orderDay, weekDays, type CalendarDate, type Milestone } from './calendar'
import { dayName, weekdayLong, weekdayShort } from './calendarText'
import { MilestoneItem } from './MilestoneItem'
import type { CalendarDrag } from './useMilestoneDrag'

/**
 * A week in seven columns, Monday to Sunday, each listing every Milestone of
 * its day in the day's order. Today is marked. A click on a day's empty space,
 * or on its "+", asks to create a Milestone on that day. On a narrow screen
 * the days are listed one under another, each with its "+" by its name and
 * saying so when nothing is planned.
 */
export function WeekGrid({
  monday,
  today,
  milestones,
  onCreate,
  onToggleDone,
  drag = null,
  narrow = false,
}: {
  monday: CalendarDate
  today: CalendarDate
  /** The Milestones of the week's days, by date. */
  milestones: ReadonlyMap<CalendarDate, readonly Milestone[]>
  onCreate: (date: CalendarDate) => void
  onToggleDone: (milestone: Milestone, done: boolean) => void
  /** The Milestone being dragged, if one is, and the day under the pointer. */
  drag?: CalendarDrag | null
  /** Lists the days one under another, for a narrow screen. */
  narrow?: boolean
}) {
  const i18n = useI18n()
  const { t } = i18n

  function create(event: MouseEvent<HTMLElement>, date: CalendarDate) {
    if ((event.target as Element).closest('[data-milestone]')) return
    onCreate(date)
  }

  return (
    <div className="calendar-week" data-narrow={narrow || undefined}>
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
            data-drop={drag?.over === date ? '' : undefined}
            onClick={(event) => create(event, date)}
          >
            {narrow ? (
              <header className="calendar-week__head">
                <span className="calendar-week__weekday" aria-hidden="true">
                  {weekdayLong(i18n, date)}
                </span>
                <span className="calendar-week__number" aria-hidden="true">
                  {dayOfMonth(date)}
                </span>
                <span className="calendar-week__spacer" />
                <IconButton icon="add" size="compact" label={t('calendar.day.add', { day: name })} className="calendar-week__plus" />
              </header>
            ) : (
              <header className="calendar-week__head" aria-hidden="true">
                <span className="calendar-week__weekday">{weekdayShort(i18n, date)}</span>
                <span className="calendar-week__number">{dayOfMonth(date)}</span>
              </header>
            )}
            <div className="calendar-week__list">
              {listed.map((milestone) => (
                <MilestoneItem key={milestone.id} milestone={milestone} today={today} onToggleDone={onToggleDone} dragged={drag?.milestone.id === milestone.id} />
              ))}
              {narrow ? (
                listed.length === 0 && <p className="calendar-week__nothing">{t('calendar.week.nothingPlanned')}</p>
              ) : (
                <button type="button" className="calendar-week__add" aria-label={t('calendar.day.add', { day: name })}>
                  <span className="calendar-week__add-hint" aria-hidden="true">
                    <Icon name="add" size={13} />
                    {t('calendar.newMilestone')}
                  </span>
                </button>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
