import { useState } from 'react'
import { calendarPath, intlDate, milestonePath, orderDay, type CalendarDate, type Milestone } from '../calendar/calendar'
import { CreateMilestoneDialog } from '../calendar/CreateMilestoneDialog'
import { useMilestones } from '../calendar/useMilestones'
import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { HomeCard, HomeCardMessage } from './HomeCard'
import './CalendarCard.css'

/** How many of today's Milestones the card lists. */
const MOST_SHOWN = 5

/** Today's Milestones, to tick off where they are, and the way to note down a new one without leaving Home. */
export function CalendarCard({ today }: { today: CalendarDate }) {
  const { t, formatDate } = useI18n()
  const [creating, setCreating] = useState(false)
  const { milestones, loading, failed, reload, setDone, unsaved } = useMilestones({ from: today, to: today })
  const subtitle = t('home.calendar.today', { date: formatDate(intlDate(today), { day: 'numeric', month: 'short', timeZone: 'UTC' }) })
  const newMilestone = (
    <Button size="compact" onClick={() => setCreating(true)}>
      <Icon name="add" size={14} />
      {t('calendar.newMilestone')}
    </Button>
  )
  const nothingToday = milestones.length === 0
  return (
    <>
      <HomeCard
        title={t('header.nav.calendar')}
        href={calendarPath}
        status={loading ? 'loading' : failed ? 'failed' : 'loaded'}
        onRetry={reload}
        subtitle={subtitle}
        action={nothingToday ? undefined : newMilestone}
      >
        {nothingToday ? (
          <HomeCardMessage title={t('home.calendar.empty.title')} text={t('home.calendar.empty.text')}>
            {newMilestone}
          </HomeCardMessage>
        ) : (
          <TodaysMilestones milestones={milestones} onToggleDone={setDone} />
        )}
        {unsaved !== null && (
          <p role="alert" className="calendar-card__unsaved">
            {t(unsaved.message, { title: unsaved.title })}
          </p>
        )}
        {milestones.length > MOST_SHOWN && (
          <a className="calendar-card__all" href={calendarPath} onClick={followLink}>
            {t('home.calendar.seeAll')}
          </a>
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
