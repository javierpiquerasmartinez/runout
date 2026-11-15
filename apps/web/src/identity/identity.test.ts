import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from './identity'

/*
 * The marker a session leaves in the browser, which the document's own
 * script reads before first paint to keep the Landing rendered into it out
 * of sight of someone on their way Home.
 */

const MARKER = 'runout.signedIn'

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

describe('the marker that this browser holds a session', () => {
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
})
