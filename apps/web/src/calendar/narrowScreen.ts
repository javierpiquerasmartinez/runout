import { useSyncExternalStore } from 'react'

/**
 * Under this width the Calendar is laid out for a phone and offers no
 * dragging: a Milestone's date is changed on its page.
 */
export const NARROW_SCREEN = '(max-width: 760px)'

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
