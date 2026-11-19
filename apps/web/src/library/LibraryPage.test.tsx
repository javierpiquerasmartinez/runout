import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import type { Identity } from '../identity/identity'
import { PreferencesContext } from '../preferences/context'
import { DEFAULT_PREFERENCES, type Preferences } from '../preferences/preferences'
import { fakeSession } from '../test/fakeSession'
import { libraryOpenedFrom, type LibraryHand, type LibraryPage as Page } from './library'
import { LibraryPage } from './LibraryPage'
import type { Results } from './results'
import { STAT_KEYS, type LibraryStats } from './stats'
import { BULK_IMPORTS_POLL_MS, type BulkImport } from './bulkImports'
import type { SavedFilter } from './savedFilters'

const libraryHand = (id: string, overrides: Partial<LibraryHand> = {}): LibraryHand => ({
  id,
  site: 'pokerstars',
  siteHandId: `site-${id}`,
  hero: 'iMapleAA',
  holeCards: ['Js', '8s'],
  playedAt: '2026-09-18T12:34:30.000Z',
  stake: { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
  result: 49,
  marked: false,
  tags: [],
  overview: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river', showdown: true },
  hasHistory: true,
  ...overrides,
})

const options: Page['options'] = {
  sites: ['coinpoker', 'pokerstars'],
  heroes: ['Hero', 'iMapleAA'],
  stakes: [
    { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
    { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'USDT' },
    { limit: 'no-limit', smallBlind: 25, bigBlind: 50, currency: 'EUR' },
  ],
  tags: [
    { id: 't1', name: 'All-in', hands: 1 },
    { id: 't2', name: 'Multiway', hands: 2 },
  ],
}

const libraryPage = (page: Omit<Page, 'options' | 'counts'>): Page => ({
  ...page,
  options,
  counts: { all: 3, marked: 1 },
})

let pages: Record<string, Page>
/** List reads, as `/api/library/hands?page=1&pageSize=50`. */
let requests: string[]
let results: Results
/** Results Graph reads, as `/api/library/results?site=pokerstars`. */
let resultsRequests: string[]
let stats: LibraryStats
/** Stats reads, as `/api/library/stats?site=pokerstars`. */
let statsRequests: string[]
/** What the server answers a Stats read with, unless the test says otherwise. */
let statsReply: () => Response | Promise<Response>
/** Mark changes, as `PUT /api/library/hands/h1/mark`. */
/** Every list of Hand ids asked for, to replay them. */
let handIdsRequests: string[]
let markRequests: string[]
/** Tag changes, as `PUT /api/library/tags/t1/hands {"handIds":["h1"]}`. */
let tagRequests: string[]
/** What the server answers a Tag change with, unless the test says otherwise. */
let tagReply: () => Response
/** Removals, as `DELETE /api/library/hands {"handIds":["h1"]}`. */
let removeRequests: string[]
/** What the server answers a removal with, unless the test says otherwise. */
let removeReply: () => Response
/** Copies, as `/api/hands/h1/copy?as=summary&language=en&timeZone=UTC`. */
let copyRequests: string[]
/** Hands added to a Room, as `POST /api/rooms/RNT4K9PX/library-hands {"handIds":["h1"]}`. */
let addRequests: string[]
/** What the server answers adding to a Room with, unless the test says otherwise. */
let addReply: () => Response
/** The Account's Bulk Imports, as the server lists them. */
let bulkImports: BulkImport[]
/** Changes to Bulk Imports, as `POST /api/library/bulk-imports/b1/cancel`. */
let bulkImportRequests: string[]
/** The Account's Saved Filters, as the server lists them. */
let savedFilters: SavedFilter[]
/** Changes to Saved Filters, as `POST /api/library/saved-filters {"name":"…","criteria":{…}}`. */
let savedFilterRequests: string[]
/** What the server answers saving a filter with, unless the test says otherwise. */
let saveFilterReply: (body: { name: string; criteria: SavedFilter['criteria'] }) => Response

const runningImport = (overrides: Partial<BulkImport> = {}): BulkImport => ({
  id: 'b1',
  status: 'running',
  files: [{ name: 'pt4-export.zip', size: 1000 }],
  total: 1240000,
  processed: 412000,
  imported: 400000,
  duplicates: 12000,
  notImported: {},
  reason: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  finishedAt: null,
  ...overrides,
})

beforeEach(() => {
  bulkImports = [runningImport()]
  bulkImportRequests = []
  savedFilters = [
    { id: 'sf1', name: '3-bet OOP como caller', criteria: { facts: ['pot-type:3-bet', '!hero-position:BTN,CO'], stat: null }, dropped: 0 },
    { id: 'sf2', name: 'BTN vs BB', criteria: { facts: ['hero-position:BTN'], stat: 'vpip:taken' }, dropped: 0 },
  ]
  savedFilterRequests = []
  saveFilterReply = ({ name, criteria }) => {
    const saved = { id: 'sf3', name, criteria, dropped: 0 }
    savedFilters = [...savedFilters, saved]
    return Response.json(saved, { status: 201 })
  }
  requests = []
  resultsRequests = []
  statsRequests = []
  stats = {
    hands: 3,
    stats: {
      ...Object.fromEntries(STAT_KEYS.map((key) => [key, { opportunities: 0, taken: 0 }])),
      vpip: { opportunities: 3, taken: 1 },
      pfr: { opportunities: 2, taken: 1 },
    } as LibraryStats['stats'],
    handsWith: {
      ...Object.fromEntries(STAT_KEYS.map((key) => [key, { opportunity: 0, taken: 0 }])),
      vpip: { opportunity: 3, taken: 1 },
      pfr: { opportunity: 2, taken: 1 },
    } as LibraryStats['handsWith'],
  }
  statsReply = () => Response.json(stats)
  markRequests = []
  handIdsRequests = []
  tagRequests = []
  tagReply = () => Response.json({})
  removeRequests = []
  removeReply = () => Response.json({})
  addRequests = []
  copyRequests = []
  addReply = () => Response.json({ added: 2 }, { status: 201 })
  results = {
    hands: 3,
    currency: 'EUR',
    totals: { bigBlinds: { result: 3.9, allInEv: 2.5, showdown: 4.9, nonShowdown: -1 }, amounts: { result: 39, allInEv: 25, showdown: 49, nonShowdown: -10 } },
    start: { bigBlinds: { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 }, amounts: { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 } },
    zoom: null,
    rakeGenerated: { bigBlinds: 1.2, amounts: 12 },
    points: [{ hand: 3, handId: 'hand-3', holeCards: ['4s', '10c'], bigBlinds: { result: 3.9, allInEv: 2.5, showdown: 4.9, nonShowdown: -1 }, amounts: { result: 39, allInEv: 25, showdown: 49, nonShowdown: -10 } }],
  }
  pages = {
    '1': libraryPage({ total: 3, page: 1, pageSize: 2, hands: [libraryHand('h1', { tags: [{ id: 't1', name: 'All-in' }, { id: 't2', name: 'Multiway' }] }), libraryHand('h2', { hero: 'Hero', site: 'coinpoker', result: -10 })] }),
    '2': libraryPage({ total: 3, page: 2, pageSize: 2, hands: [libraryHand('h3', { overview: { positions: ['CO', 'SB'], finalPot: 30, finalStreet: 'flop', showdown: false } })] }),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url.startsWith('/api/hands/')) {
        copyRequests.push(url)
        const text = url.includes('as=history') ? 'PokerStars Hand #1' : 'NL10 · Hero BTN'
        return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      if (url.startsWith('/api/library/saved-filters')) {
        if (method === 'GET') return Response.json(savedFilters)
        savedFilterRequests.push(`${method} ${url}${init?.body ? ` ${String(init.body)}` : ''}`)
        if (method === 'POST') return saveFilterReply(JSON.parse(String(init?.body)))
        const id = url.split('/')[4]
        if (method === 'DELETE') {
          savedFilters = savedFilters.filter((saved) => saved.id !== id)
          return new Response(null, { status: 204 })
        }
        const body = JSON.parse(String(init?.body)) as Partial<Pick<SavedFilter, 'name' | 'criteria'>>
        // As the server does, ignoring case.
        if (savedFilters.some((saved) => saved.id !== id && saved.name.toLowerCase() === body.name?.toLowerCase()))
          return Response.json({ reason: 'saved-filter-name-taken' }, { status: 409 })
        savedFilters = savedFilters.map((saved) => (saved.id === id ? { ...saved, ...body, dropped: 0 } : saved))
        return Response.json(savedFilters.find((saved) => saved.id === id))
      }
      if (url.startsWith('/api/library/tags')) {
        tagRequests.push(`${method} ${url}${init?.body ? ` ${String(init.body)}` : ''}`)
        return tagReply()
      }
      if (url.startsWith('/api/rooms/')) {
        addRequests.push(`${method} ${url} ${String(init?.body)}`)
        return addReply()
      }
      if (method === 'DELETE' && url === '/api/library/hands') {
        removeRequests.push(`${method} ${url} ${String(init?.body)}`)
        return removeReply()
      }
      if (url.startsWith('/api/library/bulk-imports')) {
        if (method === 'POST') {
          bulkImportRequests.push(`${method} ${url}`)
          const id = url.split('/').at(-2)
          bulkImports = bulkImports.map((bulkImport) =>
            bulkImport.id === id ? { ...bulkImport, status: 'cancelled', finishedAt: '2026-11-02T11:00:00.000Z' } : bulkImport,
          )
          return Response.json(bulkImports.find((bulkImport) => bulkImport.id === id), { status: 201 })
        }
        return Response.json(bulkImports)
      }
      if (method !== 'GET') {
        markRequests.push(`${method} ${url}`)
        const handId = url.split('/').at(-2)!
        const marked = method === 'PUT'
        for (const page of Object.values(pages)) {
          page.hands = page.hands.map((hand) => (hand.id === handId ? { ...hand, marked } : hand))
        }
        return Response.json({ handId, marked })
      }
      if (url.startsWith('/api/library/hand-ids')) {
        handIdsRequests.push(url)
        return Response.json({ ids: ['h1', 'h2', 'h3'] })
      }
      if (url.startsWith('/api/library/stats')) {
        statsRequests.push(url)
        return statsReply()
      }
      if (url.startsWith('/api/library/results')) {
        resultsRequests.push(url)
        // A Zoom asked for is the one answered, unclamped.
        const query = new URL(url, 'http://localhost').searchParams
        const zoom = query.has('zoomFrom') ? { from: Number(query.get('zoomFrom')), to: Number(query.get('zoomTo')) } : null
        return Response.json({ ...results, zoom })
      }
      requests.push(url)
      const page = new URL(url, 'http://localhost').searchParams.get('page') ?? '1'
      return Response.json(pages[page])
    }),
  )
})

/** The query of the last list read, without its paging; the Más filtros panel's count of Hands before its criteria is no list. */
function lastFilterQuery(): string {
  const lists = requests.filter((url) => !/pageSize=1(&|$)/.test(url))
  const query = new URL(lists.at(-1)!, 'http://localhost').searchParams
  query.delete('page')
  query.delete('pageSize')
  return query.toString()
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.pushState(null, '', '/')
})

/**
 * The Library at `path`, as `Routes` shows it there: its view and filter are
 * in the address. All time unless the test says otherwise, so every Hand of
 * the fake server is in it; a bare address is today's Hands.
 */
