import type { Milestone } from './calendar'

/**
 * A Milestone as a day lists it: its title on one line, cut short with the
 * whole title on hover. A click on it is the Milestone's, never the day's.
 */
export function MilestoneItem({ milestone }: { milestone: Milestone }) {
  return (
    <div className="calendar-milestone" data-milestone={milestone.id} data-done={milestone.done || undefined}>
      <span className="calendar-milestone__title" title={milestone.title}>
        {milestone.title}
      </span>
    </div>
  )
}
