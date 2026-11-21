import { useCallback, useEffect, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'

/** What `usePolled` holds: the latest read, or why the first one failed. */
export interface Polled<T> {
  value: T | null
  /** Why the last read failed; a later read that works clears it. */
  failure: FailureReason | null
  /** Puts a value read some other way in place, such as what writing answered with. */
  replace: (value: T) => void
}

/** When `usePolled` reads, besides every `intervalMs`. */
export interface PolledOptions {
  /** Nothing is read while it is false; true when left out. */
  enabled?: boolean
  /** A new value starts over with a read at once, such as a change made elsewhere. */
  refresh?: unknown
}

/**
 * Reads `load` now and again every `intervalMs` while the screen is on, so
 * that what others write turns up without a reload: there is no live push.
 * Each read waits for the one before. Nothing is read while `enabled` is
 * false. A new `load`, or a new `refresh`, starts over with a read at once.
 */
export function usePolled<T>(load: () => Promise<T>, intervalMs: number, { enabled = true, refresh }: PolledOptions = {}): Polled<T> {
  const [value, setValue] = useState<T | null>(null)
  const [failure, setFailure] = useState<FailureReason | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let next: ReturnType<typeof setTimeout> | undefined
    const read = () =>
      load()
        .then((read) => {
          if (cancelled) return
          setValue(read)
          setFailure(null)
        })
        .catch((error: unknown) => !cancelled && setFailure(reasonOf(error)))
        .finally(() => {
          if (!cancelled) next = setTimeout(() => void read(), intervalMs)
        })
    void read()
    return () => {
      cancelled = true
      clearTimeout(next)
    }
  }, [load, intervalMs, enabled, refresh])

  const replace = useCallback((read: T) => {
    setValue(read)
    setFailure(null)
  }, [])

  return { value, failure, replace }
}
