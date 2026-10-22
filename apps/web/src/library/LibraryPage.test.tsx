import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { PreferencesContext } from '../preferences/context'
import { DEFAULT_PREFERENCES, type Preferences } from '../preferences/preferences'
import { fakeSession } from '../test/fakeSession'
import type { LibraryHand, LibraryPage as Page } from './library'
import { LibraryPage } from './LibraryPage'
import type { Results } from './results'

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
  summary: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river', showdown: true },
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
/** Mark changes, as `PUT /api/library/hands/h1/mark`. */
let markRequests: string[]
/** Tag changes, as `PUT /api/library/tags/t1/hands {"handIds":["h1"]}`. */
let tagRequests: string[]
/** What the server answers a Tag change with, unless the test says otherwise. */
let tagReply: () => Response
/** Removals, as `DELETE /api/library/hands {"handIds":["h1"]}`. */
let removeRequests: string[]
/** What the server answers a removal with, unless the test says otherwise. */
let removeReply: () => Response

beforeEach(() => {
  requests = []
  resultsRequests = []
  markRequests = []
  tagRequests = []
  tagReply = () => Response.json({})
  removeRequests = []
  removeReply = () => Response.json({})
  results = {
    hands: 3,
    currency: 'EUR',
    totals: { bigBlinds: { result: 3.9, allInEv: 2.5, showdown: 4.9, nonShowdown: -1 }, amounts: { result: 39, allInEv: 25, showdown: 49, nonShowdown: -10 } },
    points: [{ hand: 3, bigBlinds: { result: 3.9, allInEv: 2.5, showdown: 4.9, nonShowdown: -1 }, amounts: { result: 39, allInEv: 25, showdown: 49, nonShowdown: -10 } }],
  }
  pages = {
    '1': libraryPage({ total: 3, page: 1, pageSize: 2, hands: [libraryHand('h1', { tags: [{ id: 't1', name: 'All-in' }, { id: 't2', name: 'Multiway' }] }), libraryHand('h2', { hero: 'Hero', site: 'coinpoker', result: -10 })] }),
    '2': libraryPage({ total: 3, page: 2, pageSize: 2, hands: [libraryHand('h3', { summary: { positions: ['CO', 'SB'], finalPot: 30, finalStreet: 'flop', showdown: false } })] }),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url.startsWith('/api/library/tags')) {
        tagRequests.push(`${method} ${url}${init?.body ? ` ${String(init.body)}` : ''}`)
        return tagReply()
      }
      if (method === 'DELETE' && url === '/api/library/hands') {
        removeRequests.push(`${method} ${url} ${String(init?.body)}`)
        return removeReply()
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
      if (url.startsWith('/api/library/results')) {
        resultsRequests.push(url)
        return Response.json(results)
      }
      requests.push(url)
      const page = new URL(url, 'http://localhost').searchParams.get('page') ?? '1'
      return Response.json(pages[page])
    }),
  )
})

/** The query of the last list read, without its paging. */
function lastFilterQuery(): string {
  const query = new URL(requests.at(-1)!, 'http://localhost').searchParams
  query.delete('page')
  query.delete('pageSize')
  return query.toString()
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.pushState(null, '', '/')
})

