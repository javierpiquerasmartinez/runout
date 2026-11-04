import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../backend/api'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import type { Identity } from '../identity/identity'
import { DEFAULT_PREFERENCES } from '../preferences/preferences'
import { fakeSession } from '../test/fakeSession'
import { fakeApi, refusal } from '../test/fakeApi'
import { fakeGoogleIdentity } from '../test/fakeGoogle'
import { SettingsPage } from './SettingsPage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function renderSettings(
  identity: Partial<Identity> = {},
  signOut: () => Promise<void> = async () => {},
  changePreferences: () => Promise<void> = async () => {},
) {
  const session = fakeSession(identity, { signOut: vi.fn(signOut), changePreferences: vi.fn(changePreferences) })
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <SettingsPage />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return session
}

describe('SettingsPage · the Account', () => {
  it('shows the Account signed in, and signs out of it', async () => {
    const session = renderSettings()

    expect(screen.getByText('Signed in as javier@example.com')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(session.signOut).toHaveBeenCalledOnce()
  })

  it('says so when signing out fails', async () => {
    renderSettings({}, async () => {
      throw new ApiError(0, 'network')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    const alert = await screen.findByText("Couldn't sign out. We couldn't reach the server. Try again.")
    expect(alert.getAttribute('role')).toBe('alert')
  })

  it('offers to sign in with Google to someone without an Account', async () => {
    fakeGoogleIdentity('id-token-from-google')
    const session = renderSettings({ account: null })

    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    expect(session.signIn).toHaveBeenCalledWith('id-token-from-google', false)
  })
})

describe('SettingsPage · Graph Colours', () => {
  it('shows each Results Graph line on its colour, the board’s by default', () => {
    renderSettings()

    const card = screen.getByRole('region', { name: 'Results graph' })
    expect(within(card).getByRole('radiogroup', { name: 'Result' })).toBeTruthy()
    expect(within(card).getByRole('radio', { name: 'Result: Teal' }).getAttribute('aria-checked')).toBe('true')
    expect(within(card).getByRole('radio', { name: 'All-in EV: Amber' }).getAttribute('aria-checked')).toBe('true')
    expect(within(card).getByRole('radio', { name: 'Showdown: Blue' }).getAttribute('aria-checked')).toBe('true')
    expect(within(card).getByRole('radio', { name: 'Non-showdown: Red' }).getAttribute('aria-checked')).toBe('true')
    expect(within(card).getAllByRole('radio')).toHaveLength(4 * 8)
  })

  it('gives a line any colour of the palette, even one another line already has', async () => {
    const session = renderSettings()

    await userEvent.click(screen.getByRole('radio', { name: 'Non-showdown: Teal' }))

    expect(session.changePreferences).toHaveBeenCalledWith({ nonShowdownColour: 'teal' })
  })

  it('puts every line back on its default colour', async () => {
    const session = renderSettings({
      preferences: { ...DEFAULT_PREFERENCES, resultColour: 'violet', showdownColour: 'lime' },
    })

    expect(screen.getByRole('radio', { name: 'Result: Violet' }).getAttribute('aria-checked')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Restore colours' }))

    expect(session.changePreferences).toHaveBeenCalledWith({
      resultColour: 'teal',
      allInEvColour: 'amber',
      showdownColour: 'blue',
      nonShowdownColour: 'red',
    })
  })

  it('says so when a colour can’t be saved', async () => {
    renderSettings({}, undefined, async () => {
      throw new ApiError(0, 'network')
    })

    await userEvent.click(screen.getByRole('radio', { name: 'Result: Pink' }))

    const card = screen.getByRole('region', { name: 'Results graph' })
    expect((await within(card).findByRole('alert')).textContent).toContain("We couldn't reach the server")
  })
})

describe('SettingsPage · Access', () => {
  it('shows how a Google-only Account signs in, and adds a password', async () => {
    const calls = fakeApi({
      'POST /password-checks': () => Response.json({ problem: null }),
      'POST /identities/me/password': () =>
        Response.json(
          { account: { email: 'javier@example.com', signInMethods: ['google', 'password'] } },
          { status: 201 },
        ),
    })
    const session = renderSettings({ account: { email: 'javier@example.com', signInMethods: ['google'] } })

    expect(screen.getByText('You sign in with: Google')).toBeTruthy()
    expect(screen.queryByLabelText('Current password')).toBeNull()
    await userEvent.type(screen.getByLabelText('Password'), 'a long passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Add password' }))

    expect(await screen.findByText('Password added: you can now sign in with your email too.')).toBeTruthy()
    expect(calls.find((call) => call.path === '/identities/me/password')).toMatchObject({
      method: 'POST',
      body: { password: 'a long passphrase' },
    })
    expect(session.rememberAccount).toHaveBeenCalledWith({
      email: 'javier@example.com',
      signInMethods: ['google', 'password'],
    })
  })

  it('changes the password of an Account that has one, given the current one', async () => {
    const calls = fakeApi({
      'POST /password-checks': () => Response.json({ problem: null }),
      'PUT /identities/me/password': () =>
        Response.json({ account: { email: 'javier@example.com', signInMethods: ['password'] } }),
    })
    renderSettings({ account: { email: 'javier@example.com', signInMethods: ['password'] } })

    expect(screen.getByText('You sign in with: Password')).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Current password'), 'the old passphrase')
    await userEvent.type(screen.getByLabelText('New password'), 'a brand new passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Password changed. Your other sessions were signed out.')).toBeTruthy()
    expect(calls.find((call) => call.path === '/identities/me/password')?.body).toEqual({
      currentPassword: 'the old passphrase',
      password: 'a brand new passphrase',
    })
  })

  it('says when the current password is wrong', async () => {
    fakeApi({
      'POST /password-checks': () => Response.json({ problem: null }),
      'PUT /identities/me/password': () => refusal(401, 'invalid-credentials'),
    })
    renderSettings({ account: { email: 'javier@example.com', signInMethods: ['google', 'password'] } })

    expect(screen.getByText('You sign in with: Google · Password')).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Current password'), 'not it at all')
    await userEvent.type(screen.getByLabelText('New password'), 'a brand new passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Email or password incorrect.')).toBeTruthy()
  })

  it('is locked while impersonating', async () => {
    const calls = fakeApi({ 'POST /password-checks': () => Response.json({ problem: null }) })
    renderSettings({
      impersonation: { administrator: { displayName: 'Admin', email: 'admin@x.com' }, endsAt: '2099-01-01T00:00:00Z' },
    })

    await userEvent.click(screen.getByRole('button', { name: /Add password/ }))

    expect(screen.getByRole('button', { name: /Add password/ }).getAttribute('aria-disabled')).toBe('true')
    expect(calls.some((call) => call.path === '/identities/me/password')).toBe(false)
  })
})
