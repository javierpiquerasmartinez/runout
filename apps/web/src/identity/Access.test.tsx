import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { CompleteResetPage, RequestResetPage } from './ResetPasswordPages'
import { LoginPage } from '../landing/LoginPage'
import { fakeApi, refusal } from '../test/fakeApi'
import { fakeSession, fakeVisitor } from '../test/fakeSession'
import { fakeGoogleIdentity } from '../test/fakeGoogle'
import { SessionContext, type SessionContextValue } from './context'
import { InvitationPage } from './InvitationPage'
import { ApiError } from '../backend/api'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.history.replaceState(null, '', '/')
})

function renderWith(session: SessionContextValue, ui: React.ReactNode) {
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>{ui}</SessionContext.Provider>
    </I18nProvider>,
  )
}

const signedIn = { token: 'new-token', identity: { id: 'ana', displayName: null, account: { email: 'ana@x.com' } } }

describe('signing in with a password', () => {
  it('says Runout is invitation-only and signs in with the email and password typed', async () => {
    fakeApi({})
    const session = fakeVisitor()
    renderWith(session, <LoginPage />)

    expect(screen.getByText(/Runout is invitation-only/)).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Email'), 'ana@x.com')
    await userEvent.type(screen.getByLabelText('Password'), 'my long passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(session.signInWithPassword).toHaveBeenCalledWith('ana@x.com', 'my long passphrase')
  })

  it('gives the same answer for a wrong password or an unknown email', async () => {
    fakeApi({})
    renderWith(
      fakeVisitor({
        signInWithPassword: vi.fn(async () => {
          throw new ApiError(401, 'invalid-credentials')
        }),
      }),
      <LoginPage />,
    )

    await userEvent.type(screen.getByLabelText('Email'), 'ana@x.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Email or password incorrect.')
  })

  it('says how long to wait after too many attempts', async () => {
    fakeApi({})
    const retryAt = new Date(Date.now() + 5 * 60_000 + 500).toISOString()
    renderWith(
      fakeVisitor({
        signInWithPassword: vi.fn(async () => {
          throw new ApiError(429, 'too-many-attempts', { retryAt })
        }),
      }),
      <LoginPage />,
    )

    await userEvent.type(screen.getByLabelText('Email'), 'ana@x.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Too many attempts. Try again in 5 minutes.')
  })

  it('says when the access is suspended', async () => {
    fakeApi({})
    renderWith(
      fakeVisitor({
        signInWithPassword: vi.fn(async () => {
          throw new ApiError(403, 'account-suspended')
        }),
      }),
      <LoginPage />,
    )

    await userEvent.type(screen.getByLabelText('Email'), 'ana@x.com')
    await userEvent.type(screen.getByLabelText('Password'), 'whatever it is')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/Your access is suspended/)
  })

  it('explains that Google needs an invitation when it has none', async () => {
    fakeApi({})
    fakeGoogleIdentity('id-token')
    renderWith(
      fakeVisitor({
        signIn: vi.fn(async () => {
          throw new ApiError(403, 'invitation-required')
        }),
      }),
      <LoginPage />,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/Runout is invitation-only: that email has no account/)
  })
})

