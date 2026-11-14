/**
 * Calls `draw` on each of the browser's frames while the page is visible,
 * and on none while it is hidden: a Visitor who leaves the tab in the
 * background pays for no drawing. `draw` is given the time the scene has
 * been playing, in milliseconds, which stands still while the page is
 * hidden, so the scene resumes where it was and not where it would have got
 * to. Answers with what stops it.
 */
export function drawWhileVisible(draw: (time: number) => void): () => void {
  const listening = new AbortController()
  let frame = 0
  /** The browser's time at the last frame drawn, and how much of its time the page has spent hidden. */
  let drawnAt: number | null = null
  let away = 0
  let resuming = false

  const next = (now: number) => {
    frame = requestAnimationFrame(next)
    if (resuming && drawnAt !== null) away += now - drawnAt
    resuming = false
    drawnAt = now
    draw(now - away)
  }
  const follow = () => {
    cancelAnimationFrame(frame)
    frame = 0
    if (document.visibilityState !== 'visible') return
    resuming = true
    frame = requestAnimationFrame(next)
  }
  document.addEventListener('visibilitychange', follow, { signal: listening.signal })
  follow()

  return () => {
    listening.abort()
    cancelAnimationFrame(frame)
  }
}