function renderLibrary(
  preferences: Preferences = DEFAULT_PREFERENCES,
  room?: { code: string; name: string },
  path = `${room ? `/room/${room.code}/library` : '/library'}?period=all`,
  identity: Partial<Identity> = {},
) {
  window.history.replaceState(null, '', path)
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={fakeSession(identity)}>
        <PreferencesContext.Provider value={preferences}>
          <LibraryPage room={room} />
        </PreferencesContext.Provider>
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

/** One of the filters bar's dropdowns, by its label. */
function filterButton(filters: HTMLElement, name: string) {
  return within(filters).getByRole('button', { name: new RegExp(`^${name} `) })
}

/** Picks an option of one of the filters bar's dropdowns. */
async function choose(filters: HTMLElement, name: string, option: string) {
  await userEvent.click(filterButton(filters, name))
  await userEvent.click(screen.getByRole('option', { name: option }))
}

/** What one of the filters bar's dropdowns reads, closed. */
function chosen(filters: HTMLElement, name: string) {
  return filterButton(filters, name).textContent?.slice(name.length)
}

/** The options one of the filters bar's dropdowns offers, closing it again. */
async function optionsOf(filters: HTMLElement, name: string) {
  await userEvent.click(filterButton(filters, name))
  const options = screen.getAllByRole('option').map((option) => option.textContent)
  await userEvent.keyboard('{Escape}')
  return options
}

describe('LibraryPage', () => {
  it('lists the Library’s Hands as the server orders them, with the total', async () => {
    renderLibrary()

    const table = await screen.findByRole('table', { name: 'All hands' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    // The positions name the row's controls, but are not shown: the cards say which Hand it is.
    expect(within(rows[0]).queryByText('BTN vs BB')).toBeNull()
    expect(within(rows[0]).getByRole('link', { name: 'Open BTN vs BB, iMapleAA' })).toBeTruthy()
    expect(within(rows[0]).getByText('iMapleAA')).toBeTruthy()
    expect(within(rows[0]).getByText('NL10')).toBeTruthy()
    expect(within(rows[0]).getByText('SHOWDOWN')).toBeTruthy()
    expect(within(rows[1]).getByText('Hero')).toBeTruthy()
    expect(within(rows[1]).getByText('CoinPoker')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'All hands' }).nextElementSibling?.textContent).toBe('3 hands')
    expect(within(table).queryByText('Author')).toBeNull()
    expect(requests[0]).toBe('/api/library/hands?page=1&pageSize=50')
  })

  it('shows each Hand’s Result in the Display Unit, signed', async () => {
    renderLibrary()

    const table = await screen.findByRole('table', { name: 'All hands' })
    expect(within(table).getByRole('columnheader', { name: 'Result' })).toBeTruthy()
    const [won, lost] = within(table).getAllByRole('row').slice(1)
    expect(within(won).getByText('+4.9 BB')).toBeTruthy()
    expect(within(lost).getByText('-1 BB')).toBeTruthy()
  })

  it('shows the Result as money when the Display Unit says so', async () => {
    renderLibrary({ ...DEFAULT_PREFERENCES, displayUnit: 'amount' })

    const table = await screen.findByRole('table', { name: 'All hands' })
    const [won, lost] = within(table).getAllByRole('row').slice(1)
    expect(within(won).getByText('+€0.49')).toBeTruthy()
    expect(within(lost).getByText('-€0.10')).toBeTruthy()
  })

  it('moves between pages the server cuts', async () => {
    pages['1'] = { ...pages['1'], pageSize: 2 }
    renderLibrary()
    expect(await screen.findByText('Showing 1–2 of 3')).toBeTruthy()
    expect(screen.getByText('1 / 2')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByText('Showing 3–3 of 3')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open CO vs SB, iMapleAA' })).toBeTruthy()
    expect(requests.at(-1)).toBe('/api/library/hands?page=2&pageSize=50')
    expect(screen.getByRole('button', { name: /^Next page/ }).getAttribute('aria-disabled')).toBe('true')
  })

  it('opens a Hand to replay it', async () => {
    renderLibrary()

    await userEvent.click(await screen.findByRole('link', { name: 'Open BTN vs BB, iMapleAA' }))

    expect(window.location.pathname).toBe('/library/hands/h1')
  })

  it('invites to import when the Library is empty', async () => {
    pages['1'] = { ...libraryPage({ total: 0, page: 1, pageSize: 50, hands: [] }), counts: { all: 0, marked: 0 } }
    renderLibrary()

    expect(await screen.findByText('Your library is empty. Import your hand histories to keep them here.')).toBeTruthy()
    await userEvent.click(screen.getAllByRole('button', { name: 'Import hands' })[0])

    expect(screen.getByRole('heading', { name: 'Import hands into your library' })).toBeTruthy()
  })

  it('offers to import from the title row, not from the side column', async () => {
    renderLibrary()
    const collections = await screen.findByRole('navigation', { name: 'Collections' })
    await screen.findByRole('table', { name: 'All hands' })

    expect(within(collections).queryByRole('button', { name: 'Import hands' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Import hands' }))

    expect(screen.getByRole('heading', { name: 'Import hands into your library' })).toBeTruthy()
  })

  describe('views', () => {
    it('switches between the Hands at /library and the Results Graph at /library/graph', async () => {
      renderLibrary()
      const view = await screen.findByRole('radiogroup', { name: 'View' })
      expect(await screen.findByRole('table', { name: 'All hands' })).toBeTruthy()
      expect(within(view).getByRole('radio', { name: 'Hands' }).getAttribute('aria-checked')).toBe('true')

      await userEvent.click(within(view).getByRole('radio', { name: 'Graph' }))

      expect(window.location.pathname).toBe('/library/graph')
      expect(await screen.findByRole('region', { name: 'Results' })).toBeTruthy()
      expect(screen.queryByRole('table', { name: 'All hands' })).toBeNull()
      expect(within(view).getByRole('radio', { name: 'Graph' }).getAttribute('aria-checked')).toBe('true')

      await userEvent.click(within(view).getByRole('radio', { name: 'Hands' }))

      expect(window.location.pathname).toBe('/library')
      expect(await screen.findByRole('table', { name: 'All hands' })).toBeTruthy()
      expect(screen.queryByRole('region', { name: 'Results' })).toBeNull()
    })

    it('switches to the Imports at /library/imports, leaving the filters out', async () => {
      renderLibrary()
      const view = await screen.findByRole('radiogroup', { name: 'View' })
      await screen.findByRole('table', { name: 'All hands' })

      await userEvent.click(within(view).getByRole('radio', { name: 'Imports' }))

      expect(window.location.pathname).toBe('/library/imports')
      const shown = await screen.findByRole('table', { name: 'Imports' })
      expect(within(shown).getByRole('row', { name: /pt4-export\.zip/ }).textContent).toContain('412,000 of 1,240,000')
      expect(screen.queryByRole('table', { name: 'All hands' })).toBeNull()
      expect(screen.queryByRole('group', { name: 'Filters' })).toBeNull()
    })

    it('switches to the Stats at /library/stats', async () => {
      renderLibrary()
      const view = await screen.findByRole('radiogroup', { name: 'View' })
      await screen.findByRole('table', { name: 'All hands' })
      expect(statsRequests).toEqual([])

      await userEvent.click(within(view).getByRole('radio', { name: 'Stats' }))

      expect(window.location.pathname).toBe('/library/stats')
      const shown = await screen.findByRole('region', { name: 'Stats' })
      expect(within(shown).getByText('3 hands')).toBeTruthy()
      expect(within(shown).getByRole('button', { name: 'VPIP 33.3%' })).toBeTruthy()
      expect(screen.queryByRole('table', { name: 'All hands' })).toBeNull()
      expect(screen.queryByRole('region', { name: 'Results' })).toBeNull()
      expect(within(view).getByRole('radio', { name: 'Stats' }).getAttribute('aria-checked')).toBe('true')

      await userEvent.click(within(view).getByRole('radio', { name: 'Graph' }))

      expect(window.location.pathname).toBe('/library/graph')
      expect(await screen.findByRole('region', { name: 'Results' })).toBeTruthy()
      expect(screen.queryByRole('region', { name: 'Stats' })).toBeNull()
    })

    it('keeps the filter when switching to the Stats and back', async () => {
      renderLibrary()
      const filters = await screen.findByRole('group', { name: 'Filters' })
      await choose(filters, 'Poker site', 'PokerStars')

      await userEvent.click(screen.getByRole('radio', { name: 'Stats' }))

      expect(window.location.search).toBe('?period=all&site=pokerstars')
      await waitFor(() => expect(statsRequests.at(-1)).toBe('/api/library/stats?site=pokerstars'))
      await choose(filters, 'Hero', 'iMapleAA')
      await waitFor(() => expect(statsRequests.at(-1)).toBe(`/api/library/stats?${lastFilterQuery()}`))
      expect(lastFilterQuery()).toBe('site=pokerstars&hero=iMapleAA')

      await userEvent.click(screen.getByRole('radio', { name: 'Hands' }))

      expect(window.location.pathname).toBe('/library')
      expect(window.location.search).toBe('?period=all&site=pokerstars&hero=iMapleAA')
      expect(chosen(filters, 'Hero')).toBe('iMapleAA')
    })

    it('says so when the Stats can’t be read', async () => {
      statsReply = () => Promise.reject(new TypeError('Failed to fetch'))
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/stats?period=all')

      expect((await screen.findByRole('alert')).textContent).toBe("We couldn't reach the server. Try again.")
      expect(screen.queryByRole('region', { name: 'Stats' })).toBeNull()
    })

    it('shows no Stats for an empty Library, inviting to import instead', async () => {
      pages['1'] = { ...libraryPage({ total: 0, page: 1, pageSize: 50, hands: [] }), counts: { all: 0, marked: 0 } }
      stats = { ...stats, hands: 0 }
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/stats?period=all')

      expect(await screen.findByText('Your library is empty. Import your hand histories to keep them here.')).toBeTruthy()
      await waitFor(() => expect(statsRequests).toHaveLength(1))
      expect(screen.queryByRole('region', { name: 'Stats' })).toBeNull()
    })

    it('shows no Stats when the filters match nothing, offering to clear them', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/stats?period=all')
      const filters = await screen.findByRole('group', { name: 'Filters' })
      await screen.findByRole('region', { name: 'Stats' })
      pages['1'] = { ...pages['1'], total: 0, hands: [] }
      stats = { ...stats, hands: 0 }

      await choose(filters, 'Hero', 'Hero')

      expect(await screen.findByText('No hands match these filters.')).toBeTruthy()
      expect(screen.queryByRole('region', { name: 'Stats' })).toBeNull()
      expect(screen.getAllByRole('button', { name: 'Clear filters' })).toHaveLength(2)
    })

    it('starts again from the first page when the address brings another filter', async () => {
      renderLibrary()
      await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
      await screen.findByText('Showing 3–3 of 3')

      act(() => {
        window.history.pushState(null, '', '/library?period=all&hero=Hero')
        window.dispatchEvent(new PopStateEvent('popstate'))
      })

      await waitFor(() => expect(lastFilterQuery()).toBe('hero=Hero'))
      expect(new URL(requests.at(-1)!, 'http://localhost').searchParams.get('page')).toBe('1')
    })

    it('keeps the filter when switching views', async () => {
      renderLibrary()
      const filters = await screen.findByRole('group', { name: 'Filters' })
      await choose(filters, 'Poker site', 'PokerStars')

      await userEvent.click(screen.getByRole('radio', { name: 'Graph' }))

      expect(window.location.pathname).toBe('/library/graph')
      expect(window.location.search).toBe('?period=all&site=pokerstars')
      await waitFor(() => expect(resultsRequests.at(-1)).toBe('/api/library/results?site=pokerstars'))
      expect(chosen(filters, 'Poker site')).toBe('PokerStars')
    })

    it.each(['/library', '/library/graph', '/library/stats'])('reads the filter back from the address at %s, as after a reload', async (path) => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, `${path}?period=all&hero=iMapleAA&marked=true&tag=t2`)

      const filters = await screen.findByRole('group', { name: 'Filters' })
      expect(lastFilterQuery()).toBe('hero=iMapleAA&marked=true&tag=t2')
      expect(chosen(filters, 'Hero')).toBe('iMapleAA')
      expect(screen.getByRole('heading', { name: 'Marked hands' })).toBeTruthy()
      expect(within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: /Multiway/ }).getAttribute('aria-pressed')).toBe('true')
    })
  })

  describe('from a Stat to its Hands', () => {
    it('opens the Hands behind a Stat from its tooltip, keeping every other filter', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/stats?period=all&site=pokerstars&marked=true')
      const shown = await screen.findByRole('region', { name: 'Stats' })

      await userEvent.hover(within(shown).getByRole('button', { name: 'VPIP 33.3%' }))
      await userEvent.click(within(screen.getByRole('tooltip')).getByRole('link', { name: 'You did it (1)' }))

      expect(window.location.pathname).toBe('/library')
      expect(new URLSearchParams(window.location.search).get('stat')).toBe('vpip:taken')
      await waitFor(() => expect(lastFilterQuery()).toBe('site=pokerstars&marked=true&stat=vpip%3Ataken'))
      expect(await screen.findByRole('table', { name: 'All hands' })).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Marked hands' })).toBeTruthy()
    })

    it('opens the Hands where the Hero had the chance from the other link', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/stats?period=all')
      const shown = await screen.findByRole('region', { name: 'Stats' })

      await userEvent.hover(within(shown).getByRole('button', { name: 'PFR 50.0%' }))
      await userEvent.click(within(screen.getByRole('tooltip')).getByRole('link', { name: 'Opportunities (2)' }))

      await waitFor(() => expect(lastFilterQuery()).toBe('stat=pfr%3Aopportunity'))
    })

    it.each(['/library', '/library/graph', '/library/stats'])('names the Stat and the side in the Más filtros chip at %s, as after a reload or from an old link, and reads only those Hands', async (path) => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, `${path}?period=all&hero=iMapleAA&stat=vpip:taken`)

      const filters = await screen.findByRole('group', { name: 'Filters' })
      expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe('VPIP · you did it')
      // It has no chip of its own any more.
      expect(within(filters).queryByRole('button', { name: /^Remove filter/ })).toBeNull()
      expect(lastFilterQuery()).toBe('hero=iMapleAA&stat=vpip%3Ataken')
      if (path.endsWith('graph')) await waitFor(() => expect(resultsRequests.at(-1)).toBe('/api/library/results?hero=iMapleAA&stat=vpip%3Ataken'))
      if (path.endsWith('stats')) await waitFor(() => expect(statsRequests.at(-1)).toBe('/api/library/stats?hero=iMapleAA&stat=vpip%3Ataken'))
    })

    it('adds the Stat criterion to the other Más filtros criteria, asking for the Hands the link counted', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/stats?period=all&fact=pot-type:3-bet')
      const shown = await screen.findByRole('region', { name: 'Stats' })

      await userEvent.hover(within(shown).getByRole('button', { name: 'PFR 50.0%' }))
      await userEvent.click(within(screen.getByRole('tooltip')).getByRole('link', { name: 'Opportunities (2)' }))

      const filters = await screen.findByRole('group', { name: 'Filters' })
      expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe('3-bet pot · PFR · opportunities')
      await waitFor(() => expect(lastFilterQuery()).toBe('stat=pfr%3Aopportunity&fact=pot-type%3A3-bet'))
    })

    it('clears the Stat criterion with the other Más filtros criteria, keeping the view and the other filters', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/stats?period=all&site=pokerstars&stat=pfr:opportunity')
      const filters = await screen.findByRole('group', { name: 'Filters' })

      await userEvent.click(within(filters).getByRole('button', { name: 'Remove every More filters criterion' }))

      expect(window.location.pathname).toBe('/library/stats')
      expect(window.location.search).toBe('?period=all&site=pokerstars')
      expect(within(filters).queryByText('PFR · opportunities')).toBeNull()
      await waitFor(() => expect(statsRequests.at(-1)).toBe('/api/library/stats?site=pokerstars'))
    })

    it('leaves out a Stat criterion it cannot read from the address', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&stat=nope:taken')

      await screen.findByRole('group', { name: 'Filters' })
      expect(lastFilterQuery()).toBe('')
    })
  })

  describe('Más filtros', () => {
    /** The panel, opened from the bar. */
    async function openPanel() {
      const filters = await screen.findByRole('group', { name: 'Filters' })
      await userEvent.click(within(filters).getByRole('button', { name: /^More filters/ }))
      return screen.getByRole('dialog', { name: 'More filters' })
    }

    /** A criterion's row in the panel, by its label. */
    const criterion = (panel: HTMLElement, name: string) => within(panel).getByRole('group', { name })

    it('opens on the Table branch, and every value picked keeps a Hand, list, graph and Stats alike, without an Apply', async () => {
      renderLibrary()
      const panel = await openPanel()

      expect(within(panel).getByRole('tab', { name: 'Table' }).getAttribute('aria-selected')).toBe('true')
      expect(within(panel).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Table', 'Preflop', 'Flop', 'Turn', 'River', 'Cards', 'Board', 'Result', 'Stat',
      ])

      await userEvent.click(within(criterion(panel, 'Pot type')).getByRole('button', { name: '3-bet' }))
      await userEvent.click(within(criterion(panel, 'Pot type')).getByRole('button', { name: '4-bet' }))

      expect(within(criterion(panel, 'Pot type')).getByRole('button', { name: '4-bet' }).getAttribute('aria-pressed')).toBe('true')
      expect(lastFilterQuery()).toBe('fact=pot-type%3A3-bet%2C4-bet')
      expect(window.location.search).toBe('?period=all&fact=pot-type%3A3-bet%2C4-bet')
      expect(within(panel).getByRole('tab', { name: 'Table, 1 criterion' })).toBeTruthy()
      expect(within(panel).getByText(/3 of 3 hands/)).toBeTruthy()

      await userEvent.click(within(panel).getByRole('button', { name: 'Done' }))
      expect(screen.queryByRole('dialog', { name: 'More filters' })).toBeNull()

      await userEvent.click(screen.getByRole('radio', { name: 'Graph' }))
      await waitFor(() => expect(resultsRequests.at(-1)).toBe('/api/library/results?fact=pot-type%3A3-bet%2C4-bet'))
      await userEvent.click(screen.getByRole('radio', { name: 'Stats' }))
      await waitFor(() => expect(statsRequests.at(-1)).toBe('/api/library/stats?fact=pot-type%3A3-bet%2C4-bet'))
    })

    it('turns a criterion into an exclusion, and a range of players into one criterion', async () => {
      renderLibrary()
      const panel = await openPanel()
      const exclude = within(criterion(panel, 'My position')).getByRole('switch', { name: /^Exclude My position/ })
      // Nothing to exclude until a value is picked.
      expect(exclude.getAttribute('aria-disabled')).toBe('true')

      await userEvent.click(within(criterion(panel, 'My position')).getByRole('button', { name: 'BB' }))
      await userEvent.click(exclude)
      await userEvent.type(within(criterion(panel, 'Players dealt in')).getByRole('spinbutton', { name: 'Players dealt in, to' }), '4')

      expect(exclude.getAttribute('aria-checked')).toBe('true')
      expect(lastFilterQuery()).toBe('fact=%21hero-position%3ABB&fact=players%3A..4')
    })

    describe('the Board branch', () => {
      /** The Board branch's section for a Street. */
      async function streetOf(name: 'Flop' | 'Turn' | 'River') {
        const panel = await openPanel()
        await userEvent.click(within(panel).getByRole('tab', { name: 'Board' }))
        return { panel, street: within(panel).getByRole('group', { name }) }
      }

      it('sets the texture Street by Street, each its own criterion', async () => {
        renderLibrary()
        const { panel, street: flop } = await streetOf('Flop')
        const turn = within(panel).getByRole('group', { name: 'Turn' })

        await userEvent.click(within(criterion(flop, 'Suits')).getByRole('button', { name: 'monotone' }))
        await userEvent.click(within(criterion(turn, 'Suits')).getByRole('button', { name: 'flush possible' }))
        await userEvent.click(within(criterion(turn, 'Pairing')).getByRole('button', { name: 'paired' }))

        expect(lastFilterQuery()).toBe('fact=flop-suits%3Amonotone&fact=turn-suits%3Aflush-possible&fact=turn-pairing%3Apaired')
        expect(within(panel).getByRole('tab', { name: 'Board, 3 criteria' })).toBeTruthy()
        // The flop's suits are three of a kind; what the card changed is the turn's and the river's only.
        expect(within(criterion(flop, 'Suits')).queryByRole('button', { name: 'flush possible' })).toBeNull()
        expect(within(flop).queryByRole('group', { name: 'Overcard' })).toBeNull()
      })

      it('says yes or no to a Street’s yes-or-no facts, once, and excludes them', async () => {
        renderLibrary()
        const { street: river } = await streetOf('River')
        const overcard = criterion(river, 'Overcard')

        await userEvent.click(within(overcard).getByRole('button', { name: 'Yes' }))
        await userEvent.click(within(overcard).getByRole('button', { name: 'No' }))
        expect(within(overcard).getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('false')
        expect(lastFilterQuery()).toBe('fact=river-overcard%3Afalse')

        await userEvent.click(within(overcard).getByRole('switch', { name: /^Exclude Overcard \(river\)/ }))
        expect(lastFilterQuery()).toBe('fact=%21river-overcard%3Afalse')

        await userEvent.click(within(overcard).getByRole('button', { name: 'No' }))
        expect(lastFilterQuery()).not.toContain('fact')
      })

      it('picks the highest card by rank and connectedness by its count', async () => {
        renderLibrary()
        const { street: flop } = await streetOf('Flop')

        await userEvent.click(within(criterion(flop, 'Highest card')).getByRole('button', { name: 'A' }))
        await userEvent.click(within(criterion(flop, 'Highest card')).getByRole('button', { name: 'K' }))
        await userEvent.type(within(criterion(flop, 'Connectedness')).getByRole('spinbutton', { name: 'Connectedness (flop), from' }), '3')

        expect(lastFilterQuery()).toBe('fact=flop-high-card%3AA%2CK&fact=flop-connectedness%3A3..')
      })

      it('names the Street in the chip', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=turn-brings-flush:true&fact=flop-suits:monotone')
        const filters = await screen.findByRole('group', { name: 'Filters' })

        expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe('Flop: monotone · Turn: brings a flush')
      })
    })

    describe('the Cards branch', () => {
      async function cardsBranch() {
        const panel = await openPanel()
        await userEvent.click(within(panel).getByRole('tab', { name: 'Cards' }))
        return panel
      }

      it('picks Hand Classes on the Lab’s matrix, a cell or a whole kind, and sums them up in the chip', async () => {
        renderLibrary()
        const panel = await cardsBranch()
        const holeCards = criterion(panel, 'My hole cards')
        const matrix = await within(holeCards).findByRole('group', { name: 'Range matrix' })
        expect(within(matrix).getAllByRole('button')).toHaveLength(169)

        await userEvent.click(within(matrix).getByRole('button', { name: 'AKs' }))
        await userEvent.click(within(holeCards).getByRole('button', { name: 'Pairs' }))

        expect(within(matrix).getByRole('button', { name: 'AKs' }).getAttribute('aria-pressed')).toBe('true')
        expect(within(matrix).getByRole('button', { name: '77' }).getAttribute('aria-pressed')).toBe('true')
        expect(within(holeCards).getByRole('button', { name: 'Pairs' }).getAttribute('aria-pressed')).toBe('true')
        expect(lastFilterQuery()).toBe(`fact=${encodeURIComponent('hero-class:AA,AKs,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22')}`)

        // A kind already all picked is taken out whole.
        await userEvent.click(within(holeCards).getByRole('button', { name: 'Pairs' }))
        expect(lastFilterQuery()).toBe('fact=hero-class%3AAKs')
        await userEvent.click(within(matrix).getByRole('button', { name: 'AKo' }))
        await userEvent.click(within(panel).getByRole('button', { name: 'Done' }))

        const filters = screen.getByRole('group', { name: 'Filters' })
        expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe('AK')
      })

      it('offers the Made Hand, the kicker and the nuts on every Street, the Draws on the flop and the turn only', async () => {
        renderLibrary()
        const panel = await cardsBranch()
        const flop = within(panel).getByRole('group', { name: 'Flop' })
        const river = within(panel).getByRole('group', { name: 'River' })

        await userEvent.click(within(criterion(flop, 'Made hand')).getByRole('button', { name: 'Top pair' }))
        await userEvent.click(within(criterion(flop, 'Kicker')).getByRole('button', { name: 'top' }))
        await userEvent.click(within(criterion(flop, 'Draws')).getByRole('button', { name: 'Flush draw + gutshot' }))
        await userEvent.click(within(criterion(river, 'The nuts')).getByRole('button', { name: 'Yes' }))

        expect(lastFilterQuery()).toBe(
          'fact=flop-made-hand%3Atop-pair&fact=flop-kicker%3Atop&fact=flop-draw%3Aflush-draw-gutshot&fact=river-nuts%3Atrue',
        )
        expect(within(panel).getByRole('tab', { name: 'Cards, 4 criteria' })).toBeTruthy()
        expect(within(river).queryByRole('group', { name: 'Draws' })).toBeNull()
        expect(within(river).queryByRole('group', { name: 'Nut flush draw' })).toBeNull()
        expect(
          within(criterion(flop, 'Made hand'))
            .getAllByRole('button')
            .map((button) => button.textContent)
            .slice(0, 3),
        ).toEqual(['Straight flush', 'Quads', 'Full house'])
      })
    })

    describe('the Result branch', () => {
      async function resultBranch() {
        const panel = await openPanel()
        await userEvent.click(within(panel).getByRole('tab', { name: 'Result' }))
        return panel
      }

      it('sets how the Hand ended, excludes it, and clears it', async () => {
        renderLibrary()
        const panel = await resultBranch()

        await userEvent.click(within(criterion(panel, 'I folded on')).getByRole('button', { name: 'turn' }))
        await userEvent.click(within(criterion(panel, 'I folded on')).getByRole('button', { name: 'river' }))
        await userEvent.click(within(criterion(panel, 'I answered the all-in')).getByRole('button', { name: 'call' }))
        await userEvent.click(within(criterion(panel, 'I won at Showdown')).getByRole('button', { name: 'No' }))
        await userEvent.click(within(criterion(panel, 'I folded on')).getByRole('switch', { name: /^Exclude I folded on/ }))

        expect(lastFilterQuery()).toBe('fact=%21hero-folded-on%3Aturn%2Criver&fact=faced-all-in-answer%3Acall&fact=won-at-showdown%3Afalse')
        expect(within(panel).getByRole('tab', { name: 'Result, 3 criteria' })).toBeTruthy()

        await userEvent.click(within(criterion(panel, 'I answered the all-in')).getByRole('button', { name: 'call' }))
        expect(lastFilterQuery()).toBe('fact=%21hero-folded-on%3Aturn%2Criver&fact=won-at-showdown%3Afalse')
      })

      it('takes a Result or an All-in EV in big blinds, negative or with decimals', async () => {
        renderLibrary()
        const panel = await resultBranch()

        await userEvent.type(within(criterion(panel, 'Result')).getByRole('spinbutton', { name: 'Result, to' }), '-20.5')
        await userEvent.type(within(criterion(panel, 'All-in EV')).getByRole('spinbutton', { name: 'All-in EV, from' }), '1.25')

        expect(lastFilterQuery()).toBe('fact=result%3A..-20.5&fact=all-in-ev%3A1.25..')
        const filters = screen.getByRole('group', { name: 'Filters' })
        expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe('Result ≤-20.5 bb · All-in EV 1.25+ bb')
      })
    })

    describe('the Stat branch', () => {
      async function statBranch() {
        const panel = await openPanel()
        await userEvent.click(within(panel).getByRole('tab', { name: /^Stat/ }))
        return panel
      }

      it('picks a Stat’s chance or when the Hero took it, one Stat at a time, as its tooltip links do', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet')
        const panel = await statBranch()
        const preflop = within(panel).getByRole('group', { name: 'Preflop' })

        await userEvent.click(within(criterion(preflop, 'VPIP')).getByRole('button', { name: 'I did it' }))

        expect(lastFilterQuery()).toBe('stat=vpip%3Ataken&fact=pot-type%3A3-bet')
        expect(window.location.search).toBe('?period=all&stat=vpip%3Ataken&fact=pot-type%3A3-bet')
        expect(within(panel).getByRole('tab', { name: 'Stat, 1 criterion' })).toBeTruthy()
        const filters = screen.getByRole('group', { name: 'Filters' })
        expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe('3-bet pot · VPIP · you did it')

        await userEvent.click(within(criterion(panel, 'W$SD')).getByRole('button', { name: 'I had the chance' }))
        expect(lastFilterQuery()).toBe('stat=wsd%3Aopportunity&fact=pot-type%3A3-bet')
        expect(within(criterion(preflop, 'VPIP')).getByRole('button', { name: 'I did it' }).getAttribute('aria-pressed')).toBe('false')

        await userEvent.click(within(criterion(panel, 'W$SD')).getByRole('button', { name: 'I had the chance' }))
        expect(lastFilterQuery()).toBe('fact=pot-type%3A3-bet')
      })

      it('groups the Stats as Preflop, Flop, Turn, River and Showdown and totals, naming a postflop Stat with its Street', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all')
        const panel = await statBranch()

        const names = (section: HTMLElement) =>
          within(section)
            .getAllByRole('group')
            .map((row) => row.querySelector('.more-filters__label')?.textContent)
        expect(
          [...panel.querySelectorAll('.more-filters__section-title')].map((title) => title.textContent),
        ).toEqual(['Preflop', 'Flop', 'Turn', 'River', 'Showdown and totals'])
        expect(names(within(panel).getByRole('group', { name: 'Preflop' }))).toEqual([
          'VPIP',
          'PFR',
          'ATS',
          '3-bet',
          'Fold to 3-bet',
          'Squeeze',
          'Cold Call',
          '4-bet',
          'Fold to 4-bet',
          'Fold BB to Steal',
        ])
        expect(names(within(panel).getByRole('group', { name: 'Flop' }))).toEqual(['Flop C-bet', 'Flop Fold to C-bet', 'Flop Check-raise'])
        expect(names(within(panel).getByRole('group', { name: 'Turn' }))).toEqual(['Turn C-bet', 'Turn Fold to C-bet'])
        expect(names(within(panel).getByRole('group', { name: 'River' }))).toEqual(['River C-bet', 'River Fold to C-bet'])
        expect(names(within(panel).getByRole('group', { name: 'Showdown and totals' }))).toEqual(['WWSF', 'WTSD', 'W$SD', 'AFq'])

        await userEvent.click(within(criterion(panel, 'Turn C-bet')).getByRole('button', { name: 'I did it' }))

        expect(lastFilterQuery()).toBe('stat=cbet-turn%3Ataken')
        const filters = screen.getByRole('group', { name: 'Filters' })
        expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe('Turn C-bet · you did it')
      })

      it('goes with Remove all', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&stat=vpip:taken&fact=pot-type:3-bet')
        const panel = await statBranch()

        expect(within(criterion(panel, 'VPIP')).getByRole('button', { name: 'I did it' }).getAttribute('aria-pressed')).toBe('true')
        await userEvent.click(within(panel).getByRole('button', { name: 'Remove all' }))

        expect(lastFilterQuery()).toBe('')
      })
    })

    describe('the Preflop branch', () => {
      async function openPreflop() {
        const panel = await openPanel()
        await userEvent.click(within(panel).getByRole('tab', { name: 'Preflop' }))
        return panel
      }

      it('sets a named Action as made, a chance, or faced and answered, one at a time in its row', async () => {
        renderLibrary()
        const panel = await openPreflop()
        const threeBet = criterion(panel, '3-bet')
        // Nobody makes a VPIP against the Hero.
        expect(within(criterion(panel, 'VPIP')).queryByRole('button', { name: 'I faced it' })).toBeNull()

        await userEvent.click(within(threeBet).getByRole('button', { name: 'I faced it' }))
        expect(lastFilterQuery()).toBe('fact=three-bet-faced%3Atrue')

        const answered = within(threeBet).getByRole('group', { name: '3-bet, I answered' })
        await userEvent.click(within(answered).getByRole('button', { name: 'fold' }))
        await userEvent.click(within(answered).getByRole('button', { name: 'call' }))
        expect(lastFilterQuery()).toBe('fact=three-bet-answer%3Afold%2Ccall')
        expect(within(threeBet).getByRole('button', { name: 'I faced it' }).getAttribute('aria-pressed')).toBe('true')
        expect(within(panel).getByRole('tab', { name: 'Preflop, 1 criterion' })).toBeTruthy()

        await userEvent.click(within(threeBet).getByRole('switch', { name: /^Exclude 3-bet/ }))
        expect(lastFilterQuery()).toBe('fact=%21three-bet-answer%3Afold%2Ccall')

        // Another side drops the answer, and keeps the exclusion.
        await userEvent.click(within(threeBet).getByRole('button', { name: 'I made it' }))
        expect(lastFilterQuery()).toBe('fact=%21three-bet-did%3Atrue')
        expect(within(threeBet).queryByRole('group', { name: '3-bet, I answered' })).toBeNull()

        await userEvent.click(within(threeBet).getByRole('button', { name: 'I made it' }))
        expect(lastFilterQuery()).not.toContain('fact')
      })

      it('offers the common lines and takes any other typed, sizes in big blinds with decimals', async () => {
        renderLibrary()
        const panel = await openPreflop()
        const line = criterion(panel, 'My line')

        await userEvent.click(within(line).getByRole('button', { name: 'RC' }))
        await userEvent.type(within(line).getByRole('textbox', { name: 'My line, another line' }), 'rz{Enter}')
        expect(within(line).getByText(/A line is X, B, C, R or F/)).toBeTruthy()
        await userEvent.clear(within(line).getByRole('textbox', { name: 'My line, another line' }))
        await userEvent.type(within(line).getByRole('textbox', { name: 'My line, another line' }), 'rrc{Enter}')
        expect(lastFilterQuery()).toBe('fact=preflop-line%3ARC%2CRRC')
        expect(within(line).getByRole('button', { name: 'RRC' }).getAttribute('aria-pressed')).toBe('true')

        await userEvent.type(within(criterion(panel, 'Open (bb)')).getByRole('spinbutton', { name: 'Open (bb), from' }), '2.5')
        expect(lastFilterQuery()).toBe('fact=preflop-line%3ARC%2CRRC&fact=open-size%3A2.5..')
      })

      it('reads its criteria from the address, in the panel and in the chip', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=straddle:false&fact=three-bet-answer:fold&fact=preflop-role:called-open')
        const filters = await screen.findByRole('group', { name: 'Filters' })

        expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe(
          'Role: called an open · Faced a 3-bet → fold+1',
        )

        await userEvent.click(within(filters).getByRole('button', { name: /^More filters: / }))
        const panel = screen.getByRole('dialog', { name: 'More filters' })
        await userEvent.click(within(panel).getByRole('tab', { name: 'Preflop, 3 criteria' }))
        const answered = within(criterion(panel, '3-bet')).getByRole('group', { name: '3-bet, I answered' })
        expect(within(answered).getByRole('button', { name: 'fold' }).getAttribute('aria-pressed')).toBe('true')
        expect(within(criterion(panel, 'Straddle')).getByRole('button', { name: 'No' }).getAttribute('aria-pressed')).toBe('true')
      })
    })

    describe('the Street branches', () => {
      /** The panel on a Street's branch. */
      async function openStreet(name: 'Flop' | 'Turn' | 'River') {
        const panel = await openPanel()
        await userEvent.click(within(panel).getByRole('tab', { name }))
        return panel
      }

      it('sets where the Hero sat as the Street began, heads-up or multiway, and the SPR', async () => {
        renderLibrary()
        const panel = await openStreet('Flop')
        const situation = within(panel).getByRole('group', { name: 'Situation as the flop begins' })

        await userEvent.click(within(criterion(situation, 'Position')).getByRole('button', { name: 'Out of position (OOP)' }))
        await userEvent.click(within(criterion(situation, 'Players')).getByRole('button', { name: 'Multiway' }))
        expect(lastFilterQuery()).toBe('fact=flop-ip%3Afalse&fact=flop-players%3A3..')

        await userEvent.click(within(criterion(situation, 'Players')).getByRole('button', { name: 'Heads-up' }))
        expect(within(criterion(situation, 'Players')).getByRole('button', { name: 'Multiway' }).getAttribute('aria-pressed')).toBe('false')
        expect(lastFilterQuery()).toBe('fact=flop-ip%3Afalse&fact=flop-players%3A2..2')

        await userEvent.click(within(criterion(situation, 'Players')).getByRole('switch', { name: /^Exclude Players \(flop\)/ }))
        await userEvent.type(within(criterion(situation, 'SPR')).getByRole('spinbutton', { name: 'SPR (flop), to' }), '1.5')
        expect(lastFilterQuery()).toBe('fact=flop-ip%3Afalse&fact=%21flop-players%3A2..2&fact=flop-spr%3A..1.5')
        expect(within(panel).getByRole('tab', { name: 'Flop, 3 criteria' })).toBeTruthy()
      })

      it('sets a named Action, faced and answered, the Hero’s line, and a size as a % of the pot', async () => {
        renderLibrary()
        const panel = await openStreet('Flop')
        const cbet = criterion(panel, 'C-bet')

        await userEvent.click(within(cbet).getByRole('button', { name: 'I faced it' }))
        const answered = within(cbet).getByRole('group', { name: 'C-bet (flop), I answered' })
        await userEvent.click(within(answered).getByRole('button', { name: 'call' }))
        await userEvent.click(within(answered).getByRole('button', { name: 'raise' }))
        await userEvent.click(within(criterion(panel, 'My line')).getByRole('button', { name: 'XC' }))
        await userEvent.type(within(criterion(panel, 'My line')).getByRole('textbox', { name: 'My line (flop), another line' }), 'xrc{Enter}')
        await userEvent.type(within(criterion(panel, 'Bet I faced')).getByRole('spinbutton', { name: 'Bet I faced (flop), from' }), '75')

        expect(lastFilterQuery()).toBe('fact=flop-cbet-answer%3Acall%2Craise&fact=flop-line%3AXC%2CXRC&fact=flop-bet-size-faced%3A75..')
        expect(within(criterion(panel, 'Bet I faced')).getByText('% of the pot')).toBeTruthy()
      })

      it('offers each Street’s own named Actions only', async () => {
        renderLibrary()
        const panel = await openStreet('Flop')
        const actions = () =>
          within(within(panel).getByRole('group', { name: 'Action' }))
            .getAllByRole('group')
            .filter((group) => within(group).queryByRole('button', { name: 'I made it' }))
            .map((group) => group.querySelector('.more-filters__label')?.textContent)

        expect(actions()).toEqual(['C-bet', 'Donk bet', 'Bet', 'Check-raise', 'Raise', '3-bet', '4-bet+'])
        await userEvent.click(within(panel).getByRole('tab', { name: 'Turn' }))
        expect(actions()).toEqual(['C-bet', 'Delayed C-bet', 'Donk bet', 'Probe', 'Float', 'Bet', 'Check-raise', 'Raise', '3-bet', '4-bet+'])
        await userEvent.click(within(panel).getByRole('tab', { name: 'River' }))
        expect(actions()).toEqual(['C-bet', 'Donk bet', 'Probe', 'Float', 'Bet', 'Check-raise', 'Raise', '3-bet', '4-bet+'])
      })

      it('describes one line through the same Hand with criteria on two Streets', async () => {
        renderLibrary()
        const panel = await openStreet('Flop')
        await userEvent.click(within(criterion(panel, 'C-bet')).getByRole('button', { name: 'I made it' }))
        await userEvent.click(within(panel).getByRole('tab', { name: 'Turn' }))
        await userEvent.click(within(criterion(panel, 'Raise')).getByRole('button', { name: 'I faced it' }))

        // Both go to the API, which keeps the Hands meeting every criterion.
        expect(lastFilterQuery()).toBe('fact=flop-cbet-did%3Atrue&fact=turn-raise-faced%3Atrue')
        await userEvent.click(within(panel).getByRole('button', { name: 'Done' }))
        const filters = screen.getByRole('group', { name: 'Filters' })
        expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe('Flop: C-bet made · Turn: Faced a raise')
      })

      it('reads its criteria from the address, in the chip', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=flop-ip:false&fact=flop-cbet-answer:call,raise&fact=!river-players:3..')
        const filters = await screen.findByRole('group', { name: 'Filters' })

        expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe(
          'Flop: OOP · Flop: Faced a C-bet → call, raise+1',
        )
      })
    })

    it('explains a criterion the pot types picked never meet', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:single-raised')
      const panel = await openPanel()

      await userEvent.click(within(criterion(panel, '3-bettor')).getByRole('button', { name: 'SB' }))

      expect(within(criterion(panel, '3-bettor')).getByText(/Only 3-bet pots and bigger have a 3-bettor/)).toBeTruthy()
    })

    it('shows as one chip: its summary cut with +N, every criterion on hover, the panel on click, and × drops them all', async () => {
      renderLibrary(
        DEFAULT_PREFERENCES,
        undefined,
        '/library?period=all&site=pokerstars&fact=players:3..6&fact=!pot-type:walk,limped&fact=hero-position:BTN,CO&fact=opener-position:UTG,UTG%2B1,MP',
      )
      const filters = await screen.findByRole('group', { name: 'Filters' })
      const chip = within(filters).getByRole('button', { name: /^More filters: / })

      expect(chip.textContent).toBe('Not walk, limped pot · 3–6 players · Hero BTN, CO+1')
      expect(screen.queryByRole('tooltip')).toBeNull()

      await userEvent.hover(chip)
      expect(within(screen.getByRole('tooltip')).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Table Not walk, limped pot',
        'Table 3–6 players',
        'Table Hero BTN, CO',
        'Table UTG, UTG+1, MP open',
      ])
      await userEvent.unhover(chip)
      expect(screen.queryByRole('tooltip')).toBeNull()

      await userEvent.click(chip)
      const panel = screen.getByRole('dialog', { name: 'More filters' })
      expect(within(criterion(panel, 'Opener')).getByRole('button', { name: 'MP' }).getAttribute('aria-pressed')).toBe('true')
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name: 'More filters' })).toBeNull()
      expect(document.activeElement).toBe(within(filters).getByRole('button', { name: /^More filters: / }))

      await userEvent.click(within(filters).getByRole('button', { name: 'Remove every More filters criterion' }))

      expect(window.location.search).toBe('?period=all&site=pokerstars')
      expect(lastFilterQuery()).toBe('site=pokerstars')
      expect(within(filters).getByRole('button', { name: 'More filters' })).toBeTruthy()
    })

    it('lists the criteria when the chip has the focus, too', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet')
      const filters = await screen.findByRole('group', { name: 'Filters' })

      within(filters).getByRole('button', { name: /^More filters: / }).focus()

      expect(within(await screen.findByRole('tooltip')).getByText('3-bet pot')).toBeTruthy()
    })

    it('goes with Clear filters', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet')
      const filters = await screen.findByRole('group', { name: 'Filters' })

      await userEvent.click(within(filters).getByRole('button', { name: 'Clear filters' }))

      expect(window.location.search).toBe('')
      expect(lastFilterQuery()).not.toContain('fact')
    })

    it('works by keyboard: open, move between branches, set a criterion, close', async () => {
      renderLibrary()
      const filters = await screen.findByRole('group', { name: 'Filters' })
      within(filters).getByRole('button', { name: 'More filters' }).focus()

      await userEvent.keyboard('{Enter}')
      const panel = screen.getByRole('dialog', { name: 'More filters' })
      expect(document.activeElement).toBe(within(panel).getByRole('tab', { name: 'Table' }))
      // The arrows move through every branch, and wrap.
      await userEvent.keyboard('{ArrowDown}')
      expect(document.activeElement).toBe(within(panel).getByRole('tab', { name: 'Preflop' }))
      await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
      expect(document.activeElement).toBe(within(panel).getByRole('tab', { name: 'River' }))
      await userEvent.keyboard('{ArrowDown}')
      expect(document.activeElement).toBe(within(panel).getByRole('tab', { name: 'Cards' }))
      await userEvent.keyboard('{ArrowDown}')
      expect(document.activeElement).toBe(within(panel).getByRole('tab', { name: 'Board' }))
      await userEvent.keyboard('{ArrowDown}')
      expect(document.activeElement).toBe(within(panel).getByRole('tab', { name: 'Result' }))
      await userEvent.keyboard('{ArrowDown}')
      expect(document.activeElement).toBe(within(panel).getByRole('tab', { name: 'Stat' }))
      await userEvent.keyboard('{ArrowDown}')
      expect(document.activeElement).toBe(within(panel).getByRole('tab', { name: 'Table' }))

      await userEvent.tab()
      await userEvent.keyboard(' ')
      expect(lastFilterQuery()).toBe('fact=pot-type%3Awalk')

      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(within(filters).getByRole('button', { name: /^More filters: / }))
    })
  })

  describe('Saved Filters', () => {
    /** The side column's Saved Filters. */
    const savedList = async () => within(await screen.findByRole('navigation', { name: 'Collections' })).findByRole('group', { name: 'Saved filters' })

    it('lists them in the side column, after the Tags', async () => {
      renderLibrary()
      const list = await savedList()

      const groups = within(screen.getByRole('navigation', { name: 'Collections' })).getAllByRole('group')
      expect(groups.map((group) => group.getAttribute('aria-labelledby') && group.textContent?.slice(0, 15))).toEqual([
        expect.stringMatching(/^Tags/),
        expect.stringMatching(/^Saved filters/),
      ])
      expect(within(list).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual([
        'Edit saved filters',
        '3-bet OOP como caller',
        'BTN vs BB',
      ])
    })

    it('applies one in place of the More filters criteria, keeping the rest, with its name on the chip and its id in the address', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&site=pokerstars&fact=players:3..')
      const list = await savedList()

      await userEvent.click(within(list).getByRole('button', { name: '3-bet OOP como caller' }))

      expect(window.location.search).toBe('?period=all&site=pokerstars&fact=pot-type%3A3-bet&fact=%21hero-position%3ABTN%2CCO&saved=sf1')
      await waitFor(() => expect(lastFilterQuery()).toBe('site=pokerstars&fact=pot-type%3A3-bet&fact=%21hero-position%3ABTN%2CCO'))
      const filters = screen.getByRole('group', { name: 'Filters' })
      const chip = within(filters).getByRole('button', { name: 'Saved filter 3-bet OOP como caller' })
      expect(chip.textContent).toBe('3-bet OOP como caller')
      expect(within(list).getByRole('button', { name: '3-bet OOP como caller' }).getAttribute('aria-pressed')).toBe('true')

      // Another one replaces it, its Stat criterion too.
      await userEvent.click(within(list).getByRole('button', { name: 'BTN vs BB' }))
      expect(window.location.search).toBe('?period=all&site=pokerstars&stat=vpip%3Ataken&fact=hero-position%3ABTN&saved=sf2')

      // The one applied, again, drops it.
      await userEvent.click(within(list).getByRole('button', { name: 'BTN vs BB' }))
      expect(window.location.search).toBe('?period=all&site=pokerstars')
      expect(within(filters).getByRole('button', { name: 'More filters' })).toBeTruthy()
      expect(within(list).getByRole('button', { name: 'BTN vs BB' }).getAttribute('aria-pressed')).toBe('false')
    })

    it('stays applied on a reload, is modified once a criterion changes, and unchanged again once the change is undone', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet&fact=!hero-position:BTN,CO&saved=sf1')
      const list = await savedList()
      const filters = screen.getByRole('group', { name: 'Filters' })

      expect(within(filters).getByRole('button', { name: 'Saved filter 3-bet OOP como caller' })).toBeTruthy()
      expect(within(list).getByRole('button', { name: '3-bet OOP como caller' }).getAttribute('aria-pressed')).toBe('true')

      await userEvent.click(within(filters).getByRole('button', { name: 'Saved filter 3-bet OOP como caller' }))
      const panel = screen.getByRole('dialog', { name: 'More filters' })
      const fourBet = () => within(within(panel).getByRole('group', { name: 'Pot type' })).getByRole('button', { name: '4-bet' })
      await userEvent.click(fourBet())

      const chip = within(filters).getByRole('button', { name: 'Saved filter 3-bet OOP como caller, modified' })
      expect(chip.textContent).toBe('3-bet OOP como caller· modified')
      expect(window.location.search).toBe('?period=all&fact=pot-type%3A3-bet%2C4-bet&fact=%21hero-position%3ABTN%2CCO&saved=sf1')
      expect(within(list).getByRole('button', { name: '3-bet OOP como caller' }).getAttribute('aria-pressed')).toBe('true')

      await userEvent.click(fourBet())
      expect(within(filters).getByRole('button', { name: 'Saved filter 3-bet OOP como caller' })).toBeTruthy()
    })

    it('keeps a modified one modified on a reload, and its menu discards the changes', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&site=pokerstars&fact=pot-type:3-bet&fact=players:..4&saved=sf1')
      const filters = await screen.findByRole('group', { name: 'Filters' })
      const chip = await within(filters).findByRole('button', { name: 'Saved filter 3-bet OOP como caller, modified' })

      // Its list says which criteria it doesn't hold.
      await userEvent.hover(chip)
      expect(within(screen.getByRole('tooltip')).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Table 3-bet pot',
        'Table ≤4 players (added, not saved)',
      ])

      await userEvent.click(chip)
      const menu = screen.getByRole('menu', { name: 'Changes to 3-bet OOP como caller' })
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Edit criteriaOpens More filters',
        'Save changesReplaces the criteria of “3-bet OOP como caller”',
        'Save as new filter…',
        'Discard changesGoes back to the saved criteria',
      ])
      await userEvent.click(within(menu).getByRole('menuitem', { name: /^Discard changes/ }))

      expect(window.location.search).toBe('?period=all&site=pokerstars&fact=pot-type%3A3-bet&fact=%21hero-position%3ABTN%2CCO&saved=sf1')
      expect(screen.queryByRole('menu')).toBeNull()
      expect(within(filters).getByRole('button', { name: 'Saved filter 3-bet OOP como caller' })).toBeTruthy()
      expect(savedFilterRequests).toEqual([])
    })

    it('marks a changed Stat criterion as not saved too', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&stat=pfr:taken&fact=hero-position:BTN&saved=sf2')
      const filters = await screen.findByRole('group', { name: 'Filters' })

      await userEvent.hover(await within(filters).findByRole('button', { name: 'Saved filter BTN vs BB, modified' }))

      const lines = within(screen.getByRole('tooltip')).getAllByRole('listitem').map((item) => item.textContent)
      expect(lines[0]).not.toContain('not saved')
      expect(lines.at(-1)).toMatch(/^Stat .*\(changed, not saved\)$/)
    })

    it('edits the criteria of a modified one from its menu', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet&saved=sf1')
      const filters = await screen.findByRole('group', { name: 'Filters' })
      await userEvent.click(await within(filters).findByRole('button', { name: 'Saved filter 3-bet OOP como caller, modified' }))

      await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^Edit criteria/ }))

      expect(screen.queryByRole('menu')).toBeNull()
      expect(screen.getByRole('dialog', { name: 'More filters' })).toBeTruthy()
    })

    it('saves the changes over the saved criteria', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet&fact=players:..4&saved=sf1')
      const filters = await screen.findByRole('group', { name: 'Filters' })
      await userEvent.click(await within(filters).findByRole('button', { name: 'Saved filter 3-bet OOP como caller, modified' }))

      await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^Save changes/ }))

      expect(savedFilterRequests).toEqual(['PUT /api/library/saved-filters/sf1/criteria {"criteria":{"facts":["pot-type:3-bet","players:..4"],"stat":null}}'])
      expect(await within(filters).findByRole('button', { name: 'Saved filter 3-bet OOP como caller' })).toBeTruthy()
      expect(window.location.search).toBe('?period=all&fact=pot-type:3-bet&fact=players:..4&saved=sf1')
    })

    it('saves the changes as a new filter, which is then the one applied', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet&fact=players:..4&saved=sf1')
      const filters = await screen.findByRole('group', { name: 'Filters' })
      await userEvent.click(await within(filters).findByRole('button', { name: 'Saved filter 3-bet OOP como caller, modified' }))

      await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Save as new filter…' }))
      const dialog = screen.getByRole('dialog', { name: 'Save filter' })
      expect((within(dialog).getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('')
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), '3-bet a 4{Enter}')

      expect(savedFilterRequests).toEqual([
        'POST /api/library/saved-filters {"name":"3-bet a 4","criteria":{"facts":["pot-type:3-bet","players:..4"],"stat":null}}',
      ])
      await waitFor(() => expect(window.location.search).toBe('?period=all&fact=pot-type%3A3-bet&fact=players%3A..4&saved=sf3'))
      expect(within(filters).getByRole('button', { name: 'Saved filter 3-bet a 4' })).toBeTruthy()
    })

    it('renames and deletes them from the side column, deleting the applied one with its criteria', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&site=pokerstars&stat=vpip:taken&fact=hero-position:BTN&saved=sf2')
      const list = await savedList()

      await userEvent.click(within(list).getByRole('button', { name: 'Edit saved filters' }))
      const name = within(list).getByRole('textbox', { name: 'Rename 3-bet OOP como caller' })
      await userEvent.clear(name)
      await userEvent.type(name, '3-bet OOP{Enter}')
      expect(savedFilterRequests).toEqual(['PATCH /api/library/saved-filters/sf1 {"name":"3-bet OOP"}'])

      await userEvent.click(within(list).getByRole('button', { name: 'Delete BTN vs BB' }))
      await userEvent.click(within(list).getByRole('button', { name: 'Delete the filter BTN vs BB' }))

      expect(savedFilterRequests.at(-1)).toBe('DELETE /api/library/saved-filters/sf2')
      await waitFor(() => expect(window.location.search).toBe('?period=all&site=pokerstars'))
      await userEvent.click(within(list).getByRole('button', { name: 'Done' }))
      expect(within(list).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Edit saved filters', '3-bet OOP'])
    })

    it('says so when a rename is refused', async () => {
      renderLibrary()
      const list = await savedList()
      await userEvent.click(within(list).getByRole('button', { name: 'Edit saved filters' }))
      const name = within(list).getByRole('textbox', { name: 'Rename 3-bet OOP como caller' })

      await userEvent.clear(name)
      await userEvent.type(name, 'btn vs bb{Enter}')

      expect(await within(list).findByText('You already have a saved filter with that name.')).toBeTruthy()
    })

    it('opens a link to a deleted one with no More filters criteria, and says so', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&site=pokerstars&fact=pot-type:3-bet&stat=vpip:taken&saved=gone')

      expect(await screen.findByText('That saved filter no longer exists, so the Library opens with no More filters criteria.')).toBeTruthy()
      expect(window.location.search).toBe('?period=all&site=pokerstars')
      const filters = await screen.findByRole('group', { name: 'Filters' })
      expect(within(filters).getByRole('button', { name: 'More filters' })).toBeTruthy()
    })

    it('says when criteria it held were dropped, being on facts the Library no longer has', async () => {
      savedFilters = [{ ...savedFilters[0], criteria: { facts: ['pot-type:3-bet', 'retired-fact:x'], stat: null }, dropped: 1 }]
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all')
      const list = await savedList()

      await userEvent.click(within(list).getByRole('button', { name: '3-bet OOP como caller' }))

      expect(await screen.findByText('2 criteria of “3-bet OOP como caller” are on things the Library no longer has, and were left out.')).toBeTruthy()
      expect(window.location.search).toBe('?period=all&fact=pot-type%3A3-bet&saved=sf1')
      const filters = screen.getByRole('group', { name: 'Filters' })
      expect(within(filters).getByRole('button', { name: 'Saved filter 3-bet OOP como caller' })).toBeTruthy()
    })

    it('saves the More filters criteria under a name, says what it leaves out, and applies it', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&site=pokerstars&fact=pot-type:3-bet&fact=!players:..2&stat=vpip:taken')
      const filters = await screen.findByRole('group', { name: 'Filters' })
      await userEvent.click(within(filters).getByRole('button', { name: /^More filters: / }))

      await userEvent.click(within(screen.getByRole('dialog', { name: 'More filters' })).getByRole('button', { name: 'Save filter…' }))

      expect(screen.queryByRole('dialog', { name: 'More filters' })).toBeNull()
      const dialog = screen.getByRole('dialog', { name: 'Save filter' })
      expect(within(within(dialog).getByRole('list', { name: 'What it saves' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Table: 3-bet pot · Not ≤2 players',
        'Stat: VPIP · you did it',
      ])
      expect(within(dialog).getByText(/doesn't save the period, sites, heroes, stakes, Marked or tags/)).toBeTruthy()

      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), '  Mis 3-bet ')
      expect(within(dialog).getByText('12 / 40')).toBeTruthy()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save filter' }))

      expect(savedFilterRequests).toEqual([
        'POST /api/library/saved-filters {"name":"Mis 3-bet","criteria":{"facts":["pot-type:3-bet","!players:..2"],"stat":"vpip:taken"}}',
      ])
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save filter' })).toBeNull())
      expect(window.location.search).toBe('?period=all&site=pokerstars&stat=vpip%3Ataken&fact=pot-type%3A3-bet&fact=%21players%3A..2&saved=sf3')
      const list = await savedList()
      expect(await within(list).findByRole('button', { name: 'Mis 3-bet' })).toBeTruthy()
      expect(within(list).getByRole('button', { name: 'Mis 3-bet' }).getAttribute('aria-pressed')).toBe('true')
      expect(within(filters).getByRole('button', { name: 'Saved filter Mis 3-bet' })).toBeTruthy()
    })

    it('says so when the name is taken, and stays open to change it', async () => {
      saveFilterReply = () => Response.json({ reason: 'saved-filter-name-taken' }, { status: 409 })
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet')
      const list = await savedList()

      await userEvent.click(within(list).getByRole('button', { name: 'Save filter' }))
      const dialog = screen.getByRole('dialog', { name: 'Save filter' })
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'btn vs bb{Enter}')

      expect(await within(dialog).findByText('You already have a saved filter with that name.')).toBeTruthy()
      expect(screen.getByRole('dialog', { name: 'Save filter' })).toBeTruthy()
      expect(window.location.search).toBe('?period=all&fact=pot-type:3-bet')

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog', { name: 'Save filter' })).toBeNull()
    })

    it('offers saving only once there are criteria to save', async () => {
      renderLibrary()
      const list = await savedList()

      expect(within(list).queryByRole('button', { name: 'Save filter' })).toBeNull()
    })

    describe('at phone width', () => {
      /** The screen's width, as `matchMedia` answers the 760 px breakpoint; changing it tells whoever listens. */
      let narrow: boolean
      const listeners = new Set<() => void>()
      const resize = (toNarrow: boolean) =>
        act(() => {
          narrow = toNarrow
          listeners.forEach((changed) => changed())
        })

      beforeEach(() => {
        narrow = true
        listeners.clear()
        vi.stubGlobal('matchMedia', (query: string) => ({
          get matches() {
            return query === '(max-width: 760px)' && narrow
          },
          addEventListener: (_: string, changed: () => void) => listeners.add(changed),
          removeEventListener: (_: string, changed: () => void) => listeners.delete(changed),
        }))
      })

      it('applies and drops them from the side column, which says where to create and edit them', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&site=pokerstars')
        const list = await savedList()
        const filters = screen.getByRole('group', { name: 'Filters' })

        expect(within(list).getByText('Create and edit filters on a computer.')).toBeTruthy()
        expect(within(filters).queryByRole('button', { name: /^More filters/ })).toBeNull()

        await userEvent.click(within(list).getByRole('button', { name: '3-bet OOP como caller' }))

        expect(window.location.search).toBe('?period=all&site=pokerstars&fact=pot-type%3A3-bet&fact=%21hero-position%3ABTN%2CCO&saved=sf1')
        await waitFor(() => expect(lastFilterQuery()).toBe('site=pokerstars&fact=pot-type%3A3-bet&fact=%21hero-position%3ABTN%2CCO'))
        // The chip names it and drops it, and opens nothing.
        expect(within(filters).queryByRole('button', { name: /^Saved filter/ })).toBeNull()
        expect(within(filters).getByText('3-bet OOP como caller')).toBeTruthy()
        expect(within(list).queryByRole('button', { name: 'Save filter' })).toBeNull()

        await userEvent.click(within(filters).getByRole('button', { name: 'Remove every More filters criterion' }))
        expect(window.location.search).toBe('?period=all&site=pokerstars')
        expect(within(list).getByRole('button', { name: '3-bet OOP como caller' }).getAttribute('aria-pressed')).toBe('false')

        // Tapping the applied one again drops it too.
        await userEvent.click(within(list).getByRole('button', { name: 'BTN vs BB' }))
        await userEvent.click(within(list).getByRole('button', { name: 'BTN vs BB' }))
        expect(window.location.search).toBe('?period=all&site=pokerstars')
      })

      it('opens the Hands of a link carrying More filters criteria, with their summary and a ×, and nothing to open', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet')
        const filters = await screen.findByRole('group', { name: 'Filters' })

        expect(lastFilterQuery()).toBe('fact=pot-type%3A3-bet')
        expect(within(filters).getByText('3-bet pot')).toBeTruthy()
        expect(within(filters).queryByRole('button', { name: /^More filters/ })).toBeNull()
        expect(within(await savedList()).queryByRole('button', { name: 'Save filter' })).toBeNull()

        await userEvent.click(within(filters).getByRole('button', { name: 'Remove every More filters criterion' }))
        expect(window.location.search).toBe('?period=all')
        await waitFor(() => expect(lastFilterQuery()).toBe(''))
      })

      it('offers no renaming or deleting, and shows no modified state nor its menu', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet&fact=players:..4&saved=sf1')
        const list = await savedList()
        const filters = screen.getByRole('group', { name: 'Filters' })

        expect(within(list).queryByRole('button', { name: 'Edit saved filters' })).toBeNull()
        // A changed one shows as its criteria, with nothing to open.
        expect(within(filters).getByText('3-bet pot · ≤4 players')).toBeTruthy()
        expect(within(filters).queryByText('· modified')).toBeNull()
        expect(within(filters).queryByRole('button', { name: /^Saved filter/ })).toBeNull()

        // Widened, they are back.
        resize(false)
        expect(within(list).getByRole('button', { name: 'Edit saved filters' })).toBeTruthy()
        expect(within(filters).getByRole('button', { name: 'Saved filter 3-bet OOP como caller, modified' })).toBeTruthy()
      })

      it('keeps adding a Stat criterion from a Stat’s tooltip', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/stats?period=all')
        const shown = await screen.findByRole('region', { name: 'Stats' })

        await userEvent.hover(within(shown).getByRole('button', { name: 'VPIP 33.3%' }))
        await userEvent.click(within(screen.getByRole('tooltip')).getByRole('link', { name: 'You did it (1)' }))

        await waitFor(() => expect(lastFilterQuery()).toBe('stat=vpip%3Ataken'))
      })

      it('brings everything back once the screen is wider', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&fact=pot-type:3-bet')
        const list = await savedList()
        const filters = screen.getByRole('group', { name: 'Filters' })
        expect(within(list).queryByRole('button', { name: 'Save filter' })).toBeNull()

        resize(false)

        expect(within(list).getByRole('button', { name: 'Save filter' })).toBeTruthy()
        expect(within(list).queryByText('Create and edit filters on a computer.')).toBeNull()
        await userEvent.click(within(filters).getByRole('button', { name: /^More filters: / }))
        expect(screen.getByRole('dialog', { name: 'More filters' })).toBeTruthy()

        // Narrowed again, the panel goes with the rest.
        resize(true)
        expect(screen.queryByRole('dialog', { name: 'More filters' })).toBeNull()
        expect(within(list).queryByRole('button', { name: 'Save filter' })).toBeNull()
      })
    })
  })

  describe('filters', () => {
    it('offers only the Poker Sites, Heroes and Stakes the Library holds', async () => {
      renderLibrary()
      const filters = await screen.findByRole('group', { name: 'Filters' })

      expect(await optionsOf(filters, 'Poker site')).toEqual(['CoinPoker', 'PokerStars'])
      expect(await optionsOf(filters, 'Hero')).toEqual(['Hero', 'iMapleAA'])
      // Two Stakes that read alike say their currency.
      expect(await optionsOf(filters, 'Stake')).toEqual(['NL10 EUR', 'NL10 USDT', 'NL50'])
    })

    it('keeps the Hands matching any of the values ticked in one filter, list and graph alike', async () => {
      renderLibrary()
      const filters = await screen.findByRole('group', { name: 'Filters' })

      await choose(filters, 'Poker site', 'PokerStars')
      await userEvent.click(screen.getByRole('option', { name: 'CoinPoker' }))
      await userEvent.keyboard('{Escape}')
      await choose(filters, 'Stake', 'NL50')
      await userEvent.click(screen.getByRole('option', { name: 'NL10 USDT' }))

      expect(chosen(filters, 'Poker site')).toBe('CoinPoker +1')
      expect(chosen(filters, 'Stake')).toBe('NL10 USDT +1')
      expect(lastFilterQuery()).toBe('site=pokerstars&site=coinpoker&stake=no-limit%3A25%3A50%3AEUR&stake=no-limit%3A5%3A10%3AUSDT')
      expect(window.location.search).toBe(
        '?period=all&site=pokerstars&site=coinpoker&stake=no-limit%3A25%3A50%3AEUR&stake=no-limit%3A5%3A10%3AUSDT',
      )

      await userEvent.click(screen.getByRole('radio', { name: 'Graph' }))
      await waitFor(() =>
        expect(resultsRequests.at(-1)).toBe(
          '/api/library/results?site=pokerstars&site=coinpoker&stake=no-limit%3A25%3A50%3AEUR&stake=no-limit%3A5%3A10%3AUSDT',
        ),
      )

      await userEvent.click(within(filters).getByRole('button', { name: 'Clear filters' }))
      expect(chosen(filters, 'Poker site')).toBe('All sites')
      expect(chosen(filters, 'Stake')).toBe('All stakes')
    })

    it('combines the filters, going back to the first page, and one action clears them all', async () => {
      renderLibrary()
      await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
      await screen.findByText('Showing 3–3 of 3')
      const filters = screen.getByRole('group', { name: 'Filters' })

      await choose(filters, 'Poker site', 'PokerStars')
      await choose(filters, 'Hero', 'iMapleAA')
      await choose(filters, 'Stake', 'NL10 EUR')

      expect(lastFilterQuery()).toBe('site=pokerstars&hero=iMapleAA&stake=no-limit%3A5%3A10%3AEUR')
      expect(new URL(requests.at(-1)!, 'http://localhost').searchParams.get('page')).toBe('1')
      expect(window.location.search).toBe('?period=all&site=pokerstars&hero=iMapleAA&stake=no-limit%3A5%3A10%3AEUR')

      await userEvent.click(within(filters).getByRole('button', { name: 'Clear filters' }))

      // Back to the default: today's Hands, and a bare address.
      expect(window.location.search).toBe('')
      expect(chosen(filters, 'Period')).toBe('Today')
      expect(chosen(filters, 'Poker site')).toBe('All sites')
      expect(chosen(filters, 'Hero')).toBe('All heroes')
    })

    it('narrows the period to a quick range of the viewer’s days', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 21, 15, 30))
      try {
        renderLibrary()
        const filters = await screen.findByRole('group', { name: 'Filters' })

        await choose(filters, 'Period', 'This week')

        // A Wednesday: the week began on Monday.
        expect((within(filters).getByLabelText('From') as HTMLInputElement).value).toBe('2026-10-19')
        expect((within(filters).getByLabelText('To') as HTMLInputElement).value).toBe('2026-10-21')
        const query = new URL(requests.at(-1)!, 'http://localhost').searchParams
        expect(query.get('from')).toBe(new Date(2026, 9, 19).toISOString())
        expect(query.get('to')).toBe(new Date(2026, 9, 22).toISOString())
      } finally {
        vi.useRealTimers()
      }
    })

    it('shows today’s Hands at a bare address', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 21, 15, 30))
      try {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library')
        const filters = await screen.findByRole('group', { name: 'Filters' })

        expect(chosen(filters, 'Period')).toBe('Today')
        const query = new URL(requests.at(-1)!, 'http://localhost').searchParams
        expect(query.get('from')).toBe(new Date(2026, 9, 21).toISOString())
        expect(query.get('to')).toBe(new Date(2026, 9, 22).toISOString())
      } finally {
        vi.useRealTimers()
      }
    })

    it('says when a period holds no Hands, offering all of them', async () => {
      pages['1'] = { ...pages['1'], total: 0, hands: [] }
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library')

      expect(await screen.findByText('No hands today.')).toBeTruthy()
      expect(screen.queryByText('No hands match these filters.')).toBeNull()

      await userEvent.click(screen.getByRole('button', { name: 'Show all' }))

      expect(window.location.search).toBe('?period=all')
      expect(lastFilterQuery()).toBe('')
    })

    it('takes any from and to dates, and calls them a custom period', async () => {
      renderLibrary()
      const filters = await screen.findByRole('group', { name: 'Filters' })

      fireEvent.change(within(filters).getByLabelText('From'), { target: { value: '2026-09-01' } })

      expect(new URL(requests.at(-1)!, 'http://localhost').searchParams.get('from')).toBe(new Date(2026, 8, 1).toISOString())
      expect(lastFilterQuery()).not.toContain('to=')
      expect(chosen(filters, 'Period')).toBe('Custom')
    })

    it('shows only the Marked Hands from the collections', async () => {
      renderLibrary()
      const collections = await screen.findByRole('navigation', { name: 'Collections' })
      expect(within(collections).getByRole('button', { name: /Marked/ }).textContent).toContain('1')

      await userEvent.click(within(collections).getByRole('button', { name: /Marked/ }))

      expect(lastFilterQuery()).toBe('marked=true')
      expect(screen.getByRole('heading', { name: 'Marked hands' })).toBeTruthy()
      expect(within(collections).getByRole('button', { name: /Marked/ }).getAttribute('aria-current')).toBe('page')
    })

    it('says when the filters match nothing, offering to clear them or import', async () => {
      renderLibrary()
      const filters = await screen.findByRole('group', { name: 'Filters' })
      pages['1'] = { ...pages['1'], total: 0, hands: [] }

      await choose(filters, 'Hero', 'Hero')

      expect(await screen.findByText('No hands match these filters.')).toBeTruthy()
      expect(screen.queryByText('Your library is empty. Import your hand histories to keep them here.')).toBeNull()
      expect(screen.queryByRole('region', { name: 'Results' })).toBeNull()
      expect(screen.getAllByRole('button', { name: 'Clear filters' })).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: 'Import hands' })).toHaveLength(2)
    })
  })

  describe('sorting', () => {
    const header = (name: string) => screen.getByRole('columnheader', { name: new RegExp(name) })

    it('sorts by a column from its header, the biggest first and then the other way', async () => {
      renderLibrary()
      await screen.findByRole('table', { name: 'All hands' })
      expect(header('Date').getAttribute('aria-sort')).toBe('descending')

      await userEvent.click(screen.getByRole('button', { name: 'Result' }))

      await waitFor(() => expect(lastFilterQuery()).toBe('sort=result&dir=desc'))
      expect(window.location.search).toBe('?period=all&sort=result&dir=desc')
      expect(header('Result').getAttribute('aria-sort')).toBe('descending')
      expect(header('Date').getAttribute('aria-sort')).toBeNull()

      await userEvent.click(screen.getByRole('button', { name: 'Result' }))

      await waitFor(() => expect(lastFilterQuery()).toBe('sort=result&dir=asc'))
      expect(header('Result').getAttribute('aria-sort')).toBe('ascending')
    })

    it('leaves the address bare again once back on the newest first', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&sort=date&dir=asc')
      await screen.findByRole('table', { name: 'All hands' })
      expect(header('Date').getAttribute('aria-sort')).toBe('ascending')

      await userEvent.click(screen.getByRole('button', { name: 'Date' }))

      expect(window.location.search).toBe('?period=all')
      await waitFor(() => expect(lastFilterQuery()).toBe(''))
    })

    it('sorts only by Date, Stake, Final pot and Result', async () => {
      renderLibrary()
      const table = await screen.findByRole('table', { name: 'All hands' })

      const sortable = within(table)
        .getAllByRole('button')
        .map((button) => button.textContent)
      expect(sortable).toEqual(expect.arrayContaining(['Stake', 'Final pot', 'Result', 'Date']))
      for (const name of ['Hand', 'Hero', 'Ends on', 'Tags']) {
        expect(within(table).queryByRole('button', { name })).toBeNull()
      }
    })

    it('reads the sort back from the address, and keeps it when the filter changes', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&sort=pot&dir=asc')
      const filters = await screen.findByRole('group', { name: 'Filters' })
      expect(lastFilterQuery()).toBe('sort=pot&dir=asc')
      expect(header('Final pot').getAttribute('aria-sort')).toBe('ascending')

      await choose(filters, 'Hero', 'Hero')

      expect(window.location.search).toBe('?period=all&hero=Hero&sort=pot&dir=asc')
      await waitFor(() => expect(lastFilterQuery()).toBe('hero=Hero&sort=pot&dir=asc'))
    })

    it('starts again from the first page with nothing selected', async () => {
      renderLibrary()
      await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
      await screen.findByText('Showing 3–3 of 3')
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select CO vs SB, iMapleAA' }))

      await userEvent.click(screen.getByRole('button', { name: 'Stake' }))

      await screen.findByText('Showing 1–2 of 3')
      expect(new URL(requests.at(-1)!, 'http://localhost').searchParams.get('page')).toBe('1')
      expect(screen.queryByText(/selected/)).toBeNull()
    })

    it('sorts the Library opened from a Room too, keeping the Room in the address', async () => {
      renderLibrary(DEFAULT_PREFERENCES, { code: 'RNT4K9PX', name: 'Martes' })
      await screen.findByRole('table', { name: 'All hands' })

      await userEvent.click(screen.getByRole('button', { name: 'Final pot' }))

      expect(window.location.pathname).toBe('/room/RNT4K9PX/library')
      expect(window.location.search).toBe('?period=all&sort=pot&dir=desc')
    })
  })

  describe('Results Graph', () => {
    const renderGraph = () => renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/graph?period=all')

    it('draws the Results of the same Hands the list shows', async () => {
      renderGraph()
      const graph = await screen.findByRole('region', { name: 'Results' })
      expect(within(graph).getByText('3 hands')).toBeTruthy()
      expect(within(graph).getByText('+3.9 BB')).toBeTruthy()
      expect(resultsRequests).toEqual(['/api/library/results?'])

      const filters = screen.getByRole('group', { name: 'Filters' })
      await choose(filters, 'Poker site', 'PokerStars')
      await choose(filters, 'Stake', 'NL10 EUR')

      expect(resultsRequests.at(-1)).toBe(`/api/library/results?${lastFilterQuery()}`)
      expect(lastFilterQuery()).toBe('site=pokerstars&stake=no-limit%3A5%3A10%3AEUR')
    })

    it('is asked for only in the graph view', async () => {
      renderLibrary()
      await screen.findByRole('table', { name: 'All hands' })
      expect(resultsRequests).toEqual([])

      await userEvent.click(screen.getByRole('radio', { name: 'Graph' }))

      await waitFor(() => expect(resultsRequests).toHaveLength(1))
    })

    it('keeps the side column, whose Marked collection narrows the graph', async () => {
      renderGraph()
      const collections = await screen.findByRole('navigation', { name: 'Collections' })
      await screen.findByRole('region', { name: 'Results' })

      await userEvent.click(within(collections).getByRole('button', { name: /Marked/ }))

      await waitFor(() => expect(resultsRequests.at(-1)).toBe('/api/library/results?marked=true'))
      expect(window.location.pathname).toBe('/library/graph')
    })

    describe('Zoom', () => {
      const zoomedIn = 'Graph zoomed in between hands 1,200 and 1,850'

      it('shows the Zoom the address keeps', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/graph?period=all&site=pokerstars&zoomFrom=1200&zoomTo=1850')

        expect(await screen.findByText(zoomedIn)).toBeTruthy()
        expect(resultsRequests).toEqual(['/api/library/results?site=pokerstars&zoomFrom=1200&zoomTo=1850'])
      })

      it('leaves the Zoom for the whole graph, in place of the address', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/graph?period=all&zoomFrom=1200&zoomTo=1850')
        await screen.findByText(zoomedIn)
        const entries = window.history.length

        await userEvent.click(screen.getByRole('button', { name: 'Back' }))

        expect(window.location.pathname).toBe('/library/graph')
        expect(window.location.search).toBe('?period=all')
        expect(window.history.length).toBe(entries)
        await waitFor(() => expect(resultsRequests.at(-1)).toBe('/api/library/results?'))
        await waitFor(() => expect(screen.queryByText(zoomedIn)).toBeNull())
      })

      it('goes when the filter changes', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/graph?period=all&zoomFrom=1200&zoomTo=1850')
        await screen.findByText(zoomedIn)

        await choose(screen.getByRole('group', { name: 'Filters' }), 'Poker site', 'PokerStars')

        expect(window.location.search).toBe('?period=all&site=pokerstars')
        await waitFor(() => expect(resultsRequests.at(-1)).toBe('/api/library/results?site=pokerstars'))
        expect(screen.queryByText(zoomedIn)).toBeNull()
      })

      it('stays through the list, and is there again on coming back from a Hand', async () => {
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/graph?period=all&zoomFrom=1200&zoomTo=1850')
        await screen.findByText(zoomedIn)

        await userEvent.click(screen.getByRole('radio', { name: 'Hands' }))
        await userEvent.click(await screen.findByRole('link', { name: 'Open BTN vs BB, iMapleAA' }))

        expect(window.location.pathname).toBe('/library/hands/h1')
        const openedFrom = libraryOpenedFrom(window.history.state)
        expect(openedFrom).toBe('/library?period=all&zoomFrom=1200&zoomTo=1850')

        // "Volver" in the replayer steps back to the entry the Hand was opened from.
        await act(async () => {
          window.history.back()
          await new Promise((popped) => window.addEventListener('popstate', popped, { once: true }))
        })
        expect(`${window.location.pathname}${window.location.search}`).toBe(openedFrom)
        await userEvent.click(await screen.findByRole('radio', { name: 'Graph' }))

        expect(await screen.findByText(zoomedIn)).toBeTruthy()
        expect(resultsRequests.at(-1)).toBe('/api/library/results?zoomFrom=1200&zoomTo=1850')
      })

      it('is there again on coming back from a Hand opened from the graph', async () => {
        results = { ...results, points: [{ ...results.points[0], hand: 1850, handId: 'h1' }] }
        // jsdom lays nothing out, so the chart is 600 by 220 pixels: Hand 1,850, the last, is drawn at x = 580.
        vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
        const layout = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 600, height: 220 }))
        onTestFinished(() => layout.mockRestore())
        renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/graph?period=all&zoomFrom=1200&zoomTo=1850')
        await screen.findByText(zoomedIn)

        const chart = document.querySelector('.recharts-wrapper')!
        const mouse = { pointerType: 'mouse', button: 0, clientX: 580, clientY: 100 }
        fireEvent.pointerDown(chart, mouse)
        fireEvent.pointerUp(chart, mouse)

        await waitFor(() => expect(window.location.pathname).toBe('/library/hands/h1'))
        const openedFrom = libraryOpenedFrom(window.history.state)
        expect(openedFrom).toBe('/library/graph?period=all&zoomFrom=1200&zoomTo=1850')
        await act(async () => {
          window.history.back()
          await new Promise((popped) => window.addEventListener('popstate', popped, { once: true }))
        })
        expect(`${window.location.pathname}${window.location.search}`).toBe(openedFrom)
        expect(await screen.findByText(zoomedIn)).toBeTruthy()
      })
    })

    it('draws nothing when no Hand matches, inviting to import instead', async () => {
      pages['1'] = { ...libraryPage({ total: 0, page: 1, pageSize: 50, hands: [] }), counts: { all: 0, marked: 0 } }
      const nothing = { bigBlinds: { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 }, amounts: null }
      results = { hands: 0, currency: null, totals: nothing, start: nothing, zoom: null, rakeGenerated: { bigBlinds: 0, amounts: null }, points: [] }
      renderGraph()

      expect(await screen.findByText('Your library is empty. Import your hand histories to keep them here.')).toBeTruthy()
      await waitFor(() => expect(resultsRequests).toHaveLength(1))
      expect(screen.queryByRole('region', { name: 'Results' })).toBeNull()
      expect(screen.getAllByRole('button', { name: 'Import hands' })).toHaveLength(2)
    })
  })

  describe('Marks', () => {
    it('Marks and unmarks a Hand from its row', async () => {
      renderLibrary()
      const mark = await screen.findByRole('button', { name: 'Mark BTN vs BB, iMapleAA' })
      expect(mark.getAttribute('aria-pressed')).toBe('false')

      await userEvent.click(mark)

      expect(markRequests).toEqual(['PUT /api/library/hands/h1/mark'])
      await waitFor(() => expect(mark.getAttribute('aria-pressed')).toBe('true'))

      await userEvent.click(mark)

      expect(markRequests.at(-1)).toBe('DELETE /api/library/hands/h1/mark')
      await waitFor(() => expect(mark.getAttribute('aria-pressed')).toBe('false'))
    })
  })

  describe('copying a Hand', () => {
    let writeText: ReturnType<typeof vi.fn>
    beforeEach(() => {
      writeText = vi.fn(async () => {})
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    })

    /** The first row, once the list is read. */
    async function firstRow() {
      const table = await screen.findByRole('table', { name: 'All hands' })
      return within(table).getAllByRole('row')[1]
    }

    it('copies a Hand’s Summary from its row’s menu, without opening it', async () => {
      renderLibrary()
      const row = await firstRow()

      await userEvent.click(within(row).getByRole('button', { name: 'Copy BTN vs BB, iMapleAA' }))
      await userEvent.click(within(within(row).getByRole('menu')).getByRole('menuitem', { name: 'Summary' }))

      expect(writeText).toHaveBeenCalledWith('NL10 · Hero BTN')
      expect(new URL(copyRequests[0], 'http://localhost').pathname).toBe('/api/hands/h1/copy')
      expect(copyRequests[0]).toContain('as=summary')
      await waitFor(() => expect(within(row).getByRole('status').textContent).toBe('Hand copied · Summary'))
      expect(within(row).getByRole('button', { name: 'Hand copied · Summary' })).toBeTruthy()
      expect(window.location.pathname).toBe('/library')
      expect(within(row).queryByRole('menu')).toBeNull()
    })

    it('copies the Original from the keyboard', async () => {
      renderLibrary()
      const row = await firstRow()
      const copy = within(row).getByRole('button', { name: 'Copy BTN vs BB, iMapleAA' })
      copy.focus()

      await userEvent.keyboard('{Enter}')
      const summary = within(within(row).getByRole('menu')).getByRole('menuitem', { name: 'Summary' })
      await waitFor(() => expect(document.activeElement).toBe(summary))
      await userEvent.keyboard('{ArrowDown}{Enter}')

      expect(writeText).toHaveBeenCalledWith('PokerStars Hand #1')
      await waitFor(() => expect(within(row).getByRole('status').textContent).toBe('Hand copied · Original'))
      expect(window.location.pathname).toBe('/library')
    })

    it('closes the menu on Escape, back on its button', async () => {
      renderLibrary()
      const row = await firstRow()
      const copy = within(row).getByRole('button', { name: 'Copy BTN vs BB, iMapleAA' })
      copy.focus()

      await userEvent.keyboard('{ArrowDown}')
      expect(within(row).getByRole('menu')).toBeTruthy()
      await userEvent.keyboard('{Escape}')

      expect(within(row).queryByRole('menu')).toBeNull()
      expect(document.activeElement).toBe(copy)
      expect(writeText).not.toHaveBeenCalled()
    })

    it('locks the Original, saying why, for a Hand Runout kept no text of', async () => {
      pages['1'].hands[0] = { ...pages['1'].hands[0], hasHistory: false }
      renderLibrary()
      const row = await firstRow()

      await userEvent.click(within(row).getByRole('button', { name: 'Copy BTN vs BB, iMapleAA' }))
      const original = within(within(row).getByRole('menu')).getByRole('menuitem', {
        name: 'Original. Import the hand again to get the original',
      })
      expect(original.getAttribute('aria-disabled')).toBe('true')
      await userEvent.click(original)

      expect(writeText).not.toHaveBeenCalled()
      expect(copyRequests).toEqual([])
      expect(window.location.pathname).toBe('/library')
    })

    it('unlocks the Original once an import closes, even one that only found it again', async () => {
      pages['1'].hands[0] = { ...pages['1'].hands[0], hasHistory: false }
      renderLibrary()
      await firstRow()
      // Importing it again, as a duplicate, gave the server its text back.
      pages['1'].hands[0] = { ...pages['1'].hands[0], hasHistory: true }

      await userEvent.click(screen.getAllByRole('button', { name: 'Import hands' })[0])
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      const row = await firstRow()
      await waitFor(() => expect(requests).toHaveLength(2))
      await userEvent.click(within(row).getByRole('button', { name: 'Copy BTN vs BB, iMapleAA' }))

      const original = within(within(row).getByRole('menu')).getByRole('menuitem', { name: 'Original' })
      expect(original.getAttribute('aria-disabled')).toBeNull()
    })

    it('says so when the Hand couldn’t be copied', async () => {
      writeText.mockRejectedValue(new Error('denied'))
      renderLibrary()
      const row = await firstRow()

      await userEvent.click(within(row).getByRole('button', { name: 'Copy BTN vs BB, iMapleAA' }))
      await userEvent.click(within(within(row).getByRole('menu')).getByRole('menuitem', { name: 'Summary' }))

      await waitFor(() => expect(within(row).getByRole('status').textContent).toBe('Couldn’t copy the hand'))
    })
  })

  describe('Tags', () => {
    it('shows each Hand’s Tags in its row, and each Tag’s count in the sidebar', async () => {
      renderLibrary()

      const table = await screen.findByRole('table', { name: 'All hands' })
      expect(within(table).getByRole('columnheader', { name: 'Tags' })).toBeTruthy()
      const [tagged, untagged] = within(table).getAllByRole('row').slice(1)
      expect(within(tagged).getByText('All-in')).toBeTruthy()
      expect(within(tagged).getByText('Multiway')).toBeTruthy()
      expect(within(untagged).queryByText('Multiway')).toBeNull()
      const tags = screen.getByRole('group', { name: 'Tags' })
      expect(within(tags).getByRole('button', { name: /Multiway/ }).textContent).toContain('2')
      expect(within(tags).getByRole('button', { name: /All-in/ }).textContent).toContain('1')
    })

    it('filters by any of the Tags chosen in the sidebar, list and graph alike', async () => {
      renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/graph?period=all')
      const tags = await screen.findByRole('group', { name: 'Tags' })
      const multiway = within(tags).getByRole('button', { name: /Multiway/ })

      await userEvent.click(multiway)
      await userEvent.click(within(tags).getByRole('button', { name: /All-in/ }))

      expect(lastFilterQuery()).toBe('tag=t2&tag=t1')
      expect(resultsRequests.at(-1)).toBe('/api/library/results?tag=t2&tag=t1')
      expect(multiway.getAttribute('aria-pressed')).toBe('true')

      await userEvent.click(multiway)

      expect(lastFilterQuery()).toBe('tag=t1')
      expect(multiway.getAttribute('aria-pressed')).toBe('false')
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(new URL(requests.at(-1)!, 'http://localhost').searchParams.getAll('tag')).toEqual([])
    })

    it('creates a Tag, saying why when the server refuses it', async () => {
      renderLibrary()
      const tags = await screen.findByRole('group', { name: 'Tags' })
      tagReply = () => Response.json({ reason: 'tag-name-taken' }, { status: 409 })

      await userEvent.click(within(tags).getByRole('button', { name: 'New tag' }))
      await userEvent.type(within(tags).getByRole('textbox', { name: 'Tag name' }), 'multiway{Enter}')

      expect(tagRequests).toEqual(['POST /api/library/tags {"name":"multiway"}'])
      expect(await within(tags).findByText('You already have a tag with that name.')).toBeTruthy()

      tagReply = () => Response.json({ id: 't3', name: '3-bet pots', hands: 0 })
      const reads = requests.length
      const name = within(tags).getByRole('textbox', { name: 'Tag name' })
      await userEvent.clear(name)
      await userEvent.type(name, '3-bet pots{Enter}')

      // Read again, so the new Tag is listed with the others.
      await waitFor(() => expect(requests.length).toBeGreaterThan(reads))
      expect(within(tags).queryByRole('textbox', { name: 'Tag name' })).toBeNull()
    })

    it('renames and deletes Tags while editing them', async () => {
      renderLibrary()
      const tags = await screen.findByRole('group', { name: 'Tags' })

      await userEvent.click(within(tags).getByRole('button', { name: 'Edit tags' }))
      const name = within(tags).getByRole('textbox', { name: 'Rename Multiway' })
      await userEvent.clear(name)
      await userEvent.type(name, 'Multiway pots{Enter}')

      expect(tagRequests).toEqual(['PATCH /api/library/tags/t2 {"name":"Multiway pots"}'])

      await userEvent.click(within(tags).getByRole('button', { name: 'Delete All-in' }))
      // Deleting asks first: it takes the Tag off every Hand that carries it.
      expect(tagRequests).toHaveLength(1)
      await userEvent.click(within(tags).getByRole('button', { name: 'Delete All-in from 1 hand' }))

      expect(tagRequests.at(-1)).toBe('DELETE /api/library/tags/t1')
      await userEvent.click(within(tags).getByRole('button', { name: 'Done' }))
      expect(within(tags).queryByRole('textbox')).toBeNull()
    })

    it('attaches and detaches Tags on the selected Hands', async () => {
      pages['1'].hands[1] = { ...pages['1'].hands[1], tags: [{ id: 't2', name: 'Multiway' }] }
      renderLibrary()
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select BTN vs BB, iMapleAA' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select BTN vs BB, Hero' }))
      expect(screen.getByRole('heading', { name: 'All hands' }).nextElementSibling?.textContent).toBe('3 hands · 2 selected')

      await userEvent.click(screen.getByRole('button', { name: 'Tag the selected hands' }))
      const menu = screen.getByRole('group', { name: 'Tag the selected hands' })
      const allIn = within(menu).getByRole('checkbox', { name: 'All-in' }) as HTMLInputElement
      const multiway = within(menu).getByRole('checkbox', { name: 'Multiway' }) as HTMLInputElement
      // Only one of them carries All-in; both carry Multiway.
      expect(allIn.indeterminate).toBe(true)
      expect(multiway.checked).toBe(true)

      await userEvent.click(multiway)
      await userEvent.click(allIn)

      expect(tagRequests).toEqual([
        'DELETE /api/library/tags/t2/hands {"handIds":["h1","h2"]}',
        'PUT /api/library/tags/t1/hands {"handIds":["h1","h2"]}',
      ])

      tagReply = () => Response.json({ reason: 'tag-not-found' }, { status: 404 })
      await userEvent.click(within(menu).getByRole('checkbox', { name: 'Multiway' }))

      expect(await within(menu).findByText('That tag no longer exists.')).toBeTruthy()
    })

    it('selects every Hand of the page at once, and forgets the selection when the Hands change', async () => {
      renderLibrary()
      const all = await screen.findByRole('checkbox', { name: 'Select every hand on this page' })

      await userEvent.click(all)

      expect(screen.getByRole('checkbox', { name: 'Select BTN vs BB, Hero' })).toHaveProperty('checked', true)
      expect(screen.getByRole('heading', { name: 'All hands' }).nextElementSibling?.textContent).toBe('3 hands · 2 selected')

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

      await screen.findByText('Showing 3–3 of 3')
      expect(screen.queryByRole('button', { name: 'Tag the selected hands' })).toBeNull()
      expect(screen.getByRole('heading', { name: 'All hands' }).nextElementSibling?.textContent).toBe('3 hands')
    })
  })

  describe('removing Hands', () => {
    it('removes the selected Hands of a filtered list once confirmed, and reads the Library again', async () => {
      renderLibrary()
      await userEvent.click(await screen.findByRole('button', { name: /Marked/ }))
      await waitFor(() => expect(lastFilterQuery()).toBe('marked=true'))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select BTN vs BB, iMapleAA' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select BTN vs BB, Hero' }))

      await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
      const dialog = screen.getByRole('dialog', { name: 'Remove 2 hands from your library?' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      expect(removeRequests).toEqual([])
      expect(screen.queryByRole('dialog')).toBeNull()

      const reads = requests.length
      await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
      await userEvent.click(
        within(screen.getByRole('dialog', { name: 'Remove 2 hands from your library?' })).getByRole('button', {
          name: 'Remove 2 hands',
        }),
      )

      expect(removeRequests).toEqual(['DELETE /api/library/hands {"handIds":["h1","h2"]}'])
      await waitFor(() => expect(requests.length).toBe(reads + 1))
      expect(lastFilterQuery()).toBe('marked=true')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    })

    it('stays on the page it emptied while later Hands move up into it', async () => {
      pages['1'] = { ...pages['1'], total: 5 }
      pages['2'] = { ...pages['2'], total: 5, hands: [libraryHand('h3'), libraryHand('h4', { hero: 'Hero' })] }
      pages['3'] = libraryPage({ total: 5, page: 3, pageSize: 2, hands: [libraryHand('h5')] })
      renderLibrary()
      await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
      await screen.findByText('Showing 3–4 of 5')
      const pageOf = (url: string | undefined) => new URL(url!, 'http://localhost').searchParams.get('page')
      const removeEveryHand = async (count: number) => {
        await userEvent.click(screen.getByRole('checkbox', { name: 'Select every hand on this page' }))
        await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
        await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: `Remove ${count} hands` }))
      }

      // Page 3's Hand moves up into page 2.
      pages['2'] = { ...pages['3'], total: 3, page: 2 }
      const reads = requests.length
      await removeEveryHand(2)
      await waitFor(() => expect(requests.length).toBe(reads + 1))
      expect(pageOf(requests.at(-1))).toBe('2')
    })

    it('steps back a page when the one shown no longer exists', async () => {
      renderLibrary()
      await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
      await screen.findByText('Showing 3–3 of 3')
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select CO vs SB, iMapleAA' }))

      await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove 1 hand' }))

      await waitFor(() => expect(new URL(requests.at(-1)!, 'http://localhost').searchParams.get('page')).toBe('1'))
    })

    it('says that only this Library loses the Hand', async () => {
      renderLibrary()
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select BTN vs BB, Hero' }))

      await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

      const dialog = screen.getByRole('dialog', { name: 'Remove 1 hand from your library?' })
      expect(within(dialog).getByText(/stays in other players’ libraries/)).toBeTruthy()
    })

    it('says why when the server refuses, reading the Library again and keeping the selection', async () => {
      removeReply = () => Response.json({ reason: 'hand-not-found' }, { status: 404 })
      renderLibrary()
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select BTN vs BB, Hero' }))
      const reads = requests.length

      await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove 1 hand' }))

      expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeTruthy()
      // Read again, in case a selected Hand already left the Library elsewhere.
      await waitFor(() => expect(requests.length).toBe(reads + 1))
      expect(screen.getByRole('checkbox', { name: 'Select BTN vs BB, Hero' })).toHaveProperty('checked', true)
    })
  })

  describe('picking Hands for a Room', () => {
    const room = { code: 'RNT4K9PX', name: 'Martes NL50' }

    it('leads back to the Room it was opened from', async () => {
      renderLibrary(DEFAULT_PREFERENCES, room)

      const back = await screen.findByRole('link', { name: 'Back to Martes NL50' })
      expect(back.getAttribute('href')).toBe('/room/RNT4K9PX')
    })

    it('adds the selected Hands to the Room\u2019s Queue, then goes back to the Room', async () => {
      renderLibrary(DEFAULT_PREFERENCES, room)
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select BTN vs BB, iMapleAA' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select BTN vs BB, Hero' }))

      await userEvent.click(screen.getByRole('button', { name: 'Add 2 to the room' }))

      expect(addRequests).toEqual(['POST /api/rooms/RNT4K9PX/library-hands {"handIds":["h1","h2"]}'])
      await waitFor(() => expect(window.location.pathname).toBe('/room/RNT4K9PX'))
    })

    it('says why when the server refuses, staying in the Library', async () => {
      addReply = () => Response.json({ reason: 'hand-not-found' }, { status: 404 })
      renderLibrary(DEFAULT_PREFERENCES, room)
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select BTN vs BB, iMapleAA' }))

      await userEvent.click(screen.getByRole('button', { name: 'Add 1 to the room' }))

      expect(await screen.findByRole('alert')).toBeTruthy()
      expect(window.location.pathname).toBe('/room/RNT4K9PX/library')
    })

    it('shows only the list, with no view to switch to', async () => {
      renderLibrary(DEFAULT_PREFERENCES, room)

      expect(await screen.findByRole('table', { name: 'All hands' })).toBeTruthy()
      expect(screen.queryByRole('radiogroup', { name: 'View' })).toBeNull()
      expect(screen.queryByRole('region', { name: 'Results' })).toBeNull()
    })

    it('keeps its filter in the address too', async () => {
      renderLibrary(DEFAULT_PREFERENCES, room)
      const filters = await screen.findByRole('group', { name: 'Filters' })

      await choose(filters, 'Hero', 'Hero')

      expect(window.location.pathname).toBe('/room/RNT4K9PX/library')
      expect(window.location.search).toBe('?period=all&hero=Hero')
    })

    it('offers Más filtros, keeping the Room in the address, and adds Hands from the list it keeps', async () => {
      renderLibrary(DEFAULT_PREFERENCES, room)
      const filters = await screen.findByRole('group', { name: 'Filters' })

      await userEvent.click(within(filters).getByRole('button', { name: /^More filters/ }))
      const panel = screen.getByRole('dialog', { name: 'More filters' })
      await userEvent.click(within(within(panel).getByRole('group', { name: 'Pot type' })).getByRole('button', { name: '3-bet' }))
      await userEvent.click(within(panel).getByRole('button', { name: 'Done' }))

      expect(window.location.pathname).toBe('/room/RNT4K9PX/library')
      expect(window.location.search).toBe('?period=all&fact=pot-type%3A3-bet')
      expect(lastFilterQuery()).toBe('fact=pot-type%3A3-bet')
      expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe('3-bet pot')

      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select BTN vs BB, iMapleAA' }))
      await userEvent.click(screen.getByRole('button', { name: 'Add 1 to the room' }))

      expect(addRequests).toEqual(['POST /api/rooms/RNT4K9PX/library-hands {"handIds":["h1"]}'])
      await waitFor(() => expect(window.location.pathname).toBe('/room/RNT4K9PX'))
    })

    it('reads Más filtros from the Room’s address, as one chip', async () => {
      renderLibrary(DEFAULT_PREFERENCES, room, '/room/RNT4K9PX/library?period=all&fact=pot-type:3-bet')
      const filters = await screen.findByRole('group', { name: 'Filters' })

      expect(within(filters).getByRole('button', { name: /^More filters: / }).textContent).toBe('3-bet pot')
      expect(lastFilterQuery()).toBe('fact=pot-type%3A3-bet')
    })

    it('offers no Room to add to when opened on its own', async () => {
      renderLibrary()
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select BTN vs BB, iMapleAA' }))

      expect(screen.queryByRole('button', { name: /to the room/ })).toBeNull()
      expect(screen.queryByRole('link', { name: /Back to/ })).toBeNull()
    })
  })
})

