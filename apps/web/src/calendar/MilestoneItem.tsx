import type { MouseEvent } from 'react'
import { useI18n } from '../i18n'
import { isPlainClick, navigate } from '../routing'
import { isPending, milestonePath, openedFromCalendar, type CalendarDate, type Milestone } from './calendar'

/**
 * A Milestone as a day lists it: its done check, then its title on one line,
 * cut short with the whole title on hover. A done Milestone is dimmed, never
 * struck through; a pending one (not done, on a day before today) draws its
 * check in brass. A click on it is the Milestone's, never the day's: its
 * title opens its page, which keeps the view it was opened from.
 */
export function MilestoneItem({
  milestone,
  today,
  onToggleDone,
}: {
  milestone: Milestone
  today: CalendarDate
  /** Marks the Milestone done or not done, at once. */
  onToggleDone: (milestone: Milestone, done: boolean) => void
}) {
  const { t } = useI18n()
  const { done, title } = milestone
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return
    event.preventDefault()
    navigate(milestonePath(milestone.id), openedFromCalendar(window.location.pathname))
  }
  return (
    <div className="calendar-milestone" data-milestone={milestone.id} data-done={done || undefined} data-pending={isPending(milestone, today) || undefined}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={t(done ? 'calendar.milestone.done' : 'calendar.milestone.markDone', { title })}
        className="calendar-milestone__check"
        onClick={() => onToggleDone(milestone, !done)}
      >
        {done && (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m7 12.4 3.2 3.2L17 8.8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <a className="calendar-milestone__title" href={milestonePath(milestone.id)} title={title} onClick={open}>
        {title}
      </a>
    </div>
  )
}
