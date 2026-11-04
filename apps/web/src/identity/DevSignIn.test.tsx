import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeVisitor } from '../test/fakeSession'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

/** Renders the sign-in button the way it is built with `VITE_DEV_SIGN_IN` as given. */
async function renderSignIn(devSignIn: string | undefined) {
  vi.resetModules()
  vi.stubEnv('VITE_DEV_SIGN_IN', devSignIn)
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
  // Imported after stubbing, as the flag is read once, when the module loads.
  const { I18nProvider } = await import('../i18n')
  const { SessionContext } = await import('./context')
  const { GoogleSignInButton } = await import('./GoogleSignInButton')
  const session = fakeVisitor()
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <GoogleSignInButton />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return session
}

describe('Test mode', () => {
  it('signs in as a fixed test persona when VITE_DEV_SIGN_IN is true', async () => {
    const session = await renderSignIn('true')
    expect(screen.getByRole('group', { name: 'Test mode' })).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Tester B' }))

    expect(session.signIn).toHaveBeenCalledWith('dev-sign-in|tester-b', false)
  })

  it('is not there by default', async () => {
    await renderSignIn(undefined)
    expect(screen.queryByRole('group', { name: 'Test mode' })).toBeNull()
  })
})
