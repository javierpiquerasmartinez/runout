/*
 * Two moments work that can wait is put off to. Both answer with a promise
 * that never settles once `signal` has aborted, so what was waiting is
 * simply never done.
 */

/**
 * Once the browser has painted what is in the page now: the frame after the
 * next one, and not before the page's first text or picture has been
 * painted at all, where the browser says when that is. Text can be a few
 * frames behind the page's first paint, while its font is on its way.
 */
export function whenPainted(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const frames = () =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!signal?.aborted) resolve()
        }),
      )
    const painted = 'first-contentful-paint'
    const told = typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes?.includes('paint')
    if (!told || performance.getEntriesByName(painted).length) return frames()
    const observer = new PerformanceObserver((paints) => {
      if (!paints.getEntriesByName(painted).length) return
      observer.disconnect()
      frames()
    })
    observer.observe({ type: 'paint', buffered: true })
    signal?.addEventListener('abort', () => observer.disconnect())
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
