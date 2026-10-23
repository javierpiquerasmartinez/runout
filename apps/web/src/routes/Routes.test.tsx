import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext, type SessionContextValue } from '../identity/context'
import { HeldRoomContext } from '../room/heldRoomContext'
import { initialRoomView } from '../room/roomClient'
import splitPot from '../room/fixtures/split-pot.json'
import type { RoomCommands } from '../room/useRoom'
import { fakeGoogleIdentity } from '../test/fakeGoogle'
import { fakeSession, fakeVisitor } from '../test/fakeSession'
import { Redirect, Routes } from './Routes'

const emptyLibrary = {
  total: 0,
  page: 1,
  pageSize: 50,
  hands: [],
  options: { sites: [], heroes: [], stakes: [], tags: [] },
  counts: { all: 0, marked: 0 },
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url, 'http://localhost').pathname.replace(/^\/api/, '')
      if (path === '/rooms') return Response.json([])
      if (path === '/rooms/RNT4K9PX') return Response.json({ code: 'RNT4K9PX', name: 'Martes NL50' })
      if (path.startsWith('/rooms/')) return Response.json({ reason: 'room-not-found' }, { status: 404 })
      if (path === '/library/hands') return Response.json(emptyLibrary)
      if (path === '/library/results') return Response.json({ points: [] })
      if (path.endsWith('/notes')) return Response.json({ notes: [], marked: false })
      if (path === '/hands/split-pot') return Response.json(splitPot)
      return Response.json({ reason: 'not-found' }, { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.history.replaceState(null, '', '/')
})

const visitor = () => fakeVisitor()
const anonymous = () => fakeSession({ account: null, room: { code: 'RNT4K9PX' } })
const account = () => fakeSession()

/** The app at `path`, as this session finds it, with the Room RNT4K9PX held as `App` holds it on a Room's paths. */
function renderAt(path: string, session: SessionContextValue) {
  window.history.replaceState(null, '', path)
  const confirmDisplayName = vi.fn()
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <HeldRoomContext
          value={{
            code: 'RNT4K9PX',
            view: initialRoomView,
            commands: {} as RoomCommands,
            displayName: null,
            confirmDisplayName,
          }}
        >
          <Routes />
        </HeldRoomContext>
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return confirmDisplayName
}

/** The app at `path` for a visitor whose Google sign-in makes this browser an Account. */
function renderSigningIn(path: string) {
  window.history.replaceState(null, '', path)
  function SigningIn() {
    const [signedIn, setSignedIn] = useState(false)
    const [signedOut] = useState(() => fakeVisitor({ signIn: vi.fn(async () => setSignedIn(true)) }))
    return (
      <SessionContext.Provider value={signedIn ? fakeSession() : signedOut}>
        <Routes />
      </SessionContext.Provider>
    )
  }
  render(
    <I18nProvider initialLocale="en">
      <SigningIn />
    </I18nProvider>,
  )
}

const landing = () => screen.findByRole('heading', { name: /The group, the same hand/ })
const login = () => screen.findByRole('main', { name: 'Sign in' })
const library = () => screen.findByRole('heading', { name: 'All hands' })
const libraryHand = () => screen.findByRole('link', { name: /Back to the library/ })
const roomLibrary = () => screen.findByRole('link', { name: /Back to RNT4-K9PX/ })
const settings = () => screen.findByRole('heading', { name: 'Profile and play' })
const room = () => screen.findByRole('heading', { name: 'Martes NL50' })
const rooms = () => screen.findByRole('heading', { name: 'Rooms' })

