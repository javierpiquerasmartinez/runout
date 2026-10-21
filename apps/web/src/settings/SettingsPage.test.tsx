import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../backend/api'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import type { Identity } from '../identity/identity'
import { fakeSession } from '../test/fakeSession'
import { fakeGoogleIdentity } from '../test/fakeGoogle'
import { SettingsPage } from './SettingsPage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function renderSettings(identity: Partial<Identity> = {}, signOut: () => Promise<void> = async () => {}) {
  const session = fakeSession(identity, { signOut: vi.fn(signOut) })
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
  it('shows the Google account signed in, and signs out of it', async () => {
    const session = renderSettings()

    expect(screen.getByText('Signed in with Google as javier@example.com')).toBeTruthy()
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
