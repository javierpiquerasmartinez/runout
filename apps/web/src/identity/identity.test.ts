import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from './identity'

/*
 * The marker an Account's session leaves in the browser, which the
 * document's own script reads before first paint to keep the Landing
 * rendered into it out of sight of someone on their way Home.
 */

const MARKER = 'runout.account'
const TOKEN = 'runout.identityToken'

/** An identity with no Account: it exists for one Room, and at `/` it is shown the Landing as any Visitor is. */
const anonymous: Session = {
  token: 'a-guest-token',
  identity: {
    id: 'guest-1',
    displayName: 'Marta',
    screenNames: [],
    preferences: {} as Session['identity']['preferences'],
    account: null,
    room: { code: 'ABCDEF' },
  },
}

const session: Session = {
  token: 'a-secret-token',
  identity: {
    id: 'account-1',
    displayName: 'Javier',
    screenNames: ['jpiqueras'],
    preferences: {} as Session['identity']['preferences'],
    account: { email: 'javier@example.com' },
    room: null,
  },
}

/** A browser's storage, and everything in it. */
function storage() {
  const kept = new Map<string, string>()
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  } as unknown as Storage & { kept: Map<string, string> }
}

// `loadSession` keeps its answer for the page's life: each test gets fresh modules.
const identity = () => import('./identity')

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe("the marker that this browser holds an Account's session", () => {
  it('is left by signing in, and holds nothing about the Account', async () => {
    const browser = storage()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(session)))
    const { signInWithGoogle } = await identity()

    await signInWithGoogle('id-token', null, browser)

    expect(browser.kept.get(MARKER)).toBe('1')
  })

  it('is left by a session kept from an accepted Invitation or a password', async () => {
    const browser = storage()
    const { keepSession } = await identity()

    keepSession(session, browser)

    expect(browser.kept.get(MARKER)).toBe('1')
  })

  it('is left by a session from before the marker existed, once the server recognises it', async () => {
    const browser = storage()
    browser.setItem('runout.identityToken', session.token)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(session.identity)))
    const { loadSession } = await identity()

    await loadSession(browser)

    expect(browser.kept.get(MARKER)).toBe('1')
  })

  it('is cleared by signing out', async () => {
    const browser = storage()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    const { keepSession, endSession } = await identity()
    keepSession(session, browser)

    await endSession(session.token, browser)

    expect([...browser.kept.keys()]).toEqual([])
  })

  it('is cleared when the server no longer knows the session', async () => {
    const browser = storage()
    browser.setItem('runout.identityToken', session.token)
    browser.setItem(MARKER, '1')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reason: 'unauthenticated' }, { status: 401 })))
    const { loadSession } = await identity()

    expect(await loadSession(browser)).toBeNull()

    expect([...browser.kept.keys()]).toEqual([])
  })

  it('is not left by joining a Room without an Account', async () => {
    const browser = storage()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(anonymous)))
    const { joinAnonymously } = await identity()

    await joinAnonymously('ABCDEF', 'Marta', browser)

    expect([...browser.kept.keys()]).toEqual([TOKEN])
  })

  it('is not left by an anonymous identity the server recognises', async () => {
    const browser = storage()
    browser.setItem(TOKEN, anonymous.token)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(anonymous.identity)))
    const { loadSession } = await identity()

    await loadSession(browser)

    expect([...browser.kept.keys()]).toEqual([TOKEN])
  })

  it('goes when an anonymous identity takes the place of an Account here', async () => {
    const browser = storage()
    const { keepSession } = await identity()
    keepSession(session, browser)

    keepSession(anonymous, browser)

    expect([...browser.kept.keys()]).toEqual([TOKEN])
  })
})

describe('the session this browser has been recognised with', () => {
  it('is not known until the server has answered', async () => {
    const browser = storage()
    browser.setItem(TOKEN, session.token)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(session.identity)))
    const { loadSession, recognisedSession } = await identity()

    expect(recognisedSession()).toBeUndefined()
    await loadSession(browser)

    expect(recognisedSession()?.identity.id).toBe('account-1')
  })

  it('is known to be none in a browser the server no longer knows', async () => {
    const browser = storage()
    browser.setItem(TOKEN, session.token)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reason: 'unauthenticated' }, { status: 401 })))
    const { loadSession, recognisedSession } = await identity()

    await loadSession(browser)

    expect(recognisedSession()).toBeNull()
  })

  it('is the one just signed in with, and none once signed out', async () => {
    const browser = storage()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    const { keepSession, endSession, recognisedSession } = await identity()

    keepSession(session, browser)
    expect(recognisedSession()?.token).toBe(session.token)

    await endSession(session.token, browser)
    expect(recognisedSession()).toBeNull()
  })
})
