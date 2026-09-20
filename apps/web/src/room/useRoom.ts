import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { initialRoomView, reduceRoom, type RoomView } from './roomClient'
import { RoomConnection } from './roomConnection'

/** What a Participant can ask of the Room. The server decides whether they may. */
export interface RoomCommands {
  loadHand(handId: string): void
  /** Takes Playback to an absolute Action index; 0 is the Initial State. */
  goToAction(actionIndex: number): void
  /** Hands the Master role to another Participant, by identity id. */
  handOverMaster(identityId: string): void
  /** Removes a Participant from the Room for good. Only the Master may. */
  kick(identityId: string): void
  /** Ends the session for everyone. Only the Master may, and it never reopens. */
  closeRoom(): void
  /** Gives a Hand in the Queue another Author: a Participant's identity id. */
  reassignAuthor(handId: string, authorId: string): void
  /** Puts the Queue's active Entries in this order, the same for everyone. */
  reorderQueue(order: string[]): void
  /** Removes a Queue Entry; undoable for 10 s. */
  removeQueueEntry(id: string): void
  undoQueueRemoval(id: string): void
}

/**
 * Joins the Room over the WebSocket once `displayName` is known, and leaves it
 * when the screen goes away. Pass null to wait (e.g. while the name is confirmed).
 *
 * The connection manager keeps the socket up and the reducer holds the Room;
 * this only carries what one says to the other. A revision nobody saw arrive,
 * or a reconnection, leaves the view owed a snapshot, which is asked for here.
 */
export function useRoom(code: string, token: string, displayName: string | null): [RoomView, RoomCommands] {
  const [view, dispatch] = useReducer(reduceRoom, initialRoomView)
  const connectionRef = useRef<RoomConnection | null>(null)

  useEffect(() => {
    if (displayName === null) return
    const connection = new RoomConnection({ code, token, displayName, onEvent: dispatch })
    connectionRef.current = connection
    return () => {
      if (connectionRef.current === connection) connectionRef.current = null
      connection.close()
    }
  }, [code, token, displayName])

  const owed = view.phase === 'in-room' && view.sync.awaitingSnapshot
  useEffect(() => {
    if (owed) connectionRef.current?.resync()
  }, [owed])

  const revision = view.phase === 'in-room' ? view.revision : 0
  useEffect(() => {
    connectionRef.current?.report(revision)
  }, [revision])

  const send = useCallback((event: string, data: unknown) => connectionRef.current?.send(event, data), [])
  const commands = useMemo<RoomCommands>(
    () => ({
      handOverMaster: (identityId) => send('room.handOver', { identityId }),
      kick: (identityId) => send('room.kick', { identityId }),
      closeRoom: () => send('room.close', {}),
      loadHand: (handId) => send('playback.load', { handId }),
      goToAction: (actionIndex) => send('playback.goTo', { actionIndex }),
      reassignAuthor: (handId, authorId) => send('queue.reassignAuthor', { handId, authorId }),
      reorderQueue: (order) => send('queue.reorder', { order }),
      removeQueueEntry: (id) => send('queue.remove', { id }),
      undoQueueRemoval: (id) => send('queue.undoRemoval', { id }),
    }),
    [send],
  )

  return [view, commands]
}
