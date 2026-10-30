/*
 * The Analysis's Equity, worked out off the screen's thread (ADR 0007): a Web
 * Worker runs the shared Equity module and posts each batch's running result,
 * tagged with the request it answers.
 */

import type { EquityRequest, EquityResult } from '@runout/poker'
import { useEffect, useRef, useState } from 'react'

/** What the screen asks the worker: the latest request replaces any before it. */
export interface EquityQuestion {
  id: number
  request: EquityRequest
}

/** A running result the worker posts, for the request with this id. */
export interface EquityAnswer {
  id: number
  result: EquityResult
}

/**
 * The Equity of `request` as it sharpens, or null until its first result: a
 * new request starts over, and a result for one no longer asked is dropped.
 * Null for a null request, and where there are no Web Workers. Requests are
 * told apart by identity, so pass a memoised one.
 */
export function useEquity(request: EquityRequest | null): EquityResult | null {
  const worker = useRef<Worker | null>(null)
  /** The latest question, which the worker's answers must match. */
  const asked = useRef<EquityQuestion | null>(null)
  const [answer, setAnswer] = useState<{ request: EquityRequest; result: EquityResult } | null>(null)

  useEffect(() => {
    // Without workers (a test's DOM), there is no Equity rather than one that freezes the screen.
    if (typeof Worker === 'undefined') return
    const started = new Worker(new URL('./equity.worker.ts', import.meta.url), { type: 'module' })
    started.onmessage = ({ data }: MessageEvent<EquityAnswer>) => {
      const question = asked.current
      if (question !== null && data.id === question.id) setAnswer({ request: question.request, result: data.result })
    }
    worker.current = started
    return () => {
      started.terminate()
      worker.current = null
    }
  }, [])

  useEffect(() => {
    const question = request && { id: (asked.current?.id ?? 0) + 1, request }
    asked.current = question
    if (question) worker.current?.postMessage(question)
  }, [request])

  return answer !== null && answer.request === request ? answer.result : null
}
