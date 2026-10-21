import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { WelcomePage } from './WelcomePage'
import type { Identity } from '../identity/identity'
import { DEFAULT_PREFERENCES } from '../preferences/preferences'
import { fakeGoogleIdentity } from '../test/fakeGoogle'

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

const ACCOUNT = { email: 'javier@example.com' }

function renderWelcome(identity: Partial<Identity> = {}) {
  const session = {
    token: 'token',
    identity: {
      id: 'me',
      displayName: 'Javier',
      screenNames: [],
      preferences: DEFAULT_PREFERENCES,
      account: ACCOUNT,
      ...identity,
    },
    rememberDisplayName: vi.fn(),
    rememberScreenNames: () => {},
    changePreferences: async () => {},
    signIn: vi.fn(async () => {}),
    signOut: async () => {},
  }
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

    expect(session.signIn).toHaveBeenCalledWith('id-token-from-google')
  })

  it('still lets a visitor without an Account join a Room by code', () => {
    fakeGoogleIdentity()
    renderWelcome({ account: null })

    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy()
  })

  it('lets an Account create a Room', () => {
    renderWelcome()

    expect(screen.getByRole('button', { name: 'Create a new room' })).toBeTruthy()
  })

  it('asks a first-time Account for its Display Name, and keeps it', async () => {
    const saved = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({ id: 'me', displayName: JSON.parse(String(init?.body)).displayName }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) =>
        url.endsWith('/api/identities/me/display-name') ? saved(url, init) : Response.json([]),
      ),
    )
    const session = renderWelcome({ displayName: null })

    expect(screen.queryByRole('button', { name: 'Create a new room' })).toBeNull()
    await userEvent.type(screen.getByLabelText('What should the group call you?'), 'Javi')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(session.rememberDisplayName).toHaveBeenCalledWith('Javi'))
    expect(saved).toHaveBeenCalledOnce()
  })
})
