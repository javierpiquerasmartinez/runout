import { createContext, useContext } from 'react'
import type { Preferences } from '../preferences/preferences'
import type { Session } from './identity'

export type SessionContextValue = Session & {
  /** Keeps the Display Name just used, so later forms are prefilled with it. */
  rememberDisplayName: (displayName: string) => void
  /** Keeps the Screen Names just saved on the server. */
  rememberScreenNames: (screenNames: string[]) => void
  /**
   * Applies some preferences at once and stores them with the identity. If the
   * server refuses, they go back to what they were and the promise rejects.
   */
  changePreferences: (changes: Partial<Preferences>) => Promise<void>
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside <SessionProvider>')
  return session
}
