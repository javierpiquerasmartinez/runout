import { cleanup, render, screen, within } from '@testing-library/react'
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
  state: 'free-review' | 'live'
  role: 'master' | 'guest'
  hands: number
  connected: number
  participants: number
  lastActivityAt: string
  master: string
  joinedAt: string
}

let openRooms: OpenRoom[]
/** Every request the page made that changes something, as `METHOD /path`. */
let changes: string[]

const mine: OpenRoom = {
  code: 'RNT4K9PX',
  name: 'Martes NL50',
  state: 'free-review',
  role: 'master',
  hands: 12,
  connected: 1,
  participants: 4,
  lastActivityAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  master: 'Javier',
  joinedAt: new Date().toISOString(),
}

const theirs: OpenRoom = {
  ...mine,
  code: 'RNT7H2QD',
  name: '3-bet pots',
  state: 'live',
  role: 'guest',
  hands: 5,
  connected: 3,
  participants: 3,
  master: 'Marta',
}

beforeEach(() => {
  openRooms = []
  changes = []
  window.history.replaceState(null, '', '/rooms')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://localhost').pathname.replace(/^\/api/, '')
      if (path === '/rooms' && init?.method === 'POST') return Response.json({ code: 'RNT4K9PX', name: 'Martes NL50' })
      if (path === '/rooms') return Response.json(openRooms)
      if (init?.method && init.method !== 'GET') {
        changes.push(`${init.method} ${path}`)
        if (init.method === 'PATCH') return Response.json({ code: 'RNT4K9PX', ...JSON.parse(String(init.body)) })
        return new Response(null, { status: 204 })
      }
      if (path.endsWith('/room-hands')) return Response.json({ count: 2 })
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

/** The Rooms screen of someone with no open Room, once it knows: the create and join panels. */
async function renderEmptyRooms() {
  const session = renderRooms()
  await screen.findByLabelText('Room code')
  return session
}

describe('RoomsPage · creating a Room', () => {
  it('takes the Master straight into the Room they name', async () => {
    const session = await renderEmptyRooms()

    await userEvent.type(screen.getByLabelText('Room name'), 'Martes NL50')
    await userEvent.click(screen.getByRole('button', { name: 'Create a new room' }))

    await vi.waitFor(() => expect(window.location.pathname).toBe('/room/RNT4K9PX'))
    expect(readJoinIntent()).toEqual({ displayName: 'Javier' })
    expect(session.rememberDisplayName).toHaveBeenCalledWith('Javier')
  })

  it('focuses the new Room’s name when "New room" is pressed, even on the Rooms screen', async () => {
    await renderEmptyRooms()
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
    await renderEmptyRooms()
    await userEvent.click(screen.getByRole('button', { name: 'New room' }))
    cleanup()

    await renderEmptyRooms()

    expect(document.activeElement).not.toBe(screen.getByLabelText('Room name'))
  })
})

describe('RoomsPage · joining a Room by its code', () => {
  it('leads to the Room the code opens', async () => {
    await renderEmptyRooms()

    await userEvent.type(screen.getByLabelText('Room code'), 'RNT4-K9PX')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    await vi.waitFor(() => expect(window.location.pathname).toBe('/room/RNT4K9PX'))
  })

  it('says so when no open Room has that code, and stays', async () => {
    await renderEmptyRooms()

    await userEvent.type(screen.getByLabelText('Room code'), 'ZZZZ-ZZZZ')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByText('There is no open room with that code.')).toBeTruthy()
    expect(window.location.pathname).toBe('/rooms')
  })
})

describe('RoomsPage · your Rooms', () => {
  it('lists the Rooms you lead and those you take part in, apart, with what is going on in each', async () => {
    openRooms = [theirs, mine]
    renderRooms()

    const led = await screen.findByRole('region', { name: 'My rooms' })
    const joined = screen.getByRole('region', { name: 'Rooms I take part in' })
    const myRow = within(led).getByRole('listitem')
    expect(within(myRow).getByRole('link', { name: 'Martes NL50' }).getAttribute('href')).toBe('/room/RNT4K9PX')
    expect(myRow.textContent).toContain('12 hands')
    expect(myRow.textContent).toContain('1/4 connected')
    expect(myRow.textContent).toContain('2 hours ago')
    expect(within(myRow).queryByText('Live')).toBeNull()
    const theirRow = within(joined).getByRole('listitem')
    expect(within(theirRow).getByText('Live')).toBeTruthy()
    expect(theirRow.textContent).toContain('Master: Marta')
  })

  it('leads with the list, keeping a way to create a Room and to join one by code', async () => {
    openRooms = [mine]
    renderRooms()

    await screen.findByRole('region', { name: 'My rooms' })
    expect(screen.queryByLabelText('Room name')).toBeNull()

    await userEvent.type(screen.getByLabelText('Room code'), 'RNT4-K9PX')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    await vi.waitFor(() => expect(window.location.pathname).toBe('/room/RNT4K9PX'))
  })

  it('opens the create form, focused, from "New room"', async () => {
    openRooms = [mine]
    renderRooms()
    await screen.findByRole('region', { name: 'My rooms' })

    await userEvent.click(screen.getByRole('button', { name: 'New room' }))

    expect(document.activeElement).toBe(screen.getByLabelText('Room name'))
  })

  it('copies a Room’s link', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    openRooms = [mine]
    renderRooms()

    await userEvent.click(await screen.findByRole('button', { name: 'Copy the link to “Martes NL50”' }))

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/room/RNT4K9PX`)
  })

  it('lets the Master rename a Room in place', async () => {
    openRooms = [mine]
    renderRooms()

    await userEvent.click(await screen.findByRole('button', { name: 'Rename “Martes NL50”' }))
    const field = screen.getByLabelText('Room name')
    await userEvent.clear(field)
    await userEvent.type(field, 'Jueves NL100{Enter}')

    expect(await screen.findByRole('link', { name: 'Jueves NL100' })).toBeTruthy()
    expect(changes).toEqual(['PATCH /rooms/RNT4K9PX'])
  })

  it('lets the Master close a Room once they confirm, saying what is lost', async () => {
    openRooms = [mine]
    renderRooms()

    await userEvent.click(await screen.findByRole('button', { name: 'Close “Martes NL50”' }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText(/2 hands in the queue are in nobody's library/)).toBeTruthy()
    expect(changes).toEqual([])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close the room' }))

    await vi.waitFor(() => expect(screen.queryByRole('link', { name: 'Martes NL50' })).toBeNull())
    expect(changes).toEqual(['POST /rooms/RNT4K9PX/close'])
  })

  it('lets a Guest Leave a Room once they confirm', async () => {
    openRooms = [mine, theirs]
    renderRooms()

    await userEvent.click(await screen.findByRole('button', { name: 'Leave “3-bet pots”' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave the room' }))

    await vi.waitFor(() => expect(screen.queryByRole('link', { name: '3-bet pots' })).toBeNull())
    expect(changes).toEqual(['DELETE /rooms/RNT7H2QD/membership'])
  })

  it('offers each person only what their role allows', async () => {
    openRooms = [mine, theirs]
    renderRooms()

    await screen.findByRole('region', { name: 'My rooms' })
    expect(screen.queryByRole('button', { name: 'Leave “Martes NL50”' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rename “3-bet pots”' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close “3-bet pots”' })).toBeNull()
  })

  it('shows the create and join panels when there is no open Room', async () => {
    renderRooms()

    expect(await screen.findByRole('heading', { name: 'Create a room' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'My rooms' })).toBeNull()
  })
})
