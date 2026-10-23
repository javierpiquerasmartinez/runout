import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { readJoinIntent } from '../room/joinIntent'
import { fakeSession } from '../test/fakeSession'
import { RoomsPage } from './RoomsPage'

interface OpenRoom {
  code: string
  name: string
  live: boolean
  joinedAt: string
}

let openRooms: OpenRoom[]

beforeEach(() => {
  openRooms = []
  window.history.replaceState(null, '', '/rooms')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://localhost').pathname.replace(/^\/api/, '')
      if (path === '/rooms' && init?.method === 'POST') return Response.json({ code: 'RNT4K9PX', name: 'Martes NL50' })
      if (path === '/rooms') return Response.json(openRooms)
      if (path === '/rooms/RNT4-K9PX') return Response.json({ code: 'RNT4K9PX', name: 'Martes NL50' })
      return Response.json({ reason: 'room-not-found' }, { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

function renderRooms() {
  const session = fakeSession()
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <RoomsPage />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return session
}

describe('RoomsPage · creating a Room', () => {
  it('takes the Master straight into the Room they name', async () => {
    const session = renderRooms()

    await userEvent.type(screen.getByLabelText('Room name'), 'Martes NL50')
    await userEvent.click(screen.getByRole('button', { name: 'Create a new room' }))

    await vi.waitFor(() => expect(window.location.pathname).toBe('/room/RNT4K9PX'))
    expect(readJoinIntent()).toEqual({ displayName: 'Javier' })
    expect(session.rememberDisplayName).toHaveBeenCalledWith('Javier')
  })

  it('focuses the new Room’s name when "New room" is pressed, even on the Rooms screen', async () => {
    renderRooms()
    const name = screen.getByLabelText('Room name')
    expect(document.activeElement).not.toBe(name)

    await userEvent.click(screen.getByRole('button', { name: 'New room' }))
    expect(document.activeElement).toBe(name)
    expect(window.location.pathname).toBe('/rooms')

    await userEvent.click(screen.getByLabelText('Room code'))
    await userEvent.click(screen.getByRole('button', { name: 'New room' }))
    expect(document.activeElement).toBe(name)
  })
})

describe('RoomsPage · coming back to a "New room"', () => {
  it('does not focus the new Room’s name again on a reload', async () => {
    renderRooms()
    await userEvent.click(screen.getByRole('button', { name: 'New room' }))
    cleanup()

    renderRooms()

    expect(document.activeElement).not.toBe(screen.getByLabelText('Room name'))
  })
})

describe('RoomsPage · joining a Room by its code', () => {
  it('leads to the Room the code opens', async () => {
    renderRooms()

    await userEvent.type(screen.getByLabelText('Room code'), 'RNT4-K9PX')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    await vi.waitFor(() => expect(window.location.pathname).toBe('/room/RNT4K9PX'))
  })

  it('says so when no open Room has that code, and stays', async () => {
    renderRooms()

    await userEvent.type(screen.getByLabelText('Room code'), 'ZZZZ-ZZZZ')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByText('There is no open room with that code.')).toBeTruthy()
    expect(window.location.pathname).toBe('/rooms')
  })
})

describe('RoomsPage · the Rooms you can go back to', () => {
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
    renderRooms()

    const live = await screen.findByRole('link', { name: 'Back to “Martes NL50”' })
    expect(live.getAttribute('href')).toBe('/room/RNT4K9PX')
    expect(live.textContent).toContain('live now')
    const quiet = screen.getByRole('link', { name: 'Back to “3-bet pots”' })
    expect(quiet.textContent).toContain('21 days ago')
  })

  it('says nothing at all when there is no open Room to go back to', async () => {
    renderRooms()

    expect(await screen.findByRole('heading', { name: 'Create a room' })).toBeTruthy()
    expect(screen.queryByText('Your recent rooms')).toBeNull()
  })
})
