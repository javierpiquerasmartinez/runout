import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { fakeSession } from '../test/fakeSession'
import { SessionContext } from './context'
import { ImpersonationBanner } from './ImpersonationBanner'

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const impersonation = { administrator: { displayName: 'Javier', email: 'javier@x.com' }, endsAt: '2099-01-01T00:00:00Z' }

function renderBanner(session = fakeSession({ displayName: 'Ana', impersonation })) {
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <ImpersonationBanner />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return session
}

describe('ImpersonationBanner', () => {
  it('says whose Account this is, and "Leave" brings the Administrator back to the panel', async () => {
    const session = renderBanner()

    expect(screen.getByRole('status').textContent).toMatch(/^Impersonating Ana/)
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))

    expect(session.stopImpersonating).toHaveBeenCalledOnce()
    await waitFor(() => expect(window.location.pathname).toBe('/admin/accounts'))
  })

  it('is not there for the Account’s owner', () => {
    renderBanner(fakeSession({ impersonation: null }))

    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('An Impersonation running out', () => {
  // `loadSession` keeps its answer for the page's life: fresh modules for it.
  it('falls back to the Administrator’s own Sign-in kept aside', async () => {
    vi.resetModules()
    const stored = new Map([
      ['runout.identityToken', 'impersonation-token'],
      ['runout.administratorToken', 'admin-token'],
    ])
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    } as unknown as Storage
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const token = (init.headers as Record<string, string>).Authorization
        if (token === 'Bearer admin-token') {
          return Response.json({ id: 'admin', displayName: 'Javier', administrator: true, preferences: {} })
        }
        return Response.json({ reason: 'unauthenticated' }, { status: 401 })
      }),
    )
    const { loadSession } = await import('./identity')

    const session = await act(() => loadSession(storage))

    expect(session).toMatchObject({ token: 'admin-token', identity: { id: 'admin', administrator: true } })
    expect(stored.get('runout.identityToken')).toBe('admin-token')
    expect(stored.has('runout.administratorToken')).toBe(false)
  })
})
