import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { socketUrl } from '../backend/ping'
import { initialRoomView, parseServerMessage, reduceRoom, type RoomView } from './roomClient'

/** What a Participant can ask of the Room. The server decides whether they may. */
export interface RoomCommands {
  loadHand(handId: string): void
  /** Takes Playback to an absolute Action index; 0 is the Initial State. */
  goToAction(actionIndex: number): void
  /** Gives a Hand in the Queue another Author: a Participant's identity id. */
  reassignAuthor(handId: string, authorId: string): void
}

/**
 * Joins the Room over the WebSocket once `displayName` is known, and leaves it
 * when the screen goes away. Pass null to wait (e.g. while the name is confirmed).
 */
export function useRoom(code: string, token: string, displayName: string | null): [RoomView, RoomCommands] {
  const [view, dispatch] = useReducer(reduceRoom, initialRoomView)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (displayName === null) return
    const socket = new WebSocket(`${socketUrl('/ws')}?token=${encodeURIComponent(token)}`)
    socketRef.current = socket
    const send = (event: string, data: unknown = {}) => socket.send(JSON.stringify({ event, data }))
    // Detached on cleanup, so a socket being closed never touches a later one's view.
    const controller = new AbortController()
    const { signal } = controller

    socket.addEventListener('open', () => send('room.join', { code, displayName }), { signal })
    socket.addEventListener(
      'message',
      (message: MessageEvent<string>) => {
        const event = parseServerMessage(message.data)
        if (event) dispatch(event)
      },
      { signal },
    )
    socket.addEventListener('close', () => dispatch({ type: 'disconnected' }), { signal })

    return () => {
      if (socketRef.current === socket) socketRef.current = null
      controller.abort()
      if (socket.readyState === WebSocket.OPEN) send('room.leave')
      socket.close()
    }
  }, [code, token, displayName])

  const send = useCallback((event: string, data: unknown) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, data }))
  }, [])
  const commands = useMemo<RoomCommands>(
    () => ({
      loadHand: (handId) => send('playback.load', { handId }),
      goToAction: (actionIndex) => send('playback.goTo', { actionIndex }),
      reassignAuthor: (handId, authorId) => send('queue.reassignAuthor', { handId, authorId }),
    }),
    [send],
  )

  return [view, commands]
}
