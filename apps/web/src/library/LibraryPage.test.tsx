import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { fakeSession } from '../test/fakeSession'
import type { LibraryHand, LibraryPage as Page } from './library'
import { LibraryPage } from './LibraryPage'

const libraryHand = (id: string, overrides: Partial<LibraryHand> = {}): LibraryHand => ({
  id,
  site: 'pokerstars',
  siteHandId: `site-${id}`,
  hero: 'iMapleAA',
  holeCards: ['Js', '8s'],
  playedAt: '2026-09-18T12:34:30.000Z',
  stake: { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
  summary: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river', showdown: true },
  ...overrides,
})

let pages: Record<string, Page>
let requests: string[]

beforeEach(() => {
  requests = []
  pages = {
    '1': { total: 3, page: 1, pageSize: 2, hands: [libraryHand('h1'), libraryHand('h2', { hero: 'Hero', site: 'coinpoker' })] },
    '2': { total: 3, page: 2, pageSize: 2, hands: [libraryHand('h3', { summary: { positions: ['CO', 'SB'], finalPot: 30, finalStreet: 'flop', showdown: false } })] },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requests.push(url)
      const page = new URL(url, 'http://localhost').searchParams.get('page') ?? '1'
      return Response.json(pages[page])
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.pushState(null, '', '/')
})

function renderLibrary() {
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={fakeSession()}>
        <LibraryPage />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

describe('LibraryPage', () => {
  it('lists the Library’s Hands as the server orders them, with the total', async () => {
    renderLibrary()

    const table = await screen.findByRole('table', { name: 'All hands' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('BTN vs BB')).toBeTruthy()
    expect(within(rows[0]).getByText('iMapleAA')).toBeTruthy()
    expect(within(rows[0]).getByText('NL10')).toBeTruthy()
    expect(within(rows[0]).getByText('SHOWDOWN')).toBeTruthy()
    expect(within(rows[1]).getByText('Hero')).toBeTruthy()
    expect(within(rows[1]).getByText('CoinPoker')).toBeTruthy()
    expect(screen.getByText('3 hands')).toBeTruthy()
    expect(within(table).queryByText('Author')).toBeNull()
    expect(requests[0]).toBe('/api/library/hands?page=1&pageSize=50')
  })

  it('moves between pages the server cuts', async () => {
    pages['1'] = { ...pages['1'], pageSize: 2 }
    renderLibrary()
    expect(await screen.findByText('Showing 1–2 of 3')).toBeTruthy()
    expect(screen.getByText('1 / 2')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByText('Showing 3–3 of 3')).toBeTruthy()
    expect(screen.getByText('CO vs SB')).toBeTruthy()
    expect(requests.at(-1)).toBe('/api/library/hands?page=2&pageSize=50')
    expect(screen.getByRole('button', { name: /^Next page/ }).getAttribute('aria-disabled')).toBe('true')
  })

  it('opens a Hand to replay it', async () => {
    renderLibrary()

    await userEvent.click(await screen.findByRole('link', { name: 'Open BTN vs BB, iMapleAA' }))

    expect(window.location.pathname).toBe('/library/hands/h1')
  })

  it('invites to import when the Library is empty', async () => {
    pages['1'] = { total: 0, page: 1, pageSize: 50, hands: [] }
    renderLibrary()

    expect(await screen.findByText('Your library is empty. Import your hand histories to keep them here.')).toBeTruthy()
    await userEvent.click(screen.getAllByRole('button', { name: 'Import hands' })[0])

    expect(screen.getByRole('heading', { name: 'Import hands into your library' })).toBeTruthy()
  })
})
