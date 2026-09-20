import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { WelcomePage } from './WelcomePage'

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
})

function renderWelcome() {
  const session = {
    token: 'token',
    identity: { id: 'me', displayName: 'Javier', screenNames: [] },
    rememberDisplayName: () => {},
    rememberScreenNames: () => {},
  }
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <WelcomePage />
      </SessionContext.Provider>
    </I18nProvider>,
  )
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
