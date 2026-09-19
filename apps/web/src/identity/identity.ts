import { api, ApiError } from '../backend/api'

export interface Identity {
  id: string
  displayName: string | null
  /** The names this person plays under on Poker Sites; Hands' Heroes are matched against them. */
  screenNames: string[]
}

export interface Session {
  token: string
  identity: Identity
}

/** Same limit the server enforces. */
export const DISPLAY_NAME_MAX_LENGTH = 40

const TOKEN_KEY = 'runout.identityToken'

let loading: Promise<Session> | null = null

/**
 * Recognises this browser's identity from its stored token, or issues a new one
 * on the first visit (ADR 0003). A token the server no longer knows is replaced.
 * Callers at the same time share one load, so a first visit issues one identity.
 */
export function loadSession(storage: Storage = window.localStorage): Promise<Session> {
  loading ??= fetchSession(storage).catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}

async function fetchSession(storage: Storage): Promise<Session> {
  const stored = readToken(storage)
  if (stored) {
    try {
      const identity = await api<Identity>('/identities/me', { token: stored })
      return { token: stored, identity }
    } catch (error) {
      if (!(error instanceof ApiError && error.reason === 'unauthenticated')) throw error
    }
  }
  const issued = await api<Session>('/identities', { method: 'POST' })
  writeToken(storage, issued.token)
  return issued
}

function readToken(storage: Storage): string | null {
  try {
    return storage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(storage: Storage, token: string) {
  try {
    storage.setItem(TOKEN_KEY, token)
  } catch {
    // Storage blocked: the identity lasts for this page only.
  }
}
