import { useSyncExternalStore, type MouseEvent } from 'react'

/*
 * A handful of screens don't need a router: the path is read from the location,
 * `navigate` pushes a new entry, `redirect` replaces the current one, and both
 * tell subscribers. `routes/Routes` decides what each path shows.
 */
const NAVIGATE_EVENT = 'runout:navigate'

/**
 * Asked before every `navigate`, and before going back or forward with the
 * browser: true lets it go ahead. A screen with unsaved work answers false
 * and calls `go` later, once the person has chosen to discard it. One at a
 * time; null when no screen is holding anyone.
 */
type LeaveGuard = (go: () => void) => boolean
let leaveGuard: LeaveGuard | null = null

/** The address on screen, so a Back the guard holds up can be put back. */
let shownUrl = currentUrl()

function currentUrl(): string {
  return window.location.pathname + window.location.search
}

/** Holds every `navigate`, Back and Forward up to `guard` until it is cleared with null. */
export function setLeaveGuard(guard: LeaveGuard | null) {
  leaveGuard = guard
  shownUrl = currentUrl()
}

// Added before any screen subscribes, so a Back the guard holds up never reaches them.
window.addEventListener('popstate', (event: PopStateEvent) => {
  const target = currentUrl()
  if (leaveGuard) {
    const state: unknown = event.state
    const go = () => {
      window.history.pushState(state, '', target)
      shownUrl = target
      window.dispatchEvent(new Event(NAVIGATE_EVENT))
    }
    if (!leaveGuard(go)) {
      event.stopImmediatePropagation()
      window.history.pushState(null, '', shownUrl)
      return
    }
  }
  shownUrl = target
})

export function navigate(path: string, state?: unknown) {
  if (leaveGuard && !leaveGuard(() => navigate(path, state))) return
  window.history.pushState(state ?? null, '', path)
  shownUrl = currentUrl()
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

/** Like `navigate`, but replaces the current entry: going back skips the path left. */
export function redirect(path: string) {
  window.history.replaceState(null, '', path)
  shownUrl = currentUrl()
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

/** Whether a click on a link opens it here, rather than in another tab or window. */
export function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0
}

/** For an in-app `<a href>`: navigates without reloading the page. */
export function followLink(event: MouseEvent<HTMLAnchorElement>) {
  if (!isPlainClick(event)) return
  event.preventDefault()
  navigate(event.currentTarget.pathname)
}
