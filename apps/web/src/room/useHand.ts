import { useEffect, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { fetchHand, type HandWithTimeline } from './hand'

export type HandLoad =
  | { state: 'loading' }
  | { state: 'loaded'; hand: HandWithTimeline }
  | { state: 'failed'; reason: FailureReason; retry: () => void }

/** The Hand behind `handId`, fetched once and kept for the rest of the page. */
export function useHand(handId: string, token: string): HandLoad {
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<{ handId: string; result: HandLoad } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchHand(handId, token)
      .then((hand) => !cancelled && setLoad({ handId, result: { state: 'loaded', hand } }))
      .catch((error: unknown) => {
        if (cancelled) return
        const retry = () => setAttempt((n) => n + 1)
        setLoad({ handId, result: { state: 'failed', reason: reasonOf(error), retry } })
      })
    return () => {
      cancelled = true
    }
  }, [handId, token, attempt])

  // A result for the previous Hand never shows under the new one.
  return load?.handId === handId ? load.result : { state: 'loading' }
}
