import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { fakeSession } from '../test/fakeSession'
import { FirstDisplayName } from './ChooseDisplayName'
import { SessionContext } from './context'
import type { Identity } from './identity'

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderGate(identity: Partial<Identity>) {
  const session = fakeSession(identity)
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <FirstDisplayName>
          <p>The screen asked for</p>
        </FirstDisplayName>
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return session
}

describe('FirstDisplayName', () => {
  it('asks a first-time Account for its Display Name before anything else, and keeps it', async () => {
    const saved = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({ id: 'me', displayName: JSON.parse(String(init?.body)).displayName.trim() }),
    )
    vi.stubGlobal('fetch', saved)
    const session = renderGate({ displayName: null })

    expect(screen.queryByText('The screen asked for')).toBeNull()
    await userEvent.type(screen.getByLabelText('What should the group call you?'), ' Javi ')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(session.rememberDisplayName).toHaveBeenCalledWith('Javi'))
    expect(saved).toHaveBeenCalledWith(
      '/api/identities/me/display-name',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('says why a name was refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reason: 'invalid-display-name' }, { status: 400 })))
    renderGate({ displayName: null })

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Enter a name of 1 to 40 characters.')).toBeTruthy()
  })

  it('lets an Account that has a Display Name straight through', () => {
    renderGate({ displayName: 'Javier' })

    expect(screen.getByText('The screen asked for')).toBeTruthy()
  })

  it('lets an anonymous identity through: it chooses its name at the Room door', () => {
    renderGate({ displayName: null, account: null })

    expect(screen.getByText('The screen asked for')).toBeTruthy()
  })
})
