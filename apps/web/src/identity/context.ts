import { createContext, useContext } from 'react'
import type { Session } from './identity'

export type SessionContextValue = Session & {
  /** Keeps the Display Name just used, so later forms are prefilled with it. */
  rememberDisplayName: (displayName: string) => void
  /** Keeps the Screen Names just saved on the server. */
  rememberScreenNames: (screenNames: string[]) => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside <SessionProvider>')
  return session
}
