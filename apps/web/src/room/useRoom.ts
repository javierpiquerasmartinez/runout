import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { initialRoomView, reduceRoom, type RoomView } from './roomClient'
import { RESYNC_RETRY_MS, RoomConnection } from './roomConnection'

/** What a Participant can ask of the Room. The server decides whether they may. */
export interface RoomCommands {
  /**
   * Opens a Hand of the Queue: on this person's own table in Free Review, on
   * everyone's while Live (the Master only).
   */
  loadHand(handId: string): void
  /** Takes the table to an absolute Action index; 0 is the Initial State. Own or shared, as above. */
  goToAction(actionIndex: number): void
  /** Shows seats that belong to no Participant by Position, or by name again. Own or shared, as above. */
  hideOpponentNames(hidden: boolean): void
  /** The Master starts Live from the Hand and Action they are on. */
  startLive(): void
  /** The Master ends Live: everyone stays where it ended, on their own again. */
  endLive(): void
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
  /** Writes a Note on a Hand in the Queue. Any Participant may. */
  writeNote(handId: string, body: string): void
  /** Rewrites a Note. Only its writer, or the Room's Master, may. */
  editNote(id: string, body: string): void
  /** Removes a Note; undoable for 10 s. Only its writer, or the Room's Master, may. */
  removeNote(id: string): void
  undoNoteRemoval(id: string): void
  /** Marks a Hand for this person alone, or takes the Mark off. */
  setMark(handId: string, marked: boolean): void
  /** The Participant has a new Display Name (the Room already knows): rejoins use it. */
  rejoinAs(displayName: string): void
}

/**
 * Joins the Room over the WebSocket once `displayName` and the identity's
 * `token` are known, and leaves it when the screen goes away. Pass null for
 * either to wait (e.g. while the name is confirmed).
 *
 * A new token (signing in from inside the Room) joins again as its identity.
 *
 * The connection manager keeps the socket up and the reducer holds the Room;
 * this only carries what one says to the other. A revision nobody saw arrive,
 * or a reconnection, leaves the view owed a snapshot, which is asked for here.
 */
export function useRoom(code: string, token: string | null, displayName: string | null): [RoomView, RoomCommands] {
  const [view, dispatch] = useReducer(reduceRoom, initialRoomView)
  const connectionRef = useRef<RoomConnection | null>(null)

  useEffect(() => {
    if (token === null || displayName === null) return
    const connection = new RoomConnection({ code, token, displayName, onEvent: dispatch })
    connectionRef.current = connection
    return () => {
      if (connectionRef.current === connection) connectionRef.current = null
      connection.close()
    }
  }, [code, token, displayName])

  const owed = view.phase === 'in-room' && view.sync.awaitingSnapshot
  useEffect(() => {
    if (!owed) return
    const ask = () => connectionRef.current?.resync()
    ask()
    // The ask can be lost, and the answer can land behind the Room it was
    // drawn from; either way the Room is asked again until one arrives current.
    const retry = setInterval(ask, RESYNC_RETRY_MS)
    return () => clearInterval(retry)
  }, [owed])

  const revision = view.phase === 'in-room' ? view.revision : 0
  useEffect(() => {
    connectionRef.current?.report(revision)
  }, [revision])

  // Read when a command runs, so the commands themselves never change.
  const viewRef = useRef(view)
  useLayoutEffect(() => {
    viewRef.current = view
  }, [view])
  const live = () => viewRef.current.phase === 'in-room' && viewRef.current.state === 'live'

  const send = useCallback((event: string, data: unknown) => connectionRef.current?.send(event, data), [])
  const commands = useMemo<RoomCommands>(
    () => ({
      handOverMaster: (identityId) => send('room.handOver', { identityId }),
      kick: (identityId) => send('room.kick', { identityId }),
      closeRoom: () => send('room.close', {}),
      loadHand: (handId) => {
        if (live()) return send('playback.load', { handId })
        dispatch({ type: 'ownOpened', handId })
        // Kept by the Room, to land this person back on it next time.
        send('review.open', { handId })
      },
      goToAction: (actionIndex) =>
        live() ? send('playback.goTo', { actionIndex }) : dispatch({ type: 'ownWentTo', actionIndex }),
      hideOpponentNames: (hidden) =>
        live() ? send('playback.hideOpponentNames', { hidden }) : dispatch({ type: 'ownHidOpponentNames', hidden }),
      startLive: () => {
        const current = viewRef.current
        const own = current.phase === 'in-room' ? current.own : null
        send('live.start', own ? { handId: own.handId, actionIndex: own.actionIndex } : {})
      },
      endLive: () => send('live.end', {}),
      reassignAuthor: (handId, authorId) => send('queue.reassignAuthor', { handId, authorId }),
      reorderQueue: (order) => send('queue.reorder', { order }),
      removeQueueEntry: (id) => send('queue.remove', { id }),
      undoQueueRemoval: (id) => send('queue.undoRemoval', { id }),
      writeNote: (handId, body) => send('notes.write', { handId, body }),
      editNote: (id, body) => send('notes.edit', { id, body }),
      removeNote: (id) => send('notes.remove', { id }),
      undoNoteRemoval: (id) => send('notes.undoRemoval', { id }),
      setMark: (handId, marked) => send('hand.setMark', { handId, marked }),
      rejoinAs: (displayName) => connectionRef.current?.rename(displayName),
    }),
    [send],
  )

  return [view, commands]
}
