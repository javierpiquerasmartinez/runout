import { navigate, useHistoryState } from '../routing'

/** The Rooms screen ("Salas"): an Account's Rooms, to create one, join one by code or go back to one. */
export const roomsPath = '/rooms'

/** What "Nueva sala" leaves in the history entry it opens: a fresh mark each time. */
interface NewRoomRequest {
  newRoom: number
}

/** Opens the Rooms screen with the form to create a Room focused, even from that screen itself. */
export function requestNewRoom() {
  navigate(roomsPath, { newRoom: Date.now() } satisfies NewRoomRequest)
}

/**
 * The mark of the "Nueva sala" that led here and is still unanswered, or null.
 * Answer it with `forgetNewRoomRequest`, so a reload or going back doesn't ask again.
 */
export function useNewRoomRequest(): number | null {
  return useHistoryState((state) =>
    state !== null && typeof state === 'object' && 'newRoom' in state && typeof state.newRoom === 'number'
      ? state.newRoom
      : null,
  )
}

/** Clears the request from this history entry once it has been answered. */
export function forgetNewRoomRequest() {
  window.history.replaceState(null, '', window.location.href)
}