describe('Routes · the landing, for visitors', () => {
  it.each([
    ['no identity', visitor],
    ['an anonymous identity', anonymous],
  ])('shows it at / with %s: sign in, or bring a Room Code', async (_, session) => {
    renderAt('/', session())

    expect(await landing()).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: 'Have a room code?' }).getAttribute('href')).toBe('/room')
    expect(screen.queryByRole('heading', { name: 'Create a room' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('is where an unknown path falls back to', async () => {
    renderAt('/nowhere', visitor())

    expect(await landing()).toBeTruthy()
  })

  it.each(['/', '/nowhere'])('sends an Account from %s to its Library', async (path) => {
    renderAt(path, account())

    expect(await library()).toBeTruthy()
    expect(window.location.pathname).toBe('/library')
  })
})

describe('Routes · the Library, only for an Account', () => {
  it.each([
    ['/library', library],
    ['/library/hands/split-pot', libraryHand],
    ['/room/RNT4K9PX/library', roomLibrary],
  ])('shows %s to an Account', async (path, shown) => {
    renderAt(path, account())

    expect(await shown()).toBeTruthy()
  })

  it.each([
    ['/library', 'no identity', visitor],
    ['/library', 'an anonymous identity', anonymous],
    ['/library/graph', 'no identity', visitor],
    ['/library/graph', 'an anonymous identity', anonymous],
    ['/library/hands/split-pot', 'no identity', visitor],
    ['/library/hands/split-pot', 'an anonymous identity', anonymous],
  ])('sends %s with %s to /login', async (path, _, session) => {
    renderAt(path, session())

    expect(await login()).toBeTruthy()
    expect(window.location.pathname).toBe('/login')
  })

  it.each([
    ['no identity', visitor],
    ['an anonymous identity', anonymous],
  ])("shows the landing at a Room's Library with %s", async (_, session) => {
    renderAt('/room/RNT4K9PX/library', session())

    expect(await landing()).toBeTruthy()
  })
})

describe('Routes · /login, for anyone without an Account', () => {
  it.each([
    ['no identity', visitor],
    ['an anonymous identity', anonymous],
  ])('offers Google and the way back with %s', async (_, session) => {
    fakeGoogleIdentity()
    renderAt('/login', session())

    expect(await login()).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/')
  })

  it('sends an Account to its Library', async () => {
    renderAt('/login', account())

    expect(await library()).toBeTruthy()
    expect(window.location.pathname).toBe('/library')
  })

  it('lands in the Library once signed in there', async () => {
    fakeGoogleIdentity('id-token-from-google')
    renderSigningIn('/login')

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    expect(await library()).toBeTruthy()
    expect(window.location.pathname).toBe('/library')
  })

  it('lands in the Library, not where they came from, once sent there from a protected screen', async () => {
    fakeGoogleIdentity()
    renderSigningIn('/library/hands/split-pot')
    await waitFor(() => expect(window.location.pathname).toBe('/login'))

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    expect(await library()).toBeTruthy()
    expect(window.location.pathname).toBe('/library')
  })
})

describe('Routes · the Rooms screen, only for an Account', () => {
  it('shows /rooms to an Account', async () => {
    renderAt('/rooms', account())

    expect(await rooms()).toBeTruthy()
  })

  it.each([
    ['no identity', visitor],
    ['an anonymous identity', anonymous],
  ])('sends %s from /rooms to /login', async (_, session) => {
    renderAt('/rooms', session())

    expect(await login()).toBeTruthy()
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByRole('heading', { name: 'Rooms' })).toBeNull()
  })
})

describe('Routes · Settings, for any identity', () => {
  it.each([
    ['an anonymous identity', anonymous],
    ['an Account', account],
  ])('shows them with %s', async (_, session) => {
    renderAt('/settings', session())

    expect(await settings()).toBeTruthy()
  })

  it('sends no identity to /login', async () => {
    renderAt('/settings', visitor())

    expect(await login()).toBeTruthy()
    expect(window.location.pathname).toBe('/login')
  })
})

describe('Routes · typing a Room Code', () => {
  it.each([
    ['no identity', visitor],
    ['an anonymous identity', anonymous],
  ])('shows /room with %s', async (_, session) => {
    renderAt('/room', session())

    expect(await screen.findByRole('textbox', { name: 'Room code' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /The group, the same hand/ })).toBeNull()
  })

  it("leads from /room to the Room's door", async () => {
    renderAt('/room', visitor())

    await userEvent.type(await screen.findByRole('textbox', { name: 'Room code' }), 'RNT4K9PX')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await room()).toBeTruthy()
    expect(window.location.pathname).toBe('/room/RNT4K9PX')
  })

  it('says so on /room when no open Room has that code', async () => {
    renderAt('/room', visitor())

    await userEvent.type(await screen.findByRole('textbox', { name: 'Room code' }), 'NOPE1234')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByText('There is no open room with that code.')).toBeTruthy()
    expect(window.location.pathname).toBe('/room')
  })

  it('sends an Account from /room to /rooms, which has a field for it too', async () => {
    renderAt('/room', account())

    await waitFor(() => expect(window.location.pathname).toBe('/rooms'))
  })
})

describe('Routes · a Room, for anyone with its link', () => {
  it.each([
    ['no identity', visitor],
    ['an anonymous identity of another Room', () => fakeSession({ account: null, room: { code: 'RNT7H2QD' } })],
  ])('shows its door, with the two ways in, with %s', async (_, session) => {
    renderAt('/room/RNT4K9PX', session())

    expect(await room()).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enter without an account' })).toBeTruthy()
  })

  it.each([
    ['the anonymous identity of this Room', anonymous],
    ['an Account', account],
  ])('lets %s straight in', async (_, session) => {
    const enter = renderAt('/room/RNT4K9PX', session())

    await waitFor(() => expect(enter).toHaveBeenCalledWith('Javier'))
    expect(screen.queryByRole('button', { name: 'Enter without an account' })).toBeNull()
  })
})

describe('Redirect', () => {
  it('replaces the path opened, so going back does not bounce to it', async () => {
    window.history.replaceState(null, '', '/')
    window.history.pushState(null, '', '/login')
    const entries = window.history.length

    render(<Redirect to="/library" />)

    await waitFor(() => expect(window.location.pathname).toBe('/library'))
    expect(window.history.length).toBe(entries)
  })
})
