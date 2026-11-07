/*
 * What a press on a Milestone in the Calendar means: a click until the pointer
 * moves a few pixels, then a drag that a drop turns into a move to another day.
 */
import type { CalendarDate } from './calendar'

/** How far, in pixels, the pointer may move from a press on a Milestone and still click it. */
export const DRAG_THRESHOLD = 4

/** Whether a press whose pointer moved this far from where it went down has become a drag. */
export function isDragging(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD
}

/** What dropping a dragged Milestone asks the Calendar to do. */
export type MilestoneDrop = { kind: 'move'; to: CalendarDate } | { kind: 'nothing' }

/**
 * A Milestone dragged from its day `from` and dropped over the day `over`
 * moves there; dropped on its own day, or where no day is (null), nothing
 * changes.
 */
export function milestoneDrop({ from, over }: { from: CalendarDate; over: CalendarDate | null }): MilestoneDrop {
  return over === null || over === from ? { kind: 'nothing' } : { kind: 'move', to: over }
}
