import { useEffect, useRef, useState } from 'react'

/** How long the server keeps a removal undoable. */
const UNDO_WINDOW_MS = 10_000

/**
 * What was just removed and can still be taken back, for as long as the undo
 * window lasts. The server is the one that decides: this only says how long
 * the offer is worth making. `forget` drops the offer when what it refers to
 * is no longer on screen.
 */
export function usePendingUndo(undoCommand: (id: string) => void): {
  pendingId: string | null
  remove(id: string, removeCommand: (id: string) => void): void
  undo(): void
  forget(): void
} {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  function forget() {
    clearTimeout(timer.current)
    setPendingId(null)
  }

  return {
    pendingId,
    remove(id, removeCommand) {
      removeCommand(id)
      setPendingId(id)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setPendingId(null), UNDO_WINDOW_MS)
    },
    undo() {
      if (!pendingId) return
      undoCommand(pendingId)
      forget()
    },
    forget,
  }
}
