import { ApiError } from './api'

/** How long a sleeping server may take to answer before it counts as down. */
const GIVE_UP_AFTER_MS = 90_000
const FIRST_WAIT_MS = 1000
const LONGEST_WAIT_MS = 5000

/**
 * Runs the call, and runs it again while the server can't be reached or
 * answers with a 5xx, as a server waking from sleep does, waiting a little
 * longer each time. After 90 seconds it fails as the last try did. A reason
 * of the server's own fails at once.
 */
export async function untilAwake<T>(
  call: () => Promise<T>,
  {
    now = Date.now,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const started = now()
  let wait = FIRST_WAIT_MS
  for (;;) {
    try {
      return await call()
    } catch (error) {
      const asleep = error instanceof ApiError && (error.reason === 'network' || error.status >= 500)
      if (!asleep || now() + wait - started > GIVE_UP_AFTER_MS) throw error
    }
    await sleep(wait)
    wait = Math.min(wait * 2, LONGEST_WAIT_MS)
  }
}