describe('the Invitation page', () => {
  function invitation(status: string) {
    return fakeApi({
      'GET /invitations/tok': () => Response.json({ email: 'ana@x.com', status }),
      'POST /password-checks': (call) =>
        Response.json({ problem: (call.body as { password: string }).password === 'passwordpassword' ? 'common' : null }),
      'POST /invitations/tok/password': () => Response.json(signedIn, { status: 201 }),
      'POST /invitations/tok/google': () =>
        refusal(403, 'invitation-email-mismatch', { email: 'ana@x.com' }),
    })
  }

  it('shows the invited email and creates the Account with a password', async () => {
    const calls = invitation('pending')
    const session = fakeVisitor()
    renderWith(session, <InvitationPage token="tok" />)

    expect(await screen.findByText('ana@x.com')).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Choose a password'), 'a long passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Create password' }))

    await waitFor(() => expect(session.adopt).toHaveBeenCalledWith(signedIn))
    expect(calls.find((call) => call.path === '/invitations/tok/password')?.body).toEqual({
      password: 'a long passphrase',
    })
  })

  it('shows the password rules while typing', async () => {
    invitation('pending')
    renderWith(fakeVisitor(), <InvitationPage token="tok" />)
    const field = await screen.findByLabelText('Choose a password')

    const length = screen.getByText('At least 12 characters')
    expect(length.hasAttribute('data-met')).toBe(false)
    await userEvent.type(field, 'passwordpassword')

    expect(length.hasAttribute('data-met')).toBe(true)
    expect(await screen.findByText("It's one of the most common passwords: pick another")).toBeTruthy()
    await userEvent.clear(field)
    await userEvent.type(field, 'with spaces it is fine')
    await waitFor(() => expect(screen.getByText('Not one of the most common passwords').hasAttribute('data-met')).toBe(true))
  })

  it('says which email was invited when Google brings another one', async () => {
    invitation('pending')
    fakeGoogleIdentity('google-of-bea')
    renderWith(fakeVisitor(), <InvitationPage token="tok" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      "Your Google account isn't the invited email. This invitation is for ana@x.com: sign in with that Google account.",
    )
  })

  it.each([
    ['expired', 'This invitation has expired: they last 7 days.'],
    ['cancelled', 'This invitation was cancelled.'],
    ['accepted', 'This invitation has already been used.'],
  ])('says when it is %s, and to ask for a new one', async (status, message) => {
    invitation(status)
    renderWith(fakeVisitor(), <InvitationPage token="tok" />)

    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(screen.getByText('Ask whoever invited you for a new one.')).toBeTruthy()
    expect(screen.queryByLabelText('Choose a password')).toBeNull()
  })

  it('says when the link is unknown', async () => {
    fakeApi({ 'GET /invitations/tok': () => refusal(404, 'invitation-not-found') })
    renderWith(fakeVisitor(), <InvitationPage token="tok" />)

    expect((await screen.findByRole('alert')).textContent).toBe("This invitation link doesn't exist.")
  })

  it('sends its own Account on to Home', async () => {
    invitation('accepted')
    window.history.replaceState(null, '', '/invitation/tok')
    renderWith(fakeSession({ account: { email: 'ana@x.com', signInMethods: ['password'] } }), <InvitationPage token="tok" />)

    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('tells someone signed in as another Account whose it is, and offers to sign out', async () => {
    invitation('pending')
    const session = fakeSession({ account: { email: 'bea@x.com' } })
    renderWith(session, <InvitationPage token="tok" />)

    expect((await screen.findByRole('alert')).textContent).toBe(
      "This invitation is for ana@x.com. You're signed in with another account.",
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out and continue' }))
    expect(session.signOut).toHaveBeenCalledOnce()
  })
})

describe('resetting a password', () => {
  it('answers the same whatever the email', async () => {
    const calls = fakeApi({ 'POST /password-resets': () => Response.json({ accepted: true }, { status: 202 }) })
    renderWith(fakeVisitor(), <RequestResetPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'ana@x.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send link' }))

    expect((await screen.findByRole('status')).textContent).toBe(
      'If that email has an account, we sent it a link. It works once, for one hour.',
    )
    expect(calls.at(-1)?.body).toEqual({ email: 'ana@x.com' })
  })

  it('sets the new password and signs this browser in', async () => {
    fakeApi({
      'POST /password-checks': () => Response.json({ problem: null }),
      'POST /password-resets/tok': () => Response.json(signedIn, { status: 201 }),
    })
    const session = fakeVisitor()
    renderWith(session, <CompleteResetPage token="tok" />)

    await userEvent.type(screen.getByLabelText('New password'), 'a brand new passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Save and sign in' }))

    await waitFor(() => expect(session.adopt).toHaveBeenCalledWith(signedIn))
  })

  it.each([
    ['reset-expired', 'This link has expired: they last one hour. Ask for another one.'],
    ['reset-used', 'This link has already been used. Ask for another one if you need it.'],
  ])('says why a link no longer works: %s', async (reason, message) => {
    fakeApi({
      'POST /password-checks': () => Response.json({ problem: null }),
      'POST /password-resets/tok': () => refusal(410, reason),
    })
    renderWith(fakeVisitor(), <CompleteResetPage token="tok" />)

    await userEvent.type(screen.getByLabelText('New password'), 'a brand new passphrase')
    await userEvent.click(screen.getByRole('button', { name: 'Save and sign in' }))

    expect((await screen.findByRole('alert')).textContent).toBe(message)
  })
})
