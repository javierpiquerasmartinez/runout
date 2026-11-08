import type { MouseEvent } from 'react'
import { useI18n } from '../i18n'
import { isPlainClick, navigate } from '../routing'
import { Icon } from '../ui/Icon'
import { isPending, milestonePath, openedFromCalendar, type CalendarDate, type Milestone } from './calendar'

/**
 * A Milestone as a day lists it: its done check, then its title on one line,
 * cut short with the whole title on hover. A done Milestone is dimmed, never
 * struck through; a pending one (not done, on a day before today) draws its
 * check in brass. A click on it is the Milestone's, never the day's: anywhere
 * but on its check it opens the Milestone's page, which keeps the view it was
 * opened from. Its title is the link that says so.
 */
export function MilestoneItem({
  milestone,
  today,
  onToggleDone,
  dragged = false,
}: {
  milestone: Milestone
  today: CalendarDate
  /** Marks the Milestone done or not done, at once. */
  onToggleDone: (milestone: Milestone, done: boolean) => void
  /** Whether it is being dragged elsewhere, which leaves its slot dimmed. */
  dragged?: boolean
}) {
  const { t } = useI18n()
  const { done, title } = milestone
  const open = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || !isPlainClick(event)) return
    if ((event.target as Element).closest('[role="checkbox"]')) return
    event.preventDefault()
    navigate(milestonePath(milestone.id), openedFromCalendar(window.location.pathname))
  }
  return (
    // The row's click is the title link's, made bigger: keyboards and screen readers reach it through the link.
    <div className="calendar-milestone" data-milestone={milestone.id} data-done={done || undefined} data-pending={isPending(milestone, today) || undefined} data-dragged={dragged || undefined} onClick={open}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={t(done ? 'calendar.milestone.done' : 'calendar.milestone.markDone', { title })}
        className="calendar-milestone__check"
        onClick={() => onToggleDone(milestone, !done)}
      >
        {done && <Icon name="check" size={11} />}
      </button>
      <a className="calendar-milestone__title" href={milestonePath(milestone.id)} title={title}>
        {title}
      </a>
    </div>
  )
}
