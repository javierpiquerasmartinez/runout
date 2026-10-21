import { createContext, useContext } from 'react'
import type { Preferences } from '../preferences/preferences'
import type { Session } from './identity'

interface SessionActions {
  /** Keeps the Display Name just used, so later forms are prefilled with it. */
  rememberDisplayName: (displayName: string) => void
  /** Keeps the Screen Names just saved on the server. */
  rememberScreenNames: (screenNames: string[]) => void
  /**
   * Applies some preferences at once and stores them with the identity. If the
   * server refuses, they go back to what they were and the promise rejects.
   */
  changePreferences: (changes: Partial<Preferences>) => Promise<void>
  /**
   * Signs in with the ID token Google gave this browser; this browser becomes
   * that Account. Signing in from inside the Room of the anonymous identity it
   * holds (`fromRoom`), the Account takes that identity's place there.
   */
  signIn: (idToken: string, fromRoom: boolean) => Promise<void>
  /** Signs this browser out, on the server too; it goes on without an identity. */
  signOut: () => Promise<void>
  /** Forgets an anonymous identity whose Room has closed: it no longer works. */
  forgetEnded: () => void
  /** Joins the Room `code` without an Account: a new anonymous identity, for that Room only. */
  joinAnonymously: (code: string, displayName: string) => Promise<void>
}

/** This browser's identity and what can be done with it; without one, a visitor's. */
export type SessionContextValue = (Session | { token: null; identity: null }) & SessionActions

/** The same, for screens only reached with an identity: inside a Room, or as an Account. */
export type IdentifiedSessionValue = Session & SessionActions

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside <SessionProvider>')
  return session
}

/** The session of a screen that is only shown to someone with an identity. */
export function useIdentity(): IdentifiedSessionValue {
  const session = useSession()
  if (session.token === null) throw new Error('useIdentity needs an identity: render it only once there is one')
  return session
}