function renderLibrary(preferences: Preferences = DEFAULT_PREFERENCES) {
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={fakeSession()}>
        <PreferencesContext.Provider value={preferences}>
          <LibraryPage />
        </PreferencesContext.Provider>
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
    pages['1'] = { ...libraryPage({ total: 0, page: 1, pageSize: 50, hands: [] }), counts: { all: 0, marked: 0 } }
    renderLibrary()

    expect(await screen.findByText('Your library is empty. Import your hand histories to keep them here.')).toBeTruthy()
    await userEvent.click(screen.getAllByRole('button', { name: 'Import hands' })[0])

    expect(screen.getByRole('heading', { name: 'Import hands into your library' })).toBeTruthy()
  })

  describe('filters', () => {
    it('offers only the Poker Sites, Heroes and Stakes the Library holds', async () => {
      renderLibrary()
      const filters = await screen.findByRole('group', { name: 'Filters' })

      const optionsOf = (name: string) =>
        within(within(filters).getByRole('combobox', { name })).getAllByRole('option').map((option) => option.textContent)
      expect(optionsOf('Poker site')).toEqual(['All sites', 'CoinPoker', 'PokerStars'])
      expect(optionsOf('Hero')).toEqual(['All heroes', 'Hero', 'iMapleAA'])
      // Two Stakes that read alike say their currency.
      expect(optionsOf('Stake')).toEqual(['All stakes', 'NL10 EUR', 'NL10 USDT', 'NL50'])
    })

    it('combines the filters, going back to the first page, and one action clears them all', async () => {
      renderLibrary()
      await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
      await screen.findByText('Showing 3–3 of 3')
      const filters = screen.getByRole('group', { name: 'Filters' })

      await userEvent.selectOptions(within(filters).getByRole('combobox', { name: 'Poker site' }), 'PokerStars')
      await userEvent.selectOptions(within(filters).getByRole('combobox', { name: 'Hero' }), 'iMapleAA')
      await userEvent.selectOptions(within(filters).getByRole('combobox', { name: 'Stake' }), 'NL10 EUR')

      expect(lastFilterQuery()).toBe('site=pokerstars&hero=iMapleAA&stake=no-limit%3A5%3A10%3AEUR')
      expect(new URL(requests.at(-1)!, 'http://localhost').searchParams.get('page')).toBe('1')

      await userEvent.click(within(filters).getByRole('button', { name: 'Clear filters' }))

      expect(lastFilterQuery()).toBe('')
      expect((within(filters).getByRole('combobox', { name: 'Poker site' }) as HTMLSelectElement).value).toBe('')
      expect((within(filters).getByRole('combobox', { name: 'Hero' }) as HTMLSelectElement).value).toBe('')
    })

    it('narrows the period to a quick range of the viewer’s days', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 21, 15, 30))
      try {
        renderLibrary()
        const filters = await screen.findByRole('group', { name: 'Filters' })

        await userEvent.selectOptions(within(filters).getByRole('combobox', { name: 'Period' }), 'Last 7 days')

        expect((within(filters).getByLabelText('From') as HTMLInputElement).value).toBe('2026-10-15')
        expect((within(filters).getByLabelText('To') as HTMLInputElement).value).toBe('2026-10-21')
        const query = new URL(requests.at(-1)!, 'http://localhost').searchParams
        expect(query.get('from')).toBe(new Date(2026, 9, 15).toISOString())
        expect(query.get('to')).toBe(new Date(2026, 9, 22).toISOString())
      } finally {
        vi.useRealTimers()
      }
    })

    it('takes any from and to dates, and calls them a custom period', async () => {
      renderLibrary()
      const filters = await screen.findByRole('group', { name: 'Filters' })

      fireEvent.change(within(filters).getByLabelText('From'), { target: { value: '2026-09-01' } })

      expect(new URL(requests.at(-1)!, 'http://localhost').searchParams.get('from')).toBe(new Date(2026, 8, 1).toISOString())
      expect(lastFilterQuery()).not.toContain('to=')
      expect((within(filters).getByRole('combobox', { name: 'Period' }) as HTMLSelectElement).value).toBe('custom')
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

      await userEvent.selectOptions(within(filters).getByRole('combobox', { name: 'Hero' }), 'Hero')

      expect(await screen.findByText('No hands match these filters.')).toBeTruthy()
      expect(screen.queryByText('Your library is empty. Import your hand histories to keep them here.')).toBeNull()
      expect(screen.queryByRole('region', { name: 'Results' })).toBeNull()
      expect(screen.getAllByRole('button', { name: 'Clear filters' })).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: 'Import hands' })).toHaveLength(2)
    })
  })

  describe('Results Graph', () => {
    it('draws the Results of the same Hands the list shows', async () => {
      renderLibrary()
      const graph = await screen.findByRole('region', { name: 'Results' })
      expect(within(graph).getByText('3 hands')).toBeTruthy()
      expect(within(graph).getByText('+3.9 BB')).toBeTruthy()
      expect(resultsRequests).toEqual(['/api/library/results?'])

      const filters = screen.getByRole('group', { name: 'Filters' })
      await userEvent.selectOptions(within(filters).getByRole('combobox', { name: 'Poker site' }), 'PokerStars')
      await userEvent.selectOptions(within(filters).getByRole('combobox', { name: 'Stake' }), 'NL10 EUR')

      expect(resultsRequests.at(-1)).toBe(`/api/library/results?${lastFilterQuery()}`)
      expect(lastFilterQuery()).toBe('site=pokerstars&stake=no-limit%3A5%3A10%3AEUR')
    })

    it('reads the Results again only when the Hands change, not the page', async () => {
      renderLibrary()
      await screen.findByRole('region', { name: 'Results' })

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
      await screen.findByText('Showing 3–3 of 3')
      expect(resultsRequests).toHaveLength(1)

      await userEvent.click(screen.getByRole('button', { name: 'Mark CO vs SB, iMapleAA' }))
      await waitFor(() => expect(resultsRequests).toHaveLength(2))
    })

    it('draws nothing when no Hand matches, inviting to import instead', async () => {
      pages['1'] = { ...libraryPage({ total: 0, page: 1, pageSize: 50, hands: [] }), counts: { all: 0, marked: 0 } }
      results = { hands: 0, currency: null, totals: { bigBlinds: { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 }, amounts: null }, points: [] }
      renderLibrary()

      expect(await screen.findByText('Your library is empty. Import your hand histories to keep them here.')).toBeTruthy()
      await waitFor(() => expect(resultsRequests).toHaveLength(1))
      expect(screen.queryByRole('region', { name: 'Results' })).toBeNull()
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
      renderLibrary()
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
      expect(lastFilterQuery()).toBe('')
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
})