describe('LibraryPage · Bulk Imports', () => {
  const banner = () => screen.queryByRole('status', { name: 'Import in progress' })

  it('says in every view that an import is running, that the graph and stats may be incomplete, and leads to the Imports', async () => {
    for (const path of ['/library?period=all', '/library/graph?period=all', '/library/stats?period=all']) {
      renderLibrary(DEFAULT_PREFERENCES, undefined, path)
      await waitFor(() => expect(banner()).toBeTruthy())
      expect(banner()!.textContent).toContain(
        'Import in progress: 412,000 of 1,240,000 hands. The graph and stats may be incomplete until it ends.',
      )
      cleanup()
    }

    renderLibrary()
    const shown = await screen.findByRole('status', { name: 'Import in progress' })
    await userEvent.click(within(shown).getByRole('link', { name: 'See imports' }))

    expect(window.location.pathname).toBe('/library/imports')
    expect(await screen.findByRole('table', { name: 'Imports' })).toBeTruthy()
  })

  it('says so before the files are counted too', async () => {
    bulkImports = [runningImport({ status: 'waiting', total: null, processed: 0 })]
    renderLibrary()

    await waitFor(() => expect(banner()?.textContent).toContain('Import in progress. The graph and stats may be incomplete'))
  })

  it('says an import is paused, counted or not yet', async () => {
    const paused = () => screen.queryByRole('status', { name: 'Import paused' })
    bulkImports = [runningImport({ status: 'paused', total: null, processed: 0 })]
    renderLibrary()

    await waitFor(() => expect(paused()?.textContent).toContain('Import paused. The graph and stats may be incomplete'))
    expect(banner()).toBeNull()
    cleanup()

    bulkImports = [runningImport({ status: 'paused' })]
    renderLibrary()

    await waitFor(() => expect(paused()?.textContent).toContain('Import paused: 412,000 of 1,240,000 hands.'))
  })

  it('shows no banner, and does not keep asking, while an import is still uploading', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    bulkImports = [runningImport({ status: 'uploading', total: null, processed: 0 })]
    renderLibrary()
    await screen.findByRole('table', { name: 'All hands' })
    const asked = () => (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/library/bulk-imports').length
    await waitFor(() => expect(asked()).toBe(1))

    await act(() => vi.advanceTimersByTimeAsync(BULK_IMPORTS_POLL_MS * 3))

    expect(banner()).toBeNull()
    expect(asked()).toBe(1)
  })

  it('shows no banner once every import has ended', async () => {
    bulkImports = [runningImport({ status: 'completed', finishedAt: '2026-11-02T12:00:00.000Z' })]
    renderLibrary()
    await screen.findByRole('table', { name: 'All hands' })

    expect(banner()).toBeNull()
  })

  it('follows an import’s progress without reloading, and stops asking once it has ended', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/imports?period=all')
    const table = await screen.findByRole('table', { name: 'Imports' })
    expect(within(table).getByRole('row', { name: /pt4-export/ }).textContent).toContain('412,000 of 1,240,000')

    bulkImports = [runningImport({ processed: 413000 })]
    await act(() => vi.advanceTimersByTimeAsync(BULK_IMPORTS_POLL_MS))
    await waitFor(() => expect(within(table).getByRole('row', { name: /pt4-export/ }).textContent).toContain('413,000 of 1,240,000'))
    expect(banner()!.textContent).toContain('413,000 of 1,240,000')

    bulkImports = [runningImport({ status: 'completed', processed: 1240000, imported: 1240000, finishedAt: '2026-11-02T12:00:00.000Z' })]
    await act(() => vi.advanceTimersByTimeAsync(BULK_IMPORTS_POLL_MS))
    await waitFor(() => expect(banner()).toBeNull())
    expect(within(table).getByRole('row', { name: /pt4-export/ }).textContent).toContain('Completed')
    const asked = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/library/bulk-imports').length

    await act(() => vi.advanceTimersByTimeAsync(BULK_IMPORTS_POLL_MS * 3))
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === '/api/library/bulk-imports').length).toBe(asked)
  })

  it('cancels an import, which then shows as cancelled', async () => {
    renderLibrary(DEFAULT_PREFERENCES, undefined, '/library/imports?period=all')
    const table = await screen.findByRole('table', { name: 'Imports' })

    await userEvent.click(within(table).getByRole('button', { name: 'Cancel' }))

    expect(bulkImportRequests).toEqual(['POST /api/library/bulk-imports/b1/cancel'])
    await waitFor(() => expect(within(table).getByRole('row', { name: /pt4-export/ }).textContent).toContain('Cancelled by you'))
    expect(banner()).toBeNull()
  })

  it('shows no banner in the Library opened from a Room', async () => {
    renderLibrary(DEFAULT_PREFERENCES, { code: 'RNT4K9PX', name: 'Martes' })
    await screen.findByRole('table', { name: 'All hands' })

    expect(banner()).toBeNull()
  })
})

