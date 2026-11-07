import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent, type PointerEvent } from 'react'
import type { CalendarDate, Milestone } from './calendar'
import { isDragging, milestoneDrop } from './milestoneDrag'

/** Under this width the Calendar offers no dragging: a Milestone's date is changed on its page. */
export const NARROW_SCREEN = '(max-width: 760px)'

/** What the days show of a drag: the Milestone whose slot is dimmed, and the day highlighted. */
export interface CalendarDrag {
  milestone: Milestone
  /** The day under the pointer, or null where there is none. */
  over: CalendarDate | null
}

/** A Milestone being dragged: the day under the pointer, and where the Milestone is drawn. */
export interface MilestoneDragState extends CalendarDrag {
  /** Where the dragged Milestone's top left corner is drawn, in the viewport. */
  left: number
  top: number
  /** The width of the Milestone's row where it was picked up. */
  width: number
}

/** A press on a Milestone, before and while it is dragged. */
interface Press {
  milestone: Milestone
  startX: number
  startY: number
  /** Where in the row it was grabbed, so the row keeps under the pointer at that spot. */
  grabX: number
  grabY: number
  width: number
  dragging: boolean
  /** Escape ended the drag: the release changes nothing. */
  cancelled: boolean
}

/**
 * Dragging the Calendar's Milestones from one day to another with the pointer,
 * on wide screens. A press on a Milestone (not on its check, not with a
 * finger) becomes a drag once the pointer moves a few pixels; until then it is
 * left alone, so its click still reaches the Milestone. Dropping on another day
 * asks `onMove`; dropping on its own day, outside any day, or after Escape
 * changes nothing. The press goes on the element holding the days
 * (`onPointerDown`, `onDragStart`); `dragged` is what to draw meanwhile.
 */
export function useMilestoneDrag({ milestones, onMove }: { milestones: readonly Milestone[]; onMove: (milestone: Milestone, to: CalendarDate) => void }) {
  const narrow = useNarrowScreen()
  const [dragged, setDragged] = useState<MilestoneDragState | null>(null)
  const press = useRef<Press | null>(null)
  // Read by the window's listeners, which outlive this render.
  const onMoveRef = useRef(onMove)
  useEffect(() => {
    onMoveRef.current = onMove
  })

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = press.current
      if (!current || current.cancelled) return
      if (!current.dragging && !isDragging(event.clientX - current.startX, event.clientY - current.startY)) return
      current.dragging = true
      setDragged({
        milestone: current.milestone,
        over: dayAt(event.clientX, event.clientY),
        left: event.clientX - current.grabX,
        top: event.clientY - current.grabY,
        width: current.width,
      })
    }
    const release = (event: globalThis.PointerEvent) => {
      const current = press.current
      press.current = null
      if (!current?.dragging) return
      swallowNextClick()
      setDragged(null)
      if (current.cancelled) return
      const drop = milestoneDrop({ from: current.milestone.date, over: dayAt(event.clientX, event.clientY) })
      if (drop.kind === 'move') onMoveRef.current(current.milestone, drop.to)
    }
    const cancel = () => {
      press.current = null
      setDragged(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !press.current?.dragging) return
      press.current.cancelled = true
      setDragged(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', escape)
    }
  }, [])

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (narrow || event.button !== 0 || event.pointerType === 'touch') return
    const target = event.target as Element
    // A press on the check only toggles done.
    if (target.closest('[role="checkbox"]')) return
    const row = target.closest<HTMLElement>('[data-milestone]')
    const milestone = row && milestones.find(({ id }) => id === row.dataset.milestone)
    if (!row || !milestone) return
    const box = row.getBoundingClientRect()
    press.current = {
      milestone,
      startX: event.clientX,
      startY: event.clientY,
      grabX: event.clientX - box.left,
      grabY: event.clientY - box.top,
      width: box.width,
      dragging: false,
      cancelled: false,
    }
  }

  /** Keeps the browser's own drag (of a link or a selection) from taking a Milestone's press away. */
  function onDragStart(event: DragEvent<HTMLElement>) {
    if ((event.target as Element).closest?.('[data-milestone]')) event.preventDefault()
  }

  return { dragged, onPointerDown, onDragStart }
}

/** The day drawn at a point of the viewport, or null where there is none. */
function dayAt(x: number, y: number): CalendarDate | null {
  return document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-date]')?.dataset.date ?? null
}

/** Keeps the click that follows a drag's release from reaching the day or the Milestone under it. */
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

/** Whether the screen is under the narrow breakpoint, following it as it changes. */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia?.(NARROW_SCREEN)
      query?.addEventListener('change', changed)
      return () => query?.removeEventListener('change', changed)
    },
    () => window.matchMedia?.(NARROW_SCREEN).matches ?? false,
  )
}
