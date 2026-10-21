import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { WelcomePage } from './WelcomePage'
import type { Identity } from '../identity/identity'
import { fakeGoogleIdentity } from '../test/fakeGoogle'
import { fakeSession, fakeVisitor } from '../test/fakeSession'
import type { SessionContextValue } from '../identity/context'

interface OpenRoom {
  code: string
  name: string
  live: boolean
  joinedAt: string
}

let openRooms: OpenRoom[]

beforeEach(() => {
  openRooms = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/api/rooms')) return Response.json(openRooms)
      return Response.json({ reason: 'room-not-found' }, { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function renderWelcome(identity: Partial<Identity> = {}) {
  return renderWelcomeAs(fakeSession(identity))
}

function renderWelcomeAs<T extends SessionContextValue>(session: T): T {
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <WelcomePage />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return session
}

describe('WelcomePage · the Rooms you can go back to', () => {
  it('lists the open Rooms the server gives, with a way into each', async () => {
    openRooms = [
      { code: 'RNT4K9PX', name: 'Martes NL50', live: true, joinedAt: new Date().toISOString() },
      {
        code: 'RNT7H2QD',
        name: '3-bet pots',
        live: false,
        joinedAt: new Date(Date.now() - 21 * 24 * 3_600_000).toISOString(),
      },
    ]
    renderWelcome()

    const live = await screen.findByRole('link', { name: 'Back to “Martes NL50”' })
    expect(live.getAttribute('href')).toBe('/room/RNT4K9PX')
    expect(live.textContent).toContain('live now')
    const quiet = screen.getByRole('link', { name: 'Back to “3-bet pots”' })
    expect(quiet.textContent).toContain('21 days ago')
  })

  it('keeps the list for Accounts: a visitor or an anonymous identity sees none', async () => {
    openRooms = [{ code: 'RNT4K9PX', name: 'Martes NL50', live: true, joinedAt: new Date().toISOString() }]
    fakeGoogleIdentity()
    renderWelcomeAs(fakeVisitor())
    renderWelcome({ account: null, room: { code: 'RNT4K9PX' } })

    expect(await screen.findAllByRole('heading', { name: 'Create a room' })).toHaveLength(2)
    expect(screen.queryByText('Your recent rooms')).toBeNull()
    expect(fetch).not.toHaveBeenCalledWith(expect.stringMatching(/\/api\/rooms$/), expect.anything())
  })

  it('says nothing at all when there is no open Room to go back to', async () => {
    renderWelcome()

    expect(await screen.findByRole('heading', { name: 'Create a room' })).toBeTruthy()
    expect(screen.queryByText('Your recent rooms')).toBeNull()
  })
})

describe('WelcomePage · signing in', () => {
  it('asks a visitor without an Account to sign in with Google before creating a Room', async () => {
    fakeGoogleIdentity('id-token-from-google')
    const session = renderWelcome({ account: null })

    const create = screen.getByRole('button', { name: 'Create a new room. Sign in with Google to create a room.' })
    expect(create.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Sign in with Google to create rooms and keep your hands.')).toBeTruthy()
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    expect(session.signIn).toHaveBeenCalledWith('id-token-from-google', false)
  })

  it('still lets a visitor without an Account join a Room by code', async () => {
    fakeGoogleIdentity()
    vi.mocked(fetch).mockImplementation(async () => Response.json({ code: 'RNT4K9PX', name: 'Martes NL50' }))
    renderWelcomeAs(fakeVisitor())

    await userEvent.type(screen.getByLabelText('Room code'), 'RNT4-K9PX')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    await vi.waitFor(() => expect(window.location.pathname).toBe('/room/RNT4K9PX'))
  })

  it('lets an Account create a Room', () => {
    renderWelcome()

    expect(screen.getByRole('button', { name: 'Create a new room' })).toBeTruthy()
  })
})

describe('WelcomePage · the Library', () => {
  it('leads an Account to its Library, and nobody else', async () => {
    fakeGoogleIdentity()
    renderWelcome()
    expect((await screen.findByRole('link', { name: 'My library' })).getAttribute('href')).toBe('/library')
  })

  it('offers no Library to an anonymous identity', () => {
    renderWelcome({ account: null, room: { code: 'RNT4K9PX' } })
    expect(screen.queryByRole('link', { name: 'My library' })).toBeNull()
  })
})
