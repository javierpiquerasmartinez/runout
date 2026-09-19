import { useEffect, useReducer } from 'react'
import { socketUrl } from '../backend/ping'
import { initialRoomView, parseServerMessage, reduceRoom, type RoomView } from './roomClient'

/**
 * Joins the Room over the WebSocket once `displayName` is known, and leaves it
 * when the screen goes away. Pass null to wait (e.g. while the name is confirmed).
 */
export function useRoom(code: string, token: string, displayName: string | null): RoomView {
  const [view, dispatch] = useReducer(reduceRoom, initialRoomView)

  useEffect(() => {
    if (displayName === null) return
    const socket = new WebSocket(`${socketUrl('/ws')}?token=${encodeURIComponent(token)}`)
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
      controller.abort()
      if (socket.readyState === WebSocket.OPEN) send('room.leave')
      socket.close()
    }
  }, [code, token, displayName])

  return view
}
