import { api, ApiError } from '../backend/api'
import { untilAwake } from '../backend/untilAwake'
import { DEFAULT_PREFERENCES, type Preferences } from '../preferences/preferences'

export interface Identity {
  id: string
  displayName: string | null
  /** The names this person plays under on Poker Sites; Hands' Heroes are matched against them. */
  screenNames: string[]
  /** How this person reads the table; kept by the server, restored on every visit. */
  preferences: Preferences
  /** How the Account signs in (ADR 0008); null for an anonymous identity. */
  account: { email: string | null; signInMethods?: SignInMethod[] } | null
  /** The one Room an anonymous identity exists for, and ends with; null for an Account. */
  room: { code: string } | null
  /** Whether the Account runs Runout itself; only the server's configuration makes one. */
  administrator?: boolean
  /** Who is using this Account through an Impersonation, and until when; null for its owner. */
  impersonation?: Impersonation | null
}

export type SignInMethod = 'google' | 'password'

export interface Impersonation {
  administrator: { displayName: string | null; email: string | null }
  /** An ISO instant: the Impersonation ends on its own then. */
  endsAt: string
}

export interface Session {
  token: string
  identity: Identity
}

/**
 * The identity as the server sends it, with any Preference it leaves out read
 * as its default. The web can go live before the server that knows a new
 * Preference, and a missing one must never draw as nothing.
 */
function withDefaultPreferences(identity: Identity): Identity {
  return { ...identity, preferences: { ...DEFAULT_PREFERENCES, ...identity.preferences } }
}

function withDefaults(session: Session): Session {
  return { ...session, identity: withDefaultPreferences(session.identity) }
}

/** Same limit the server enforces. */
export const DISPLAY_NAME_MAX_LENGTH = 40

const TOKEN_KEY = 'runout.identityToken'
/** The Administrator's own token, kept aside while they impersonate someone. */
const ADMINISTRATOR_TOKEN_KEY = 'runout.administratorToken'

/**
 * A marker that this browser is signed in to an Account, and nothing about
 * whose. The document's own script reads it before first paint, to keep the
 * Landing rendered into it out of sight of someone who is on their way Home
 * (see `index.html`, which names the same key). Only an Account's session
 * leaves it: an anonymous identity is shown the Landing at `/` as any
 * Visitor is. It is cleared with the token.
 */
export const ACCOUNT_KEY = 'runout.account'

/** The language last read in here by an identity, which the same script takes for the Landing's over the browser's. */
export const LANGUAGE_KEY = 'runout.language'

/** Keeps the language an identity reads in, for the Landing this browser is shown once it has none. */
export function rememberLanguage(language: Preferences['language'], storage: Storage = window.localStorage) {
  writeKey(storage, LANGUAGE_KEY, language)
}

let loading: Promise<Session | null> | null = null
/** The session the server has recognised this browser with, null for none, and undefined until it has answered. */
let recognised: Session | null | undefined

/** The session this browser has from now on, with no need to ask the server whose it is. */
function settle(session: Session | null) {
  recognised = session
  loading = Promise.resolve(session)
}

/**
 * The session this browser has been recognised with, where that is known
 * already: null for none, and undefined while the server hasn't answered.
 */
export function recognisedSession(): Session | null | undefined {
  return recognised
}

/**
 * Whether this browser was signed in to an Account when it was last
 * recognised, by the marker that leaves: what the document's own script goes
 * by, before the server has said anything.
 */
export function holdsAccount(): boolean {
  return typeof window !== 'undefined' && readKey(window.localStorage, ACCOUNT_KEY) !== null
}

/**
 * Whether this browser holds a token, before the server has said whose it is
 * or whether it still works. False where the app is rendered ahead, when it
 * is built.
 */
export function holdsSession(): boolean {
  return typeof window !== 'undefined' && readToken(window.localStorage) !== null
}

/**
 * Recognises this browser's identity from its stored token; null when it has
 * none, as on a first visit: an identity comes from signing in or joining a
 * Room (ADR 0005). A token the server no longer knows (an anonymous identity
 * whose Room closed, a session signed out elsewhere) is forgotten.
 */
export function loadSession(storage: Storage = window.localStorage): Promise<Session | null> {
  loading ??= fetchSession(storage).then(
    (session) => (recognised = session),
    (error: unknown) => {
      loading = null
      throw error
    },
  )
  return loading
}

