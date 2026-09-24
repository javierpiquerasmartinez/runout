import { createContext, useContext } from 'react'
import type { RoomView } from './roomClient'
import type { RoomCommands } from './useRoom'

/** The Room this person is in, held while they step out to Settings. */
export interface RoomSession {
  code: string
  view: RoomView
  commands: RoomCommands
  /** The name confirmed at the Room's door; null until it is. */
  displayName: string | null
  confirmDisplayName: (displayName: string) => void
}

export const RoomSessionContext = createContext<RoomSession | null>(null)

/** The Room in progress, or null when there is none (e.g. Settings opened from the welcome screen). */
export function useRoomSession(): RoomSession | null {
  return useContext(RoomSessionContext)
}
