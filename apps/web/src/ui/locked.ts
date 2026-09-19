import type { MouseEvent } from 'react'

/**
 * A locked control is never hidden or natively `disabled`: it keeps its place and
 * its focus stop, draws a dashed border, and says why in its accessible name.
 */
export function lockedProps(label: string | undefined, reason: string | undefined) {
  if (reason === undefined) return {}
  return {
    'aria-disabled': true,
    'aria-label': label ? `${label}. ${reason}` : reason,
    title: reason,
    'data-locked': '',
  } as const
}

export function guardLocked<E extends MouseEvent>(reason: string | undefined, handler?: (event: E) => void) {
  return (event: E) => {
    if (reason !== undefined) {
      event.preventDefault()
      return
    }
    handler?.(event)
  }
}