async function fetchSession(storage: Storage): Promise<Session | null> {
  const stored = readToken(storage)
  if (!stored) return null
  try {
    // The first request of a visit may find the server asleep: it waits for it to wake.
    const identity = await untilAwake(() => api<Identity>('/identities/me', { token: stored }))
    const session = { token: stored, identity: withDefaultPreferences(identity) }
    // An Account's session from before the marker existed leaves it now.
    writeSession(storage, session)
    return session
  } catch (error) {
    if (!(error instanceof ApiError && error.reason === 'unauthenticated')) throw error
  }
  removeToken(storage)
  // An Impersonation that ran out: back to the Administrator's own Sign-in.
  const administrator = readKey(storage, ADMINISTRATOR_TOKEN_KEY)
  if (administrator) {
    removeKey(storage, ADMINISTRATOR_TOKEN_KEY)
    writeKey(storage, TOKEN_KEY, administrator)
    return fetchSession(storage)
  }
  return null
}

/** Keeps a session the server has just handed this browser, as its own from now on. */
export function keepSession(signedIn: Session, storage: Storage = window.localStorage): Session {
  const session = withDefaults(signedIn)
  writeSession(storage, session)
  settle(session)
  return session
}

/** Signs in with an email and its password. */
export async function signInWithPassword(email: string, password: string): Promise<Session> {
  return keepSession(await api<Session>('/sessions/password', { method: 'POST', body: { email, password } }))
}

/**
 * Starts an Impersonation of an Account: the Administrator's own token is
 * kept aside, and this browser becomes that Account until it ends.
 */
export async function startImpersonation(
  administratorToken: string,
  accountId: string,
  storage: Storage = window.localStorage,
): Promise<Session> {
  const signedIn = await api<Session>(`/admin/accounts/${encodeURIComponent(accountId)}/impersonations`, {
    token: administratorToken,
    method: 'POST',
  })
  writeKey(storage, ADMINISTRATOR_TOKEN_KEY, administratorToken)
  return keepSession(signedIn, storage)
}

/**
 * Ends the Impersonation ("Salir", or it ran out) and brings the
 * Administrator back as themselves. Null when their own Sign-in is gone too.
 */
export async function endImpersonation(token: string, storage: Storage = window.localStorage): Promise<Session | null> {
  try {
    await api<void>('/sessions/current', { token, method: 'DELETE' })
  } catch (error) {
    // Already over on the server.
    if (!(error instanceof ApiError && error.reason === 'unauthenticated')) throw error
  }
  const administrator = readKey(storage, ADMINISTRATOR_TOKEN_KEY)
  removeKey(storage, ADMINISTRATOR_TOKEN_KEY)
  // The Administrator's own session is an Account's: the marker stays.
  if (administrator) writeKey(storage, TOKEN_KEY, administrator)
  else removeToken(storage)
  loading = null
  recognised = undefined
  return loadSession(storage)
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
  const session = withDefaults(
    await api<Session>(`/rooms/${encodeURIComponent(code)}/guests`, {
      method: 'POST',
      body: { displayName },
    }),
  )
  writeSession(storage, session)
  settle(session)
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
  const session = withDefaults(
    await api<Session>('/sessions/google', {
      token: fromToken ?? undefined,
      method: 'POST',
      body: { idToken },
    }),
  )
  writeSession(storage, session)
  settle(session)
  return session
}

/**
 * Forgets an anonymous identity that ended with its Room: its token no longer
 * works, so this browser goes on without one.
 */
export function forgetSession(storage: Storage = window.localStorage) {
  removeToken(storage)
  settle(null)
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
  settle(null)
}

function readToken(storage: Storage): string | null {
  return readKey(storage, TOKEN_KEY)
}

function removeToken(storage: Storage) {
  removeKey(storage, TOKEN_KEY)
  removeKey(storage, ACCOUNT_KEY)
}

/** Keeps a session's token, and leaves the marker if it is an Account's. */
function writeSession(storage: Storage, { token, identity }: Session) {
  writeKey(storage, TOKEN_KEY, token)
  if (identity.account) writeKey(storage, ACCOUNT_KEY, '1')
  else removeKey(storage, ACCOUNT_KEY)
}

function readKey(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function removeKey(storage: Storage, key: string) {
  try {
    storage.removeItem(key)
  } catch {
    // Storage blocked: nothing was kept.
  }
}

function writeKey(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value)
  } catch {
    // Storage blocked: the identity lasts for this page only.
  }
}
