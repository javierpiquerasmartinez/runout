import { useMemo, useState } from 'react'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { navigate } from '../routing'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { SegmentedControl } from '../ui/SegmentedControl'
import {
  nextPeriod,
  periodPath,
  periodSpan,
  previousPeriod,
  switchView,
  todayOf,
  todayPeriod,
  type CalendarDate,
  type CalendarView,
  type Milestone,
  type Period,
} from './calendar'
import { monthHeading, weekHeading } from './calendarText'
import { CreateMilestoneDialog } from './CreateMilestoneDialog'
import { DraggedMilestone } from './DraggedMilestone'
import { MonthGrid } from './MonthGrid'
import { WeekGrid } from './WeekGrid'
import { MonthCounts } from './MonthCounts'
import { useNarrowScreen } from './narrowScreen'
import { useMilestoneDrag } from './useMilestoneDrag'
import { useMilestones } from './useMilestones'
import './CalendarPage.css'

/**
 * The Calendar ("Calendario"): the Account's Milestones over a month or a
 * week, with previous, next and "Hoy" to move between periods and Mes/Semana
 * to switch views, each move a new address.
 * A day's empty space and "Nuevo hito" open the dialog that creates one.
 * On a narrow screen the month shows how many Milestones each day has, a tap
 * on a day opening its week, and the week lists its days one under another.
 */
export function CalendarPage({ period }: { period: Period }) {
  const i18n = useI18n()
  const { t } = i18n
  const today = todayOf()
  const span = periodSpan(period)
  const { milestones, loading, failed, add, setDone, move, unsaved } = useMilestones(span)
  const { dragged, onPointerDown, onDragStart } = useMilestoneDrag({ milestones, onMove: move })
  const narrow = useNarrowScreen()
  const [creatingOn, setCreatingOn] = useState<CalendarDate | null>(null)

  const byDay = useMemo(() => {
    const days = new Map<CalendarDate, Milestone[]>()
    for (const milestone of milestones) days.set(milestone.date, [...(days.get(milestone.date) ?? []), milestone])
    return days
  }, [milestones])

  const heading = period.view === 'month' ? monthHeading(i18n, period.month) : weekHeading(i18n, period.monday)
  const isWeek = period.view === 'week'
  const views: { value: CalendarView; label: string }[] = [
    { value: 'month', label: t('calendar.view.month') },
    { value: 'week', label: t('calendar.view.week') },
  ]

  return (
    <div className="calendar-page">
      <AppHeader current="calendar" />
      <main className="calendar-page__main" aria-busy={loading || undefined} data-dragging={dragged ? '' : undefined} onPointerDown={onPointerDown} onDragStart={onDragStart}>
        <div className="calendar-page__toolbar">
          <div className="calendar-page__moves">
            <IconButton icon="previous" size="compact" label={t(isWeek ? 'calendar.previousWeek' : 'calendar.previousMonth')} onClick={() => navigate(periodPath(previousPeriod(period)))} />
            <IconButton icon="next" size="compact" label={t(isWeek ? 'calendar.nextWeek' : 'calendar.nextMonth')} onClick={() => navigate(periodPath(nextPeriod(period)))} />
            <Button size="compact" onClick={() => navigate(periodPath(todayPeriod(period.view, today)))}>
              {t('calendar.today')}
            </Button>
          </div>
          <h1 className="calendar-page__heading ro-serif">{heading}</h1>
          <span className="calendar-page__spacer" />
          <span className="calendar-page__views">
            <SegmentedControl
              label={t('calendar.view')}
              options={views}
              value={period.view}
              onChange={(view) => view !== period.view && navigate(periodPath(switchView(period, today)))}
            />
          </span>
          <Button size="compact" className="calendar-page__new" onClick={() => setCreatingOn(today)}>
            <Icon name="add" size={14} />
            {t('calendar.newMilestone')}
          </Button>
        </div>
        {failed && (
          <p role="alert" className="calendar-page__failure">
            {t('calendar.loadFailed')}
          </p>
        )}
        {unsaved !== null && (
          <p role="alert" className="calendar-page__failure">
            {t(unsaved.message, { title: unsaved.title })}
          </p>
        )}
        {period.view === 'month' && narrow && <MonthCounts month={period.month} today={today} milestones={byDay} />}
        {period.view === 'month' && !narrow && <MonthGrid month={period.month} today={today} milestones={byDay} onCreate={setCreatingOn} onToggleDone={setDone} drag={dragged} />}
        {period.view === 'week' && <WeekGrid monday={period.monday} today={today} milestones={byDay} onCreate={setCreatingOn} onToggleDone={setDone} drag={dragged} narrow={narrow} />}
      </main>
      {dragged && <DraggedMilestone dragged={dragged} today={today} />}
      {creatingOn !== null && (
        <CreateMilestoneDialog
          date={creatingOn}
          onClose={() => setCreatingOn(null)}
          onCreated={(milestone) => {
            add(milestone)
            setCreatingOn(null)
          }}
        />
      )}
    </div>
  )
}
