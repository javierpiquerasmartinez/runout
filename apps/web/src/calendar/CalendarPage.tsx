import { useEffect, useMemo, useState } from 'react'
import { api } from '../backend/api'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useSession } from '../identity/context'
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
  type CalendarSpan,
  type CalendarView,
  type Milestone,
  type Period,
} from './calendar'
import { monthHeading, weekHeading } from './calendarText'
import { CreateMilestoneDialog } from './CreateMilestoneDialog'
import { MonthGrid } from './MonthGrid'
import { WeekGrid } from './WeekGrid'
import './CalendarPage.css'

/**
 * The Calendar ("Calendario"): the Account's Milestones over a month or a
 * week, with previous, next and "Hoy" to move between periods and Mes/Semana
 * to switch views, each move a new address.
 * A day's empty space and "Nuevo hito" open the dialog that creates one.
 */
export function CalendarPage({ period }: { period: Period }) {
  const i18n = useI18n()
  const { t } = i18n
  const today = todayOf()
  const span = periodSpan(period)
  const { milestones, loading, hasAny, failed, add } = useMilestones(span)
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
      <main className="calendar-page__main" aria-busy={loading || undefined}>
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
          <SegmentedControl
            label={t('calendar.view')}
            options={views}
            value={period.view}
            onChange={(view) => view !== period.view && navigate(periodPath(switchView(period, today)))}
          />
          <Button size="compact" onClick={() => setCreatingOn(today)}>
            <Icon name="add" size={14} />
            {t('calendar.newMilestone')}
          </Button>
        </div>
        {failed && (
          <p role="alert" className="calendar-page__failure">
            {t('calendar.loadFailed')}
          </p>
        )}
        {period.view === 'month' && <MonthGrid month={period.month} today={today} milestones={byDay} onCreate={setCreatingOn} />}
        {period.view === 'week' && <WeekGrid monday={period.monday} today={today} milestones={byDay} onCreate={setCreatingOn} />}
        {hasAny === false && (
          <div className="calendar-page__hint">
            <p>{t('calendar.emptyHint')}</p>
          </div>
        )}
      </main>
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

/** What the Calendar knows of the Account's Milestones for a span. */
interface Fetched {
  /** The span the Milestones are of. */
  key: string
  milestones: Milestone[]
  hasAny: boolean
}

/**
 * The Account's Milestones in the span, asked for again whenever it changes,
 * and whether it has any at all (unknown until the first answer). A Milestone
 * created here is added at once, without asking again.
 */
function useMilestones(span: CalendarSpan) {
  const { token } = useSession()
  const key = `from=${span.from}&to=${span.to}`
  const [fetched, setFetched] = useState<Fetched | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    api<{ milestones: Milestone[]; hasAny: boolean }>(`/calendar/milestones?${key}`, { token: token ?? undefined })
      .then((answer) => current && setFetched({ key, ...answer }))
      .catch(() => current && setFailedKey(key))
    return () => {
      current = false
    }
  }, [key, token])

  const fresh = fetched?.key === key
  return {
    milestones: fresh ? fetched.milestones : [],
    loading: !fresh && failedKey !== key,
    hasAny: fetched?.hasAny,
    failed: failedKey === key,
    add(milestone: Milestone) {
      setFetched((before) => {
        const within = milestone.date >= span.from && milestone.date <= span.to
        if (!before || before.key !== key) return before && { ...before, hasAny: true }
        return { ...before, hasAny: true, milestones: within ? [...before.milestones, milestone] : before.milestones }
      })
    },
  }
}
