import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../backend/api'
import { I18nProvider } from '../i18n'
import { SessionContext, type SessionContextValue } from '../identity/context'
import { fakeSession } from '../test/fakeSession'
import { AppHeader } from './AppHeader'

afterEach(() => window.history.replaceState(null, '', '/'))

function renderHeader(session: SessionContextValue = fakeSession()) {
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <AppHeader current="library" />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return session
}

describe('AppHeader · the account menu', () => {
  it('opens from the avatar with the Display Name, Settings and Sign out', async () => {
    renderHeader()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    expect(screen.getByText('Javier')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('closes once Settings is chosen', async () => {
    renderHeader()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('link', { name: 'Settings' }))

    expect(window.location.pathname).toBe('/settings')
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })

  it('signs this browser out and lands on the start', async () => {
    window.history.pushState(null, '', '/library')
    const session = renderHeader()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(session.signOut).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/')
  })

  it('says so in the menu when signing out fails, and stays', async () => {
    window.history.pushState(null, '', '/library')
    renderHeader(
      fakeSession(
        {},
        {
          signOut: vi.fn(async () => {
            throw new ApiError(0, 'network')
          }),
        },
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    const alert = await screen.findByText("Couldn't sign out. We couldn't reach the server. Try again.")
    expect(alert.getAttribute('role')).toBe('alert')
    expect(window.location.pathname).toBe('/library')
  })

  it('has no account menu for an anonymous Participant', () => {
    renderHeader(fakeSession({ account: null, room: { code: 'ABCDEF' } }))

    expect(screen.queryByRole('button', { name: 'Account menu' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })
})

describe('AppHeader · getting around', () => {
  it('marks the screen the person is on in Library · Rooms', () => {
    renderHeader()

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const library = within(nav).getByRole('link', { name: 'Library' })
    const rooms = within(nav).getByRole('link', { name: 'Rooms' })
    expect(library.getAttribute('aria-current')).toBe('page')
    expect(rooms.getAttribute('aria-current')).toBeNull()
    expect(rooms.getAttribute('href')).toBe('/rooms')
  })

  it('leads to the Lab after Rooms, marked as current inside it', () => {
    render(
      <I18nProvider initialLocale="en">
        <SessionContext.Provider value={fakeSession()}>
          <AppHeader current="lab" />
        </SessionContext.Provider>
      </I18nProvider>,
    )

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Library', 'Rooms', 'Lab'])
    expect(links[2].getAttribute('href')).toBe('/lab/ranges')
    expect(links[2].getAttribute('aria-current')).toBe('page')
    expect(links[0].getAttribute('aria-current')).toBeNull()
  })

  it('leads the brand to the Library', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'Runout, go to your library' }).getAttribute('href')).toBe('/library')
  })

  it('opens Rooms from "New room"', async () => {
    window.history.pushState(null, '', '/library')
    renderHeader()

    await userEvent.click(screen.getByRole('button', { name: 'New room' }))

    expect(window.location.pathname).toBe('/rooms')
  })

  it('offers an anonymous Participant neither the sections nor a new Room', () => {
    renderHeader(fakeSession({ account: null, room: { code: 'ABCDEF' } }))

    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New room' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Runout, go to the start' }).getAttribute('href')).toBe('/')
  })
})
