import { useSyncExternalStore } from 'react'

let version = 0
const listeners = new Set<() => void>()

/**
 * Says that something this browser did changed what the header counts: the
 * Account read an unread answer, or an Administrator answered or closed a
 * Ticket. The header reads its mark or count again straight away instead of
 * waiting for its next turn.
 */
export function supportChanged(): void {
  version += 1
  for (const listener of listeners) listener()
}

/** A number that changes each time `supportChanged` is called. */
export function useSupportChanges(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
}
