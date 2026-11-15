/*
 * What a screen whose chunk didn't arrive is recovered with. The likeliest
 * cause is a tab left open across a deploy: the chunks its build of the app
 * names are gone, and reloading the page brings the build that is there
 * now. That is tried once; if the screen still doesn't arrive, it is the
 * connection, and the person is told and given a way to try again.
 */

/** Kept for the tab's life: the page has been reloaded for a screen that didn't arrive, and none has arrived since. */
const RELOADED_KEY = 'runout.reloadedForScreen'

/**
 * Whether to reload the page for a screen that didn't arrive: true the first
 * time, and from then on false until a screen has arrived, so a page that
 * can't be helped by reloading is never reloaded in a loop. Where the
 * browser keeps nothing it can't be known, and the page is not reloaded.
 */
export function shouldReload(storage: Storage = window.sessionStorage): boolean {
  try {
    if (storage.getItem(RELOADED_KEY)) return false
    storage.setItem(RELOADED_KEY, '1')
    return storage.getItem(RELOADED_KEY) !== null
  } catch {
    return false
  }
}

/** A screen's chunk has arrived: the next that doesn't may reload the page again. */
export function screenArrived(storage: Storage = window.sessionStorage) {
  try {
    storage.removeItem(RELOADED_KEY)
  } catch {
    // Storage blocked: nothing was kept.
  }
}
