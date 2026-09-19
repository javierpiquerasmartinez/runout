import { useSyncExternalStore, type MouseEvent } from 'react'

/*
 * Three screens don't need a router: the path is read from the location and
 * `navigate` pushes a new entry and tells subscribers.
 */
const NAVIGATE_EVENT = 'runout:navigate'

export function navigate(path: string, state?: unknown) {
  window.history.pushState(state ?? null, '', path)
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

/** For an in-app `<a href>`: navigates without reloading the page. */
export function followLink(event: MouseEvent<HTMLAnchorElement>) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  navigate(event.currentTarget.pathname)
}
