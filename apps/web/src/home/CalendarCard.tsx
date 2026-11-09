import { useCallback, useState } from 'react'
import { calendarPath, intlDate, milestonePath, orderDay, type CalendarDate, type Milestone } from '../calendar/calendar'
import { weekdayLong } from '../calendar/calendarText'
import { CreateMilestoneDialog } from '../calendar/CreateMilestoneDialog'
import { milestoneOutlook } from '../calendar/milestonesApi'
import { useMilestones } from '../calendar/useMilestones'
import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { HomeCard, HomeCardMessage } from './HomeCard'
import { useCardRead } from './useCardRead'
import './CalendarCard.css'

/** How many of today's Milestones the card lists. */
const MOST_SHOWN = 5

/** Today's Milestones, to tick off where they are, and the way to note down a new one without leaving Home. */
export function CalendarCard({ today }: { today: CalendarDate }) {
  const { t, formatDate } = useI18n()
  const [creating, setCreating] = useState(false)
  const { milestones, loading, failed, reload: reloadToday, setDone, unsaved } = useMilestones({ from: today, to: today })
  const readOutlook = useCallback((token: string) => milestoneOutlook(token, today), [today])
  const { status: outlookStatus, data: outlook, reload: reloadOutlook } = useCardRead(readOutlook)
  const reload = () => {
    reloadToday()
    reloadOutlook()
  }
  const subtitle = t('home.calendar.today', { date: formatDate(intlDate(today), { day: 'numeric', month: 'short', timeZone: 'UTC' }) })
  const newMilestone = (
    <Button size="compact" onClick={() => setCreating(true)}>
      <Icon name="add" size={14} />
      {t('calendar.newMilestone')}
    </Button>
  )
  const nothingToday = milestones.length === 0
  const next = outlook?.next ?? null
  const overdue = outlook?.overdue ?? 0
  const bareEmpty = nothingToday && next === null && overdue === 0
  const seeAll = milestones.length > MOST_SHOWN
  return (
    <>
      <HomeCard
        title={t('header.nav.calendar')}
        href={calendarPath}
        status={loading || outlookStatus === 'loading' ? 'loading' : failed || outlookStatus === 'failed' ? 'failed' : 'loaded'}
        onRetry={reload}
        subtitle={subtitle}
        action={bareEmpty ? undefined : newMilestone}
      >
        {bareEmpty ? (
          <HomeCardMessage title={t('home.calendar.empty.title')} text={t('home.calendar.empty.text')}>
            {newMilestone}
          </HomeCardMessage>
        ) : nothingToday ? (
          <>
            <p className="home-card__message-title">{t('home.calendar.empty.title')}</p>
            {next && <NextMilestone milestone={next} />}
          </>
        ) : (
          <TodaysMilestones milestones={milestones} onToggleDone={setDone} />
        )}
        {unsaved !== null && (
          <p role="alert" className="calendar-card__unsaved">
            {t(unsaved.message, { title: unsaved.title })}
          </p>
        )}
        {(overdue > 0 || seeAll) && (
          <div className="calendar-card__foot">
            {overdue > 0 && (
              <a className="calendar-card__foot-link calendar-card__foot-link--overdue" href={calendarPath} onClick={followLink}>
                {t(overdue === 1 ? 'home.calendar.overdue.one' : 'home.calendar.overdue.other', { count: overdue })}
              </a>
            )}
            {seeAll && (
              <a className="calendar-card__foot-link" href={calendarPath} onClick={followLink}>
                {t('home.calendar.seeAll')}
              </a>
            )}
          </div>
        )}
      </HomeCard>
      {creating && (
        <CreateMilestoneDialog
          date={today}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            reload()
          }}
        />
      )}
    </>
  )
}

/** The next Milestone to come and its day. */
function NextMilestone({ milestone: { id, title, date } }: { milestone: Milestone }) {
  const i18n = useI18n()
  const { t, formatDate } = i18n
  const day = t('home.calendar.next.day', { weekday: weekdayLong(i18n, date), date: formatDate(intlDate(date), { day: 'numeric', month: 'long', timeZone: 'UTC' }) })
  return (
    <p className="calendar-card__next">
      {t('home.calendar.next')}{' '}
      <a href={milestonePath(id)} onClick={followLink}>
        {title}
      </a>
      , {day}
    </p>
  )
}

/**
 * The first few of the day's Milestones, pending first. Which ones is settled
 * when they arrive, as this list only exists once a read has answered: one just
 * marked done moves among the done ones without falling off the end, where it
 * could no longer be undone.
 */
function TodaysMilestones({ milestones, onToggleDone }: { milestones: Milestone[]; onToggleDone: (milestone: Milestone, done: boolean) => void }) {
  const { t } = useI18n()
  const [listed] = useState(() => new Set(orderDay(milestones).slice(0, MOST_SHOWN).map(({ id }) => id)))
  return (
    <ul className="calendar-card__list">
      {orderDay(milestones)
        .filter(({ id }) => listed.has(id))
        .map((milestone) => {
          const { id, title, done } = milestone
          return (
            <li key={id} className="calendar-card__row" data-done={done || undefined}>
              <span className="calendar-card__check-place">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={t(done ? 'calendar.milestone.done' : 'calendar.milestone.markDone', { title })}
                  className="calendar-card__check"
                  onClick={() => onToggleDone(milestone, !done)}
                >
                  {done && <Icon name="check" size={13} />}
                </button>
              </span>
              <a className="calendar-card__title" href={milestonePath(id)} onClick={followLink}>
                {title}
              </a>
            </li>
          )
        })}
    </ul>
  )
}