describe('LibraryPage \u00b7 replaying several Hands', () => {
  it('replays the selected Hands, in the order the Library shows them', async () => {
    renderLibrary()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select BTN vs BB, Hero' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select BTN vs BB, iMapleAA' }))

    await userEvent.click(screen.getByRole('button', { name: 'Play 2 hands' }))

    expect(window.location.pathname + window.location.search).toBe('/library/hands/h1?replay=h1,h2')
    expect(window.history.state).toEqual(expect.objectContaining({ openedFromLibrary: '/library?period=all' }))
    expect(handIdsRequests).toEqual([])
  })

  it('replays every Hand the filter keeps, across its pages, with nothing selected', async () => {
    renderLibrary(DEFAULT_PREFERENCES, undefined, '/library?period=all&site=pokerstars&page=2')
    await screen.findByRole('checkbox', { name: 'Select CO vs SB, iMapleAA' })

    await userEvent.click(screen.getByRole('button', { name: 'Play' }))

    await vi.waitFor(() => expect(window.location.pathname).toBe('/library/hands/h1'))
    expect(window.location.search).toBe('?replay=filter&period=all&site=pokerstars')
    expect(new URL(handIdsRequests[0], 'http://localhost').searchParams.get('site')).toBe('pokerstars')
  })
})

