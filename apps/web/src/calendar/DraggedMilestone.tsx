import { isPending, type CalendarDate } from './calendar'
import type { MilestoneDragState } from './useMilestoneDrag'

/**
 * The Milestone being dragged, raised and following the pointer, drawn as a
 * day lists it. It is only a picture: the pointer passes through it to the
 * day underneath.
 */
export function DraggedMilestone({ dragged, today }: { dragged: MilestoneDragState; today: CalendarDate }) {
  const { milestone, left, top, width } = dragged
  return (
    <div className="calendar-drag" aria-hidden="true" data-dragged-milestone style={{ left, top, width: width || undefined }}>
      <div className="calendar-milestone calendar-drag__milestone" data-done={milestone.done || undefined} data-pending={isPending(milestone, today) || undefined}>
        <span className="calendar-milestone__check">
          {milestone.done && (
            <svg viewBox="0 0 24 24" fill="none">
              <path d="m7 12.4 3.2 3.2L17 8.8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="calendar-milestone__title">{milestone.title}</span>
      </div>
    </div>
  )
}
