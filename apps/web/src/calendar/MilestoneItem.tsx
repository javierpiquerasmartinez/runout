import { useI18n } from '../i18n'
import { isPending, type CalendarDate, type Milestone } from './calendar'

/**
 * A Milestone as a day lists it: its done check, then its title on one line,
 * cut short with the whole title on hover. A done Milestone is dimmed, never
 * struck through; a pending one (not done, on a day before today) draws its
 * check in brass. A click on it is the Milestone's, never the day's.
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
  return (
    <div className="calendar-milestone" data-milestone={milestone.id} data-done={done || undefined} data-pending={isPending(milestone, today) || undefined} data-dragged={dragged || undefined}>
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
      <span className="calendar-milestone__title" title={title}>
        {title}
      </span>
    </div>
  )
}