describe('LibraryPage \u00b7 a Plan\'s limit', () => {
  const beta: Partial<Identity> = { plan: 'beta', libraryLimit: 20_000 }
  const libraryMeter = () => screen.queryByRole('meter', { name: 'Beta plan' })

  it('shows a Beta how many Hands its Library holds of the most its Plan allows', async () => {
    pages['1'] = { ...pages['1'], counts: { all: 12_340, marked: 1 } }
    renderLibrary(DEFAULT_PREFERENCES, undefined, undefined, beta)

    const meter = await screen.findByRole('meter', { name: 'Beta plan' })
    expect(meter.textContent).toBe('Beta plan12,340 / 20,000')
    expect(meter.getAttribute('aria-valuetext')).toBe('12,340 of 20,000 hands')
    expect(meter.querySelector('[data-reached]')).toBeNull()
  })

  it('shows a Library at or past its limit in the alert colour', async () => {
    pages['1'] = { ...pages['1'], counts: { all: 21_400, marked: 1 } }
    renderLibrary(DEFAULT_PREFERENCES, undefined, undefined, beta)

    const meter = await screen.findByRole('meter', { name: 'Beta plan' })
    expect(meter.textContent).toBe('Beta plan21,400 / 20,000')
    expect(meter.querySelector('[data-reached]')).not.toBeNull()
  })

  it('shows nothing new to a Pro, nor to an Administrator acting as themselves', async () => {
    renderLibrary(DEFAULT_PREFERENCES, undefined, undefined, { plan: 'pro' })
    await screen.findByRole('table', { name: 'All hands' })
    expect(libraryMeter()).toBeNull()
    cleanup()

    renderLibrary(DEFAULT_PREFERENCES, undefined, undefined, { plan: 'beta', administrator: true })
    await screen.findByRole('table', { name: 'All hands' })
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('follows the Library after Hands are removed', async () => {
    pages['1'] = { ...pages['1'], counts: { all: 12_340, marked: 1 } }
    renderLibrary(DEFAULT_PREFERENCES, undefined, undefined, beta)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select BTN vs BB, iMapleAA' }))
    pages['1'] = { ...pages['1'], counts: { all: 12_339, marked: 1 } }

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove 1 hand' }))

    await waitFor(() => expect(libraryMeter()?.textContent).toBe('Beta plan12,339 / 20,000'))
  })
})
