/*
 * Two moments work that can wait is put off to. Both answer with a promise
 * that never settles once `signal` has aborted, so what was waiting is
 * simply never done.
 */

/** Once the browser has painted what is in the page now: the frame after the next one. */
export function whenPainted(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!signal?.aborted) resolve()
      }),
    )
  })
}

/** Once the browser has nothing more pressing to do, or two seconds on if it never is idle. */
export function whenIdle(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const idle = () => {
      if (!signal?.aborted) resolve()
    }
    // Safari has no `requestIdleCallback`: a moment's wait stands in for it.
    if (typeof requestIdleCallback === 'function') requestIdleCallback(idle, { timeout: 2000 })
    else setTimeout(idle, 200)
  })
}
