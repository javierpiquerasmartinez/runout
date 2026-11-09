import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, type Locale } from '../i18n'
import { SessionContext, type SessionContextValue } from '../identity/context'
import { Routes } from '../routes/Routes'
import { fakeApi, refusal } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'

// Entering a Room needs the app's RoomHolder around the routes; here only where the row leads matters.
vi.mock('../room/RoomPage', () => ({ RoomPage: () => null }))

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

function renderHome({ locale = 'en', session = fakeSession() }: { locale?: Locale; session?: SessionContextValue } = {}) {
  window.history.replaceState(null, '', '/')
  render(
    <I18nProvider initialLocale={locale}>
      <SessionContext.Provider value={session}>
        <Routes />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

/** A Room whose code is its name without spaces, so a row's link says which Room it enters. */
const room = (name: string, over: Record<string, unknown> = {}) => ({
  code: name.replaceAll(' ', ''),
  name,
  state: 'free-review',
  role: 'master',
  hands: 2,
  connected: 0,
  participants: 3,
  lastActivityAt: '2026-11-01T10:00:00Z',
  master: 'Javi',
  ...over,
})
const answering = (...rooms: unknown[]) => fakeApi({ 'GET /rooms': () => Response.json(rooms) })
const loaded = async (text: string) => within((await screen.findByText(text)).closest('section')!)
const entries = (card: Awaited<ReturnType<typeof loaded>>) =>
  card
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'))
    .filter((href) => href?.startsWith('/room/'))

describe('Home · the Rooms card', () => {
  it('lists the Live Rooms first, then the most recently active, at most four', async () => {
    answering(
      room('Oldest', { lastActivityAt: '2026-10-01T10:00:00Z' }),
      room('Recent', { lastActivityAt: '2026-11-05T10:00:00Z' }),
      room('Older live', { state: 'live', lastActivityAt: '2026-11-02T10:00:00Z' }),
      room('Middle', { lastActivityAt: '2026-11-03T10:00:00Z' }),
      room('Newer live', { state: 'live', lastActivityAt: '2026-11-04T10:00:00Z' }),
    )
    renderHome()

    expect(entries(await loaded('Newer live'))).toEqual(['/room/Newerlive', '/room/Olderlive', '/room/Recent', '/room/Middle'])
  })

  it('shows on each row the name, whether it is Live or in Free Review, and how many are connected', async () => {
    answering(room('Sunday group', { state: 'live', connected: 3 }), room('Quiet one', { connected: 1 }), room('Empty one'))
    renderHome()

    const rooms = await loaded('Sunday group')
    const [live, quiet, empty] = rooms.getAllByRole('listitem').map((row) => within(row))
    expect(live.getByText('Live')).toBeTruthy()
    expect(live.getByText('3 connected')).toBeTruthy()
    expect(quiet.getByText('Quiet one')).toBeTruthy()
    expect(quiet.getByText('Free review')).toBeTruthy()
    expect(quiet.getByText('1 connected')).toBeTruthy()
    expect(empty.getByText('0 connected')).toBeTruthy()
  })

  it('says it in Spanish too', async () => {
    answering(room('Grupo', { state: 'live', connected: 3 }), room('Tranquila', { connected: 1 }), room('Vacía'))
    renderHome({ locale: 'es' })

    const rooms = await loaded('Grupo')
    expect(rooms.getByRole('link', { name: 'Salas' })).toBeTruthy()
    expect(rooms.getByText('En directo')).toBeTruthy()
    expect(rooms.getByText('3 conectados')).toBeTruthy()
    expect(rooms.getAllByText('Revisión libre')).toHaveLength(2)
    expect(rooms.getByText('1 conectado')).toBeTruthy()
    expect(rooms.getByText('0 conectados')).toBeTruthy()
  })

  it('enters the Room when its row is pressed', async () => {
    answering(room('Sunday group'))
    renderHome()

    await userEvent.click((await loaded('Sunday group')).getByRole('link', { name: /Sunday group/ }))

    expect(window.location.pathname).toBe('/room/Sundaygroup')
  })

  it('leads to the Rooms screen from its title and from "See all"', async () => {
    answering(room('Sunday group'))
    renderHome()

    const rooms = await loaded('Sunday group')
    expect(rooms.getByRole('link', { name: 'Rooms' }).getAttribute('href')).toBe('/rooms')
    await userEvent.click(rooms.getByRole('link', { name: 'See all' }))

    expect(window.location.pathname).toBe('/rooms')
  })

  it('offers "Ver todas" in Spanish', async () => {
    answering(room('Grupo'))
    renderHome({ locale: 'es' })

    expect((await loaded('Grupo')).getByRole('link', { name: 'Ver todas' }).getAttribute('href')).toBe('/rooms')
  })

  it('says when there is no open Room, and "New room" opens the Rooms screen ready to create one', async () => {
    answering()
    renderHome()

    const rooms = await loaded("You're not in any room")
    expect(rooms.getByText('Create one to review hands with your group.')).toBeTruthy()
    expect(rooms.queryByRole('link', { name: 'See all' })).toBeNull()

    await userEvent.click(rooms.getByRole('button', { name: 'New room' }))

    expect(window.location.pathname).toBe('/rooms')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Room name')))
  })

  it('offers "Nueva sala" in Spanish', async () => {
    answering()
    renderHome({ locale: 'es' })

    const rooms = await loaded('No estás en ninguna sala')
    expect(rooms.getByText('Crea una para repasar manos con tu grupo.')).toBeTruthy()
    expect(rooms.getByRole('button', { name: 'Nueva sala' })).toBeTruthy()
  })

  describe('during an Impersonation', () => {
    const impersonating = () =>
      fakeSession({
        impersonation: { administrator: { displayName: 'Admin', email: 'admin@x.com' }, endsAt: '2099-01-01T00:00:00Z' },
      })
    const explanation = "Rooms aren't available while impersonating someone"

    it('shows the rows without entering a Room, with the usual explanation and no "See all"', async () => {
      answering(room('Sunday group', { state: 'live', connected: 2 }))
      renderHome({ session: impersonating() })

      const rooms = await loaded('Sunday group')
      expect(rooms.getByText(explanation)).toBeTruthy()
      expect(rooms.getByText('Live')).toBeTruthy()
      expect(rooms.getByText('2 connected')).toBeTruthy()
      expect(rooms.getByText('Sunday group').closest('[aria-disabled="true"]')).not.toBeNull()
      expect(entries(rooms)).toEqual([])
      expect(rooms.queryByRole('link', { name: 'See all' })).toBeNull()
      expect(rooms.getByRole('link', { name: 'Rooms' })).toBeTruthy()
    })

    it('locks "New room", saying why, and it opens nothing', async () => {
      answering()
      renderHome({ session: impersonating() })

      const rooms = await loaded("You're not in any room")
      const newRoom = rooms.getByRole('button', { name: `New room. ${explanation}` })
      expect(newRoom.getAttribute('aria-disabled')).toBe('true')

      await userEvent.click(newRoom)

      expect(window.location.pathname).toBe('/')
    })
  })

  it('shows it is loading, title kept, until the read answers', async () => {
    let answer: (response: Response) => void = () => undefined
    fakeApi({ 'GET /rooms': () => new Promise<Response>((resolve) => (answer = resolve)) })
    renderHome()

    const section = await screen.findByRole('region', { name: 'Rooms' })
    expect(section.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(within(section).getByRole('link', { name: 'Rooms' })).toBeTruthy()
    expect(within(section).queryByRole('link', { name: 'See all' })).toBeNull()

    answer(Response.json([room('Sunday group')]))

    expect((await loaded('Sunday group')).getByRole('link', { name: 'See all' })).toBeTruthy()
    expect(section.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('shows a failed read with "Retry", which recovers it, while the other cards go on', async () => {
    let failing = true
    const calls = fakeApi({
      'GET /rooms': () => (failing ? refusal(500, 'internal') : Response.json([room('Sunday group')])),
      'GET /lab/ranges': () => Response.json([{ id: 'r1', name: 'Open' }]),
    })
    renderHome()

    const section = await screen.findByRole('region', { name: 'Rooms' })
    await within(section).findByText("Couldn't load this")
    expect(within(section).queryByRole('link', { name: 'See all' })).toBeNull()
    expect(await screen.findByText('range')).toBeTruthy()

    failing = false
    await userEvent.click(within(section).getByRole('button', { name: 'Retry' }))

    expect(await within(section).findByText('Sunday group')).toBeTruthy()
    expect(within(section).queryByText("Couldn't load this")).toBeNull()
    expect(calls.filter(({ path }) => path === '/rooms')).toHaveLength(2)
    expect(screen.getByText('range')).toBeTruthy()
  })
})
