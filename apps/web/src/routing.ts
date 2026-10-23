import { useSyncExternalStore, type MouseEvent } from 'react'

/*
 * A handful of screens don't need a router: the path is read from the location,
 * `navigate` pushes a new entry, `redirect` replaces the current one, and both
 * tell subscribers. `routes/Routes` decides what each path shows.
 */
const NAVIGATE_EVENT = 'runout:navigate'

export function navigate(path: string, state?: unknown) {
  window.history.pushState(state ?? null, '', path)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

/** Like `navigate`, but replaces the current entry: going back skips the path left. */
export function redirect(path: string) {
  window.history.replaceState(null, '', path)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  window.addEventListener(NAVIGATE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(NAVIGATE_EVENT, onChange)
  }
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

/** The current query string, as `?site=pokerstars`, or `''`; kept up to date like the path. */
export function useSearch(): string {
  return useSyncExternalStore(subscribe, () => window.location.search)
}

/** A primitive read from the current history entry's state, kept up to date like the path. */
export function useHistoryState<T extends string | number | null>(read: (state: unknown) => T): T {
  return useSyncExternalStore(subscribe, () => read(window.history.state))
}

/** For an in-app `<a href>`: navigates without reloading the page. */
export function followLink(event: MouseEvent<HTMLAnchorElement>) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  navigate(event.currentTarget.pathname)
}
