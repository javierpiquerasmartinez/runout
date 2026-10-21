import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSession } from '../identity/context'
import { readJoinIntent } from './joinIntent'
import { HeldRoomContext } from './heldRoomContext'
import { useRoom } from './useRoom'

/**
 * Keeps one Participant in the Room — the socket, the heartbeats, the Room as
 * it moves — for as long as it is rendered, whichever screen is showing. The
 * app renders it across the Room and Settings, so stepping out to change a
 * preference or the Display Name never leaves the Room.
 */
export function RoomHolder({ code, children }: { code: string; children: ReactNode }) {
  const { token, identity } = useSession()
  const [displayName, setDisplayName] = useState<string | null>(() => readJoinIntent()?.displayName ?? null)
  // Without an identity yet, the Room waits for one: joining issues it.
  const [view, commands] = useRoom(code, token, displayName)
  const currentName = identity?.displayName

  // A new Display Name from Settings reaches the Room over HTTP; coming back
  // after a drop must not put the old one back.
  useEffect(() => {
    if (currentName) commands.rejoinAs(currentName)
  }, [currentName, commands])

  const held = useMemo(
    () => ({ code, view, commands, displayName, confirmDisplayName: setDisplayName }),
    [code, view, commands, displayName],
  )
  return <HeldRoomContext value={held}>{children}</HeldRoomContext>
}
