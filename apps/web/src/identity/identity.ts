import { api, ApiError } from '../backend/api'
import type { Preferences } from '../preferences/preferences'

export interface Identity {
  id: string
  displayName: string | null
  /** The names this person plays under on Poker Sites; Hands' Heroes are matched against them. */
  screenNames: string[]
  /** How this person reads the table; kept by the server, restored on every visit. */
  preferences: Preferences
  /** The Google account signed in (ADR 0005); null for an anonymous identity. */
  account: { email: string | null } | null
  /** The one Room an anonymous identity exists for, and ends with; null for an Account. */
  room: { code: string } | null
}

export interface Session {
  token: string
  identity: Identity
}

/** Same limit the server enforces. */
export const DISPLAY_NAME_MAX_LENGTH = 40

const TOKEN_KEY = 'runout.identityToken'

let loading: Promise<Session | null> | null = null

/**
 * Recognises this browser's identity from its stored token; null when it has
 * none, as on a first visit: an identity comes from signing in or joining a
 * Room (ADR 0005). A token the server no longer knows (an anonymous identity
 * whose Room closed, a session signed out elsewhere) is forgotten.
 */
export function loadSession(storage: Storage = window.localStorage): Promise<Session | null> {
  loading ??= fetchSession(storage).catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}

async function fetchSession(storage: Storage): Promise<Session | null> {
  const stored = readToken(storage)
  if (!stored) return null
  try {
    const identity = await api<Identity>('/identities/me', { token: stored })
    return { token: stored, identity }
  } catch (error) {
    if (!(error instanceof ApiError && error.reason === 'unauthenticated')) throw error
  }
  removeToken(storage)
  return null
}

/**
 * Joins a Room without an Account: a new anonymous identity for that Room
 * only, under `displayName`, whose token this browser keeps from now on.
 */
export async function joinAnonymously(
  code: string,
  displayName: string,
  storage: Storage = window.localStorage,
): Promise<Session> {
  const session = await api<Session>(`/rooms/${encodeURIComponent(code)}/guests`, {
    method: 'POST',
    body: { displayName },
  })
  writeToken(storage, session.token)
  loading = Promise.resolve(session)
  return session
}

/** Whether `identity` can go into the Room `code` as it is, or needs an anonymous one for it. */
export function canEnter(identity: Identity | null, code: string): identity is Identity {
  return identity !== null && (identity.account !== null || identity.room?.code === code)
}

/** Stores the Display Name on the server; it answers with it as kept (trimmed). */
export async function saveDisplayName(token: string, displayName: string): Promise<string> {
  const saved = await api<Identity>('/identities/me/display-name', { token, method: 'PUT', body: { displayName } })
  return saved.displayName ?? ''
}

/**
 * Trades the ID token Google gave this browser for an Account's session, and
 * keeps its token so the Account is recognised on later visits. Signing in as
 * the anonymous identity `fromToken`, the Account takes its place in its Room.
 */
export async function signInWithGoogle(
  idToken: string,
  fromToken: string | null,
  storage: Storage = window.localStorage,
): Promise<Session> {
  const session = await api<Session>('/sessions/google', {
    token: fromToken ?? undefined,
    method: 'POST',
    body: { idToken },
  })
  writeToken(storage, session.token)
  loading = Promise.resolve(session)
  return session
}

/** Ends this browser's session on the server and forgets its token; it goes on without an identity. */
export async function endSession(token: string, storage: Storage = window.localStorage): Promise<void> {
  try {
    await api<void>('/sessions/current', { token, method: 'DELETE' })
  } catch (error) {
    // Already over on the server: forgetting it here is all that's left.
    if (!(error instanceof ApiError && error.reason === 'unauthenticated')) throw error
  }
  removeToken(storage)
  // So Google doesn't sign the same account straight back in.
  window.google?.accounts.id.disableAutoSelect()
  loading = Promise.resolve(null)
}

function readToken(storage: Storage): string | null {
  try {
    return storage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function removeToken(storage: Storage) {
  try {
    storage.removeItem(TOKEN_KEY)
  } catch {
    // Storage blocked: nothing was kept.
  }
}

function writeToken(storage: Storage, token: string) {
  try {
    storage.setItem(TOKEN_KEY, token)
  } catch {
    // Storage blocked: the identity lasts for this page only.
  }
}
