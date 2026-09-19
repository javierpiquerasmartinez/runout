import { useEffect, useRef } from 'react'

/*
 * The Master's keyboard shortcuts from the "Ajustes" board, minus play/pause:
 * arrows step Actions, Shift + arrows jump Streets, J and K move through the
 * Queue.
 */

export type Shortcut = 'previous-action' | 'next-action' | 'previous-street' | 'next-street' | 'previous-hand' | 'next-hand'

/** The shortcut a keydown asks for, or null when it isn't one or belongs to a text field. */
export function shortcutFor(event: KeyboardEvent): Shortcut | null {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return null
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return null
  switch (event.key) {
    case 'ArrowLeft':
      return event.shiftKey ? 'previous-street' : 'previous-action'
    case 'ArrowRight':
      return event.shiftKey ? 'next-street' : 'next-action'
    case 'j':
    case 'J':
      return 'previous-hand'
    case 'k':
    case 'K':
      return 'next-hand'
    default:
      return null
  }
}

/**
 * Runs the handler for each shortcut pressed anywhere on the page. A shortcut
 * with no handler (e.g. no next Action) does nothing; pass `enabled: false`
 * for Guests, who have none.
 */
export function useShortcuts(enabled: boolean, handlers: Partial<Record<Shortcut, () => void>>) {
  // The latest handlers, without re-attaching the listener on every render.
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = shortcutFor(event)
      const handler = shortcut && latest.current[shortcut]
      if (!handler) return
      event.preventDefault()
      handler()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
