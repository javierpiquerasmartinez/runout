import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `loadSession` keeps its answer for the page's life: each test gets fresh modules.
async function renderProvider() {
  const { I18nProvider } = await import('../i18n')
  const { SessionProvider } = await import('./SessionProvider')
  render(
    <I18nProvider initialLocale="en">
      <SessionProvider>
        <p>The app</p>
      </SessionProvider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  const stored = new Map([['runout.identityToken', 'token']])
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null } as Partial<Storage>)
  // A server waking up: it holds every request. The language is the default preferences', Spanish.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SessionProvider while the server wakes up', () => {
  it('shows nothing at first, so a quick answer doesn’t flash a loader', async () => {
    await renderProvider()

    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(document.body.textContent).toBe('')
  })

  it('shows a loader after a moment, and says it is reaching the server once it takes a while', async () => {
    await renderProvider()

    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(screen.getByRole('progressbar', { name: 'Cargando' })).toBeTruthy()
    expect(screen.queryByText('Conectando con el servidor…')).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(4700))
    expect(screen.getByText('Conectando con el servidor…')).toBeTruthy()
  })
})

describe('SessionProvider with a server from before a Preference existed', () => {
  // The web can go live before the server that knows a new Preference: what it doesn't send reads as its default.
  it('reads any Preference the server leaves out as its default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          id: 'me',
          displayName: 'Javier',
          screenNames: [],
          preferences: { deckStyle: 'full-suit', fourColour: true, potPercentage: false, displayUnit: 'both', theme: 'dark', language: 'en' },
          account: { email: 'javier@example.com' },
          room: null,
        }),
      ),
    )
    const { I18nProvider } = await import('../i18n')
    const { SessionProvider } = await import('./SessionProvider')
    const { usePreferences } = await import('../preferences/context')
    const { useIdentity } = await import('./context')
    function Reader() {
      const preferences = usePreferences()
      const { identity } = useIdentity()
      return (
        <p>
          {preferences.deckStyle} {preferences.resultColour} {preferences.nonShowdownColour} {identity?.preferences.allInEvColour}
        </p>
      )
    }
    render(
      <I18nProvider initialLocale="en">
        <SessionProvider>
          <Reader />
        </SessionProvider>
      </I18nProvider>,
    )

    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(screen.getByText('full-suit teal red amber')).toBeTruthy()
  })
})
