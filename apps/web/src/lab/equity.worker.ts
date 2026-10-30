/*
 * Runs the Equity module for the Analysis (ADR 0007), one request at a time:
 * the latest replaces any still running. Each batch's running result is posted
 * tagged with its request, until the result is exact, its margin is under
 * ±0.1 %, or the time cap runs out.
 */

import { equity } from '@runout/poker'
import type { EquityAnswer, EquityQuestion } from './equity'

/** The margin, in points of %, below which the Equity is sharp enough. */
const MARGIN_GOAL = 0.1

/** How long one request may sample before it settles for the margin it reached. */
const TIME_CAP_MS = 15_000

/** The request being answered; any other stops at its next batch. */
let current = 0

/** Lets queued requests arrive, so that a stale one stops instead of finishing. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 0))

async function answer({ id, request }: EquityQuestion) {
  // A burst of changes queues requests: only the last is worked out.
  await pause()
  if (id !== current) return
  const started = performance.now()
  for (const result of equity(request, { seed: id })) {
    if (id !== current) return
    self.postMessage({ id, result } satisfies EquityAnswer)
    if (result.exact || result.margin < MARGIN_GOAL || performance.now() - started > TIME_CAP_MS) return
    await pause()
  }
}

self.onmessage = ({ data }: MessageEvent<EquityQuestion>) => {
  current = data.id
  void answer(data)
}
