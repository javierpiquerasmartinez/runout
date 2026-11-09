import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIdentity } from '../identity/context'
import type { CardStatus } from './HomeCard'

/** One card's read, and how it is going. */
export interface CardRead<T> {
  status: CardStatus
  /** What the read answered, once `status` is `loaded`. */
  data: T | null
  /** Reads again, back through loading. For "Reintentar", and after whatever changes what the card shows. */
  reload: () => void
}

/**
 * Loads what one card of Home shows, on its own: a slow or failed read touches
 * no other card. `read` must keep its identity (declared outside the component,
 * or through `useCallback`); when it changes, the card reads again.
 */
export function useCardRead<T>(read: (token: string) => Promise<T>): CardRead<T> {
  const { token } = useIdentity()
  const [attempt, setAttempt] = useState(0)
  const request = useMemo(() => ({ read, token, attempt }), [read, token, attempt])
  const [settled, setSettled] = useState<{ request: object; data: T | null; failed: boolean } | null>(null)

  useEffect(() => {
    let current = true
    request
      .read(request.token)
      .then((data) => current && setSettled({ request, data, failed: false }))
      .catch(() => current && setSettled({ request, data: null, failed: true }))
    return () => {
      current = false
    }
  }, [request])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  // An answer to an earlier read never shows as the answer to this one.
  if (settled?.request !== request) return { status: 'loading', data: null, reload }
  return { status: settled.failed ? 'failed' : 'loaded', data: settled.data, reload }
}
