import { equity, type EquityRequest } from '@runout/poker'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { Locale } from '../i18n/catalogue'
import { SessionContext } from '../identity/context'
import { navigate } from '../routing'
import { fakeSession } from '../test/fakeSession'
import { LabAnalysisPage } from './LabAnalysisPage'

interface StoredRange {
  id: string
  name: string
  combos: Record<string, number>
}

/** The Account's Ranges as the faked server keeps them. */
let stored: StoredRange[]
/** Writes, as `POST /api/lab/ranges {"name":"OR","combos":{},"tagIds":[]}`: the Analysis should make none. */
let writes: string[]

const aces = { AsAh: 100, AsAd: 100, AsAc: 100, AhAd: 100, AhAc: 100, AdAc: 100 }

/** How many batches the fake worker streams before it stops, unless the Equity is exact. */
const FAKE_BATCHES = 3

/**
 * The Equity worker, run in place: each request's batches are posted before
 * `postMessage` returns, tagged as the real one tags them.
 */
class SyncEquityWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  postMessage({ id, request }: { id: number; request: EquityRequest }) {
    let batch = 0
    for (const result of equity(request, { seed: 1 })) {
      this.onmessage?.({ data: { id, result } } as MessageEvent)
      if (result.exact || ++batch === FAKE_BATCHES) break
    }
  }
  terminate() {}
}

beforeEach(() => {
  vi.stubGlobal('Worker', SyncEquityWorker)
  stored = [
    { id: 'r1', name: 'OR BTN', combos: aces },
    { id: 'r2', name: '3B BB', combos: {} },
  ]
  writes = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const id = /^\/api\/lab\/ranges\/(.+)$/.exec(url)?.[1]
      if (method === 'GET' && url === '/api/lab/ranges') {
        const summaries = stored.map(({ id, name, combos }) => {
          const comboCount = Object.values(combos).reduce((sum, value) => sum + value, 0) / 100
          return { id, name, comboCount, percent: (comboCount / 1326) * 100, tags: [] }
        })
        return Response.json(summaries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())))
      }
      if (method === 'GET') {
        const range = stored.find((each) => each.id === id)
        return range ? Response.json({ ...range, tags: [] }) : Response.json({ reason: 'range-not-found' }, { status: 404 })
      }
      // The Analysis never writes a Range: any write is recorded, and refused.
      writes.push(`${method} ${url} ${String(init?.body)}`)
      return Response.json({ reason: 'internal' }, { status: 500 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

function renderAnalysis(locale: Locale = 'en', address = '/lab/analysis') {
  window.history.replaceState(null, '', address)
  return render(
    <I18nProvider initialLocale={locale}>
      <SessionContext.Provider value={fakeSession()}>
        <LabAnalysisPage />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

const labNav = () => screen.getByRole('navigation', { name: 'Lab' })

describe('LabAnalysisPage · the Lab sub-navigation', () => {
  it('leads to Analysis and Ranges, in that order, marking Analysis', () => {
    renderAnalysis()

    const links = within(labNav()).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href'), link.getAttribute('aria-current')])).toEqual([
      ['Analysis', '/lab/analysis', 'page'],
      ['Ranges', '/lab/ranges', null],
    ])
  })

  it('is in Spanish too', () => {
    renderAnalysis('es')

    const nav = screen.getByRole('navigation', { name: 'Laboratorio' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Análisis', 'Rangos'])
  })
})

const matrix = () => screen.getByRole('group', { name: 'Range matrix' })
const cell = (name: string) => within(matrix()).getByRole('button', { name })
const pressed = () =>
  within(matrix())
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.getAttribute('aria-label'))
/** The width numbers as one line of text, as read block by block, spaces collapsed. */
const statsText = () =>
  Array.from(screen.getByRole('region', { name: 'Range stats' }).querySelectorAll('p, dt, dd'), (block) => block.textContent!.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
/** What the address holds, as `{ range: 'AKs', source: 'r1' }`. */
const address = () => Object.fromEntries(new URLSearchParams(window.location.search))

describe('LabAnalysisPage · painting the Range', () => {
  it('opens on an empty Range', () => {
    renderAnalysis()

    expect(pressed()).toEqual([])
    expect(statsText()).toMatch(/^0\.0 % of all combos 0\.0 of 1326 combos/)
  })

  it("paints with the brush, updating the Range's width as it goes", async () => {
    renderAnalysis()

    await userEvent.click(cell('AKs'))
    await userEvent.click(screen.getByRole('radio', { name: '50 %' }))
    await userEvent.click(cell('QQ'))

    expect(pressed()).toEqual(['AKs', 'QQ'])
    expect(statsText()).toBe(
      '0.5 % of all combos 7.0 of 1326 combos ' +
        'Pairs 3.0 / 78 42.9 % of the range Suited 4.0 / 312 57.1 % of the range Offsuit 0.0 / 936 0.0 % of the range',
    )
  })

  it('clears the Range', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CAKs')

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(pressed()).toEqual([])
    await waitFor(() => expect(address()).toEqual({}))
  })
})

describe('LabAnalysisPage · the address', () => {
  it('carries the Range as text, replacing the address rather than pushing one', async () => {
    renderAnalysis()
    const entries = window.history.length

    await userEvent.click(cell('AKs'))
    await userEvent.click(cell('AA'))

    await waitFor(() => expect(address()).toEqual({ range: 'AA,AKs' }))
    expect(window.location.pathname).toBe('/lab/analysis')
    expect(window.history.length).toBe(entries)
  })

  it('writes the address once for a burst of painting, as browsers limit how often it may change', async () => {
    renderAnalysis()
    const replaceState = vi.spyOn(window.history, 'replaceState')

    for (const name of ['AA', 'KK', 'QQ', 'JJ', 'TT']) await userEvent.click(cell(name))

    await waitFor(() => expect(address()).toEqual({ range: 'TT+' }))
    expect(replaceState).toHaveBeenCalledTimes(1)
  })

  it('follows the address when it changes from outside, as the header link to the Lab does', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA')

    act(() => navigate('/lab/analysis'))

    expect(pressed()).toEqual([])
  })

  it('restores the Range from the address, as on a reload', () => {
    renderAnalysis('en', '/lab/analysis?range=QQ%2B%2CAKs%3A0.5')

    expect(pressed()).toEqual(['AA', 'AKs', 'KK', 'QQ'])
    expect(cell('AKs').getAttribute('title')).toBe('AKs · 4 combos · 50 %')
  })

  it('opens on an empty Range when the address holds text it cannot read', () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2Cbanana')

    expect(pressed()).toEqual([])
  })
})

describe('LabAnalysisPage · only loading Ranges', () => {
  /** Anything to paste, copy or save a Range with, on screen. */
  const savingControls = () => [
    ...screen.queryAllByRole('textbox', { name: /Paste a range|Range as text/ }),
    ...screen.queryAllByRole('button', { name: /Import|Copy|Save/ }),
  ]

  it('offers no Range text, import, copy or save on either side', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')

    expect(savingControls()).toEqual([])
    for (const name of ['Range 1', 'Range 2']) {
      const side = screen.getByRole('region', { name })
      expect(within(side).getByRole('combobox', { name: 'Load a saved range' })).toBeTruthy()
      expect(within(side).getByRole('button', { name: 'Clear' })).toBeTruthy()
    }
    expect(writes).toEqual([])
  })

  it('offers no save in the Selection, which still clears', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h')

    await userEvent.click(screen.getByRole('button', { name: 'Overpair' }))

    const selection = screen.getByRole('region', { name: 'Selection' })
    expect(within(selection).getAllByRole('button').map((button) => button.textContent)).toEqual(['Clear selection'])
    expect(savingControls()).toEqual([])
    expect(writes).toEqual([])
  })
})

describe('LabAnalysisPage · loading a saved Range', () => {
  const picker = () => screen.getByRole<HTMLSelectElement>('combobox', { name: 'Load a saved range' })
  const sourceName = () => screen.getByRole('heading', { level: 2 }).textContent
  const changed = () => screen.queryByText('Changed')

  it('lists the saved Ranges by name and loads the one picked, showing its name', async () => {
    renderAnalysis('en', '/lab/analysis?range=72o')

    await waitFor(() => expect(within(picker()).getAllByRole('option').map((option) => option.textContent)).toEqual(['Load a range…', '3B BB', 'OR BTN']))
    await userEvent.selectOptions(picker(), 'OR BTN')

    await waitFor(() => expect(pressed()).toEqual(['AA']))
    expect(sourceName()).toBe('OR BTN')
    await waitFor(() => expect(address()).toEqual({ range: 'AA', source: 'r1' }))
    expect(changed()).toBeNull()
  })

  it('marks the Range changed once its Combos differ from the saved one, never writing it', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA&source=r1')
    await waitFor(() => expect(sourceName()).toBe('OR BTN'))

    await userEvent.click(cell('KK'))
    expect(changed()).toBeTruthy()
    await userEvent.click(cell('KK'))
    expect(changed()).toBeNull()

    expect(writes).toEqual([])
  })

  it('names a Range with no saved source as unsaved', () => {
    renderAnalysis()

    expect(sourceName()).toBe('Unsaved range')
  })

  it('restores the source from the address, marking it changed if the Combos differ', async () => {
    renderAnalysis('en', '/lab/analysis?range=KK&source=r1')

    await waitFor(() => expect(sourceName()).toBe('OR BTN'))
    expect(changed()).toBeTruthy()
    expect(pressed()).toEqual(['KK'])
  })

  it('drops a source that is no longer mine, keeping the Combos', async () => {
    renderAnalysis('en', '/lab/analysis?range=KK&source=gone')

    await waitFor(() => expect(address()).toEqual({ range: 'KK' }))
    expect(sourceName()).toBe('Unsaved range')
    expect(pressed()).toEqual(['KK'])
  })
})

describe('LabAnalysisPage · the Board', () => {
  const board = () => screen.getByRole('region', { name: 'Board' })
  const picker = () => within(board()).getByRole('group', { name: "Pick the board's cards" })
  const card = (name: string | RegExp) => within(picker()).getByRole('button', { name })
  const onBoard = () =>
    within(picker())
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.getAttribute('aria-label'))
  const boardField = () => within(board()).getByRole<HTMLInputElement>('textbox', { name: 'Board as text' })
  const typeBoard = async (text: string) => {
    await userEvent.clear(boardField())
    await userEvent.type(boardField(), `${text}{Enter}`)
  }
  const live = () => screen.getByText(/live combos/).textContent

  it('opens empty, with all 52 cards to pick from', () => {
    renderAnalysis()

    expect(within(picker()).getAllByRole('button')).toHaveLength(52)
    expect(onBoard()).toEqual([])
    expect(boardField().value).toBe('')
  })

  it('fills in order from the grid, asking for the rest of the flop, and takes a card off when it is picked again', async () => {
    renderAnalysis()

    await userEvent.click(card('A of hearts'))
    await userEvent.click(card('7 of diamonds'))
    expect(within(board()).getByText('Pick 1 more card for the flop.')).toBeTruthy()
    await userEvent.click(card('2 of clubs'))
    await userEvent.click(card('10 of spades'))

    expect(boardField().value).toBe('Ah7d2cTs')
    expect(onBoard()).toEqual(['10 of spades', 'A of hearts', '7 of diamonds', '2 of clubs'])
    expect(within(board()).queryByText(/more card/)).toBeNull()

    await userEvent.click(card('7 of diamonds'))
    expect(boardField().value).toBe('Ah2cTs')
  })

  it('takes no sixth card', async () => {
    renderAnalysis('en', '/lab/analysis?board=Ah7d2cTs9h')

    expect(card(/^8 of hearts/).getAttribute('aria-disabled')).toBe('true')
    expect(card(/^8 of hearts/).getAttribute('aria-label')).toBe('8 of hearts. The board already has five cards.')
    expect(card('A of hearts').getAttribute('aria-disabled')).toBeNull()
  })

  it('is typed as text', async () => {
    renderAnalysis()

    await typeBoard('ah 7d 10c')

    expect(onBoard()).toEqual(['A of hearts', '7 of diamonds', '10 of clubs'])
    expect(boardField().value).toBe('Ah7dTc')
  })

  it('refuses an invalid Board as text, saying what is wrong and keeping the one it had', async () => {
    renderAnalysis('en', '/lab/analysis?board=Ah7d2c')

    await typeBoard('Ah7x2c')
    expect(within(board()).getByRole('alert').textContent).toBe('“7x” isn’t a card. The board was left as it was.')
    await typeBoard('Ah7dAh')
    expect(within(board()).getByRole('alert').textContent).toBe('Ah is on the board twice. The board was left as it was.')
    await typeBoard('Ah7d')
    expect(within(board()).getByRole('alert').textContent).toBe('A board has 3, 4 or 5 cards, not 2. The board was left as it was.')

    expect(onBoard()).toEqual(['A of hearts', '7 of diamonds', '2 of clubs'])
    expect(address()).toEqual({ board: 'Ah7d2c' })
  })

  it('deals a random flop, then the turn and the river, never a card in use', async () => {
    // The first card left in the deck, every time.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderAnalysis()
    const randomCard = () => within(board()).getByRole('button', { name: /^Random card/ })

    expect(randomCard().getAttribute('aria-label')).toBe('Random card. Deal or pick a flop first.')
    await userEvent.click(within(board()).getByRole('button', { name: 'Random flop' }))
    expect(boardField().value).toBe('AsKsQs')
    await userEvent.click(randomCard())
    await userEvent.click(randomCard())
    expect(boardField().value).toBe('AsKsQsJsTs')
    expect(randomCard().getAttribute('aria-label')).toBe('Random card. The board already has five cards.')

    await userEvent.click(within(board()).getByRole('button', { name: 'Random flop' }))
    expect(boardField().value).toBe('AsKsQs')
  })

  it('clears', async () => {
    renderAnalysis('en', '/lab/analysis?board=Ah7d2c')

    await userEvent.click(within(board()).getByRole('button', { name: 'Clear board' }))

    expect(onBoard()).toEqual([])
  })

  it('switches off the Combos holding its cards, in proportion within their cell, and counts the live ones', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CAKs%3A0.5')
    expect(live()).toBe('8.0 live combos')

    await typeBoard('As7d2c')

    expect(cell('AA').getAttribute('title')).toBe('AA · 6 combos · 100 % · 3 removed by the board or the dead cards')
    expect(cell('AKs').getAttribute('title')).toBe('AKs · 4 combos · 50 % · 1 removed by the board or the dead cards')
    expect(cell('KQo').getAttribute('title')).toBe('KQo · 12 combos · 0 %')
    expect(live()).toBe('4.5 live combos')
  })

  it('is kept in the address, replacing it, and restored from it', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA')

    await typeBoard('Ah7d2c')
    await waitFor(() => expect(address()).toEqual({ range: 'AA', board: 'Ah7d2c' }))
    cleanup()

    renderAnalysis('en', '/lab/analysis?range=AA&board=Ah7d2c')
    expect(onBoard()).toEqual(['A of hearts', '7 of diamonds', '2 of clubs'])
    expect(live()).toBe('3.0 live combos')
  })

  it('stays when a saved Range is loaded', async () => {
    renderAnalysis('en', '/lab/analysis?board=Kh7d2c')

    await waitFor(() => expect(screen.getByRole('option', { name: 'OR BTN' })).toBeTruthy())
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Load a saved range' }), 'OR BTN')

    await waitFor(() => expect(address()).toEqual({ range: 'AA', source: 'r1', board: 'Kh7d2c' }))
  })

  it('is in Spanish too', () => {
    renderAnalysis('es')

    expect(within(board()).getByRole('button', { name: 'Flop aleatorio' })).toBeTruthy()
    expect(within(board()).getByRole('button', { name: /^Carta aleatoria/ })).toBeTruthy()
  })
})

describe('LabAnalysisPage · the Dead Cards', () => {
  const board = () => screen.getByRole('region', { name: 'Board' })
  const picker = () => within(board()).getByRole('group', { name: "Pick the board's cards" })
  const card = (name: string | RegExp) => within(picker()).getByRole('button', { name })
  const pressed = () =>
    within(picker())
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.getAttribute('aria-label'))
  const pickFor = (target: 'Board' | 'Dead cards') => userEvent.click(within(board()).getByRole('radio', { name: target }))
  const deadField = () => within(board()).getByRole<HTMLInputElement>('textbox', { name: 'Dead cards as text' })
  const boardField = () => within(board()).getByRole<HTMLInputElement>('textbox', { name: 'Board as text' })
  const typeInto = async (field: HTMLInputElement, text: string) => {
    await userEvent.clear(field)
    await userEvent.type(field, `${text}{Enter}`)
  }
  const live = () => screen.getByText(/live combos/).textContent
  const ownCombo = () => screen.queryByRole('region', { name: 'Your hand' })

  it('are picked from the same grid, switched to Dead cards, up to two', async () => {
    renderAnalysis('en', '/lab/analysis?board=Th7h2c')

    await pickFor('Dead cards')
    expect(pressed()).toEqual([])
    await userEvent.click(card('A of hearts'))
    await userEvent.click(card('K of hearts'))
    expect(pressed()).toEqual(['A of hearts', 'K of hearts'])
    expect(deadField().value).toBe('AhKh')
    expect(card(/^Q of hearts/).getAttribute('aria-label')).toBe('Q of hearts. There are already two dead cards.')

    await userEvent.click(card('K of hearts'))
    expect(deadField().value).toBe('Ah')

    await pickFor('Board')
    expect(pressed()).toEqual(['10 of hearts', '7 of hearts', '2 of clubs'])
  })

  it('never share a card with the Board', async () => {
    renderAnalysis('en', '/lab/analysis?board=Th7h2c&dead=Ah')

    expect(card(/^A of hearts/).getAttribute('aria-label')).toBe('A of hearts. It is a dead card.')
    await pickFor('Dead cards')
    expect(card(/^10 of hearts/).getAttribute('aria-label')).toBe('10 of hearts. It is on the board.')
  })

  it('are typed as text, refused whole with what is wrong', async () => {
    renderAnalysis('en', '/lab/analysis?board=Th7h2c&dead=Ah')

    await typeInto(deadField(), 'AhKhQh')
    expect(within(board()).getByRole('alert').textContent).toBe('There are at most 2 dead cards, not 3. They were left as they were.')
    await typeInto(deadField(), 'AhTh')
    expect(within(board()).getByRole('alert').textContent).toBe('Th is on the board. The dead cards were left as they were.')
    await typeInto(deadField(), 'Ahx')
    expect(within(board()).getByRole('alert').textContent).toBe('“x” isn’t a card. The dead cards were left as they were.')
    expect(deadField().value).toBe('Ahx')

    await typeInto(deadField(), 'as kd')
    expect(deadField().value).toBe('AsKd')
    expect(within(board()).queryByRole('alert')).toBeNull()
  })

  it('refuse a Board typed with one of them', async () => {
    renderAnalysis('en', '/lab/analysis?dead=Ah')

    await typeInto(boardField(), 'Ah7d2c')

    expect(within(board()).getByRole('alert').textContent).toBe('Ah is a dead card. The board was left as it was.')
    expect(boardField().value).toBe('Ah7d2c')
    expect(address()).toEqual({ dead: 'Ah' })
  })

  it('switch off the Combos holding them, leaving the shares over what is left', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKK&board=Th7h2c')
    expect(live()).toBe('12.0 live combos')

    await typeInto(deadField(), 'AhKs')

    expect(cell('AA').getAttribute('title')).toBe('AA · 6 combos · 100 % · 3 removed by the board or the dead cards')
    expect(live()).toBe('6.0 live combos')
    const overpair = within(screen.getByRole('table', { name: 'Made hands' }))
      .getAllByRole('row')
      .map((row) => [...row.children].map((each) => each.textContent))
      .find((cells) => cells[0] === 'Overpair')
    expect(overpair).toEqual(['Overpair', '6.0', '100.0 %'])
  })

  it('are never dealt onto the Board', async () => {
    // The first card left in the deck, every time.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderAnalysis('en', '/lab/analysis?dead=AsQs')

    await userEvent.click(within(board()).getByRole('button', { name: 'Random flop' }))
    expect(boardField().value).toBe('KsJsTs')
    await userEvent.click(within(board()).getByRole('button', { name: /^Random card/ }))
    expect(boardField().value).toBe('KsJsTs9s')
  })

  it('make, when two, the own Combo: its Made Hand and Draws, and where it stands against the Range', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CQJs&board=Th7h2c&dead=AhKh')

    expect(ownCombo()!.textContent).toContain('Ace high · Flush draw, Overcards')
    expect(within(ownCombo()!).getByText(/^Ahead/).textContent).toBe('Ahead of 4.0 combos · 57.1 %')
    expect(within(ownCombo()!).getByText(/^Tied/).textContent).toBe('Tied with 0.0 combos · 0.0 %')
    expect(within(ownCombo()!).getByText(/^Behind/).textContent).toBe('Behind 3.0 combos · 42.9 %')
  })

  it('make no own Combo with one Dead Card', () => {
    renderAnalysis('en', '/lab/analysis?range=AA&board=Th7h2c&dead=Ah')

    expect(ownCombo()).toBeNull()
  })

  const equityLine = () => within(ownCombo()!).getByText(/^Equity/).textContent

  it('give, when two, their exact Equity against the Range on a river, with win and tie shares', () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CAK%2CKQ&board=Ks7d2c9h4s&dead=AhKh')

    // Live: 3 AA ahead of A♥K♥, 6 AK tied with it, 8 KQ behind it.
    expect(equityLine()).toBe('Equity 64.7 % · exact · Win 47.1 % · Tie 35.3 %')
  })

  it('give, when two, their Equity preflop too, sampled, with the margin it reached', () => {
    renderAnalysis('en', '/lab/analysis?range=KK&dead=AhAd')

    expect(ownCombo()!.textContent).not.toContain('Ahead')
    expect(equityLine()).toMatch(/^Equity 8\d\.\d % · ± 0\.\d+ % · Win 8\d\.\d % · Tie 0\.\d %$/)
  })

  it('restart their Equity when the Board changes, never showing the old one', async () => {
    renderAnalysis('en', '/lab/analysis?range=QQ&board=Th7h2c3s&dead=AhKh')
    const before = equityLine()

    await typeInto(boardField(), 'Th7h2c3s9h')

    expect(equityLine()).toBe('Equity 100.0 % · exact · Win 100.0 % · Tie 0.0 %')
    expect(before).not.toBe(equityLine())
  })

  it('show no Equity while the flop is being picked, nor against a Range with nothing live', () => {
    renderAnalysis('en', '/lab/analysis?range=AA&board=Th7h&dead=AhKh')
    expect(ownCombo()).toBeNull()
    cleanup()

    renderAnalysis('en', '/lab/analysis?board=Th7h2c&dead=AhKh')
    expect(within(ownCombo()!).queryByText(/^Equity/)).toBeNull()
    cleanup()

    // Preflop there is nothing else to show.
    renderAnalysis('en', '/lab/analysis?dead=AhKh')
    expect(ownCombo()).toBeNull()
  })

  it('are kept in the address, replacing it, and restored from it', async () => {
    renderAnalysis('en', '/lab/analysis?board=Th7h2c')

    await typeInto(deadField(), 'AhKh')
    await waitFor(() => expect(address()).toEqual({ board: 'Th7h2c', dead: 'AhKh' }))
    cleanup()

    renderAnalysis('en', '/lab/analysis?board=Th7h2c&dead=AhKh')
    expect(deadField().value).toBe('AhKh')
  })

  it('are in Spanish too', async () => {
    renderAnalysis('es', '/lab/analysis?range=AA&board=Th7h2c&dead=AhKh')

    expect(within(board()).getByRole('radio', { name: 'Cartas muertas' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Tu mano' }).textContent).toContain('As alto')
  })
})

describe('LabAnalysisPage · the Made Hands', () => {
  const madeHands = () => screen.queryByRole('table', { name: 'Made hands' })
  const rows = () =>
    within(madeHands()!)
      .getAllByRole('row')
      .slice(1)
      .map((row) => [...row.children].map((cell) => cell.textContent))

  it('show nothing preflop, nor on a flop still being picked', () => {
    renderAnalysis('en', '/lab/analysis?range=AA')
    expect(madeHands()).toBeNull()
    cleanup()

    renderAnalysis('en', '/lab/analysis?range=AA&board=Kd7c')
    expect(madeHands()).toBeNull()
  })

  it("show how the Range hits the flop, each row's Combos and % of the live Combos, leaving out what cannot happen", () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h')

    expect(rows()).toEqual([
      ['Set', '3.0', '25.0 %'],
      ['Two pair', '0.0', '0.0 %'],
      ['Overpair', '6.0', '50.0 %'],
      ['Top pair', '3.0', '25.0 %'],
      ['Pocket pair below top card', '0.0', '0.0 %'],
      ['Middle pair', '0.0', '0.0 %'],
      ['Pocket pair below second card', '0.0', '0.0 %'],
      ['Bottom pair', '0.0', '0.0 %'],
      ['Pocket pair below the board', '0.0', '0.0 %'],
      ['Ace high', '0.0', '0.0 %'],
      ['No made hand', '0.0', '0.0 %'],
    ])
  })

  it('follow the Board as it changes', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA&board=Kd7c4h')

    const boardField = within(screen.getByRole('region', { name: 'Board' })).getByRole('textbox', { name: 'Board as text' })
    await userEvent.clear(boardField)
    await userEvent.type(boardField, 'AhAd7c{Enter}')

    expect(rows()[0]).toEqual(['Quads', '1.0', '100.0 %'])
  })

  it('are in Spanish too', () => {
    renderAnalysis('es', '/lab/analysis?range=AA&board=Kd7c4h')

    const table = screen.getByRole('table', { name: 'Manos hechas' })
    expect(within(table).getByRole('rowheader', { name: 'Overpair' })).toBeTruthy()
    expect(within(table).getByRole('rowheader', { name: 'Sin mano hecha' })).toBeTruthy()
    expect(within(table).getByRole('cell', { name: '6,0' })).toBeTruthy()
  })
})

describe('LabAnalysisPage · the Draws', () => {
  const table = (name: string) => screen.queryByRole('table', { name })
  const rows = (name: string) =>
    within(table(name)!)
      .getAllByRole('row')
      .slice(1)
      .map((row) => [...row.children].map((cell) => cell.textContent))
  const oneCardSwitch = () => screen.queryByRole('switch', { name: 'Show one-card backdoor flush draws' })

  it('show under the Made Hands the Draws and combination Draws on the flop, leaving out what cannot happen', () => {
    renderAnalysis('en', '/lab/analysis?range=AKs&board=QhJh2c')

    expect(rows('Draws')).toEqual([
      ['Flush draw', '1.0', '25.0 %'],
      ['Open-ended straight draw (2 cards)', '0.0', '0.0 %'],
      ['Gutshot (2 cards)', '4.0', '100.0 %'],
      ['Overcards', '4.0', '100.0 %'],
      ['Backdoor flush draw (2 cards)', '1.0', '25.0 %'],
    ])
    expect(rows('Combination draws')).toEqual([
      ['Flush draw + pair', '0.0', '0.0 %'],
      ['Flush draw + open-ended', '0.0', '0.0 %'],
      ['Flush draw + gutshot', '1.0', '25.0 %'],
      ['Flush draw + overcards', '1.0', '25.0 %'],
    ])
  })

  it('add the one-card backdoor flush draw only when switched on', async () => {
    renderAnalysis('en', '/lab/analysis?range=AKs&board=QhJh2c')
    expect(rows('Draws').map(([category]) => category)).not.toContain('Backdoor flush draw (1 card)')

    await userEvent.click(oneCardSwitch()!)

    expect(rows('Draws').at(-1)).toEqual(['Backdoor flush draw (1 card)', '0.0', '0.0 %'])
  })

  it('show no backdoors on the turn, and no Draws on the river', () => {
    renderAnalysis('en', '/lab/analysis?range=AKs&board=QhJh2c3d')
    expect(rows('Draws').map(([category]) => category)).not.toContain('Backdoor flush draw (2 cards)')
    expect(oneCardSwitch()).toBeNull()
    cleanup()

    renderAnalysis('en', '/lab/analysis?range=AKs&board=QhJh2c3d9s')
    expect(table('Made hands')).not.toBeNull()
    expect(table('Draws')).toBeNull()
    expect(table('Combination draws')).toBeNull()
  })

  it('are in Spanish too', () => {
    renderAnalysis('es', '/lab/analysis?range=AKs&board=QhJh2c')

    expect(within(table('Proyectos')!).getByRole('rowheader', { name: 'Proyecto de color' })).toBeTruthy()
    expect(within(table('Proyectos combinados')!).getByRole('rowheader', { name: 'Proyecto de color + overcards' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Mostrar proyectos de color backdoor de una carta' })).toBeTruthy()
  })
})

describe('LabAnalysisPage · selecting Categories', () => {
  const row = (category: string) => screen.getByRole('button', { name: category })
  const selected = () =>
    screen
      .getAllByRole('button')
      .filter((button) => button.closest('table') && button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent)
  const selection = () => screen.queryByRole('region', { name: 'Selection' })
  const selectionText = () => selection()?.querySelector('p')?.textContent
  const title = (name: string) => cell(name).getAttribute('title')

  it('toggles rows, lighting up their Combos in the matrix in proportion and adding up their share', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h')
    expect(selection()).toBeNull()

    await userEvent.click(row('Overpair'))
    await userEvent.click(row('Top pair'))

    expect(selected()).toEqual(['Overpair', 'Top pair'])
    expect(selectionText()).toBe('9.0 combos · 75.0 % of the live combos')
    expect(title('AA')).toBe('AA · 6 combos · 100 % · 6 in the selection')
    expect(title('KQs')).toBe('KQs · 4 combos · 100 % · 1 removed by the board or the dead cards · 3 in the selection')
    expect(title('77')).toBe('77 · 6 combos · 100 % · 3 removed by the board or the dead cards')

    await userEvent.click(row('Overpair'))

    expect(selected()).toEqual(['Top pair'])
    expect(selectionText()).toBe('3.0 combos · 25.0 % of the live combos')
    // Still under the pointer, it stays lit until the pointer leaves.
    expect(title('AA')).toBe('AA · 6 combos · 100 % · 6 in the selection')
    await userEvent.unhover(row('Overpair'))
    expect(title('AA')).toBe('AA · 6 combos · 100 %')
  })

  it('counts each Combo once, though several selected rows hold it', async () => {
    renderAnalysis('en', '/lab/analysis?range=AKs&board=QhJh2c')

    await userEvent.click(row('Flush draw'))
    await userEvent.click(row('Overcards'))

    expect(selectionText()).toBe('4.0 combos · 100.0 % of the live combos')
  })

  it('lights up a row on hover without selecting it', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h')

    await userEvent.hover(row('Set'))
    expect(title('77')).toBe('77 · 6 combos · 100 % · 3 removed by the board or the dead cards · 3 in the selection')
    expect(selected()).toEqual([])
    expect(selection()).toBeNull()

    await userEvent.unhover(row('Set'))
    expect(title('77')).toBe('77 · 6 combos · 100 % · 3 removed by the board or the dead cards')
  })

  it('clears in one click', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h')
    await userEvent.click(row('Overpair'))
    await userEvent.click(row('Set'))

    await userEvent.click(within(selection()!).getByRole('button', { name: 'Clear selection' }))

    expect(selected()).toEqual([])
    expect(selection()).toBeNull()
    expect(title('AA')).toBe('AA · 6 combos · 100 %')
  })

  it('clears when the Board or the Range changes', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h')
    await userEvent.click(row('Overpair'))

    await userEvent.click(cell('AKs'))
    expect(selected()).toEqual([])

    await userEvent.click(row('Overpair'))
    const boardField = within(screen.getByRole('region', { name: 'Board' })).getByRole('textbox', { name: 'Board as text' })
    await userEvent.clear(boardField)
    await userEvent.type(boardField, 'Kd7c4h5s{Enter}')
    expect(selected()).toEqual([])
    expect(selection()).toBeNull()
  })

  it('is in Spanish too', async () => {
    renderAnalysis('es', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h')

    await userEvent.click(screen.getByRole('button', { name: 'Overpair' }))

    const region = screen.getByRole('region', { name: 'Selección' })
    expect(region.querySelector('p')?.textContent).toBe('6,0 combos · 50,0 % de los combos vivos')
    expect(within(region).getByRole('button', { name: 'Limpiar selección' })).toBeTruthy()
  })
})

describe('LabAnalysisPage · the second side', () => {
  const side = (name: string) => screen.getByRole('region', { name })
  const pressedIn = (region: HTMLElement) =>
    within(within(region).getByRole('group', { name: 'Range matrix' }))
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.getAttribute('aria-label'))

  it('is added empty beside the first, kept in the address, and removed again', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA&source=r1')

    await userEvent.click(screen.getByRole('button', { name: 'Add a second range' }))

    expect(pressedIn(side('Range 1'))).toEqual(['AA'])
    expect(pressedIn(side('Range 2'))).toEqual([])
    await waitFor(() => expect(address()).toEqual({ range: 'AA', source: 'r1', range2: '' }))

    await userEvent.click(within(side('Range 2')).getByRole('button', { name: 'Remove range' }))

    expect(screen.queryByRole('region', { name: 'Range 2' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Analysed range' })).toBeTruthy()
    await waitFor(() => expect(address()).toEqual({ range: 'AA', source: 'r1' }))
  })

  it('is restored from the address, with its source, as on a reload', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA&range2=KK&source2=r1')

    expect(pressedIn(side('Range 1'))).toEqual(['AA'])
    expect(pressedIn(side('Range 2'))).toEqual(['KK'])
    await waitFor(() => expect(within(side('Range 2')).getByRole('heading', { level: 2 }).textContent).toBe('OR BTN'))
    expect(within(side('Range 2')).getByText('Changed')).toBeTruthy()
    expect(within(side('Range 1')).getByRole('heading', { level: 2 }).textContent).toBe('Unsaved range')
  })

  it('is loaded, painted and cleared on its own, the brush painting whichever matrix is pressed', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA&range2=')
    const second = side('Range 2')

    await waitFor(() => expect(within(second).getAllByRole('option')).toHaveLength(3))
    await userEvent.selectOptions(within(second).getByRole('combobox', { name: 'Load a saved range' }), 'OR BTN')
    await waitFor(() => expect(within(second).getByRole('heading', { level: 2 }).textContent).toBe('OR BTN'))
    await userEvent.click(within(within(second).getByRole('group', { name: 'Range matrix' })).getByRole('button', { name: 'KK' }))

    expect(pressedIn(second)).toEqual(['AA', 'KK'])
    expect(within(second).getByText('Changed')).toBeTruthy()
    expect(pressedIn(side('Range 1'))).toEqual(['AA'])
    expect(within(side('Range 1')).queryByText('Changed')).toBeNull()

    await waitFor(() => expect(address()).toEqual({ range: 'AA', range2: 'KK+', source2: 'r1' }))

    await userEvent.click(within(second).getByRole('button', { name: 'Clear' }))
    expect(pressedIn(second)).toEqual([])
    expect(pressedIn(side('Range 1'))).toEqual(['AA'])
    await waitFor(() => expect(address()).toEqual({ range: 'AA', range2: '', source2: 'r1' }))
  })

  it('has its Combos removed by the Board, like the first', () => {
    renderAnalysis('en', '/lab/analysis?range=AA&range2=KK&board=Ks7c2d')

    expect(within(side('Range 1')).getByText(/live combos/).textContent).toBe('6.0 live combos')
    expect(within(side('Range 2')).getByText(/live combos/).textContent).toBe('3.0 live combos')
  })

  it('takes the Dead Cards away when added, and offers none while it is there', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA&dead=KsKh')

    await userEvent.click(screen.getByRole('button', { name: 'Add a second range' }))

    const board = screen.getByRole('region', { name: 'Board' })
    expect(within(board).queryByRole('radio', { name: 'Dead cards' })).toBeNull()
    expect(within(board).queryByRole('textbox', { name: 'Dead cards as text' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Your hand' })).toBeNull()
    await waitFor(() => expect(address()).toEqual({ range: 'AA', range2: '' }))
  })

  it('drops Dead Cards an address holds alongside it', () => {
    renderAnalysis('en', '/lab/analysis?range=AA&range2=KK&dead=QsQh')

    expect(within(side('Range 1')).getByText(/live combos/).textContent).toBe('6.0 live combos')
    expect(screen.queryByRole('textbox', { name: 'Dead cards as text' })).toBeNull()
  })
})

describe('LabAnalysisPage · the Categories of two sides', () => {
  const side = (name: string) => screen.getByRole('region', { name })
  /** A table's rows as text, cell by cell. */
  const tableRows = (caption: string) =>
    Array.from(screen.getByRole('table', { name: caption }).querySelectorAll('tr'), (row) =>
      Array.from(row.children, (each) => each.textContent).join(' | '),
    )
  /** A row's pick in one side's column, named by the row, the side and its %. */
  const pick = (category: string, region: string) => screen.getByRole('button', { name: new RegExp(`^${category} · ${region} · `) })
  const pressed = () =>
    screen
      .getAllByRole('button')
      .filter((button) => button.closest('table') && button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.getAttribute('aria-label'))
  const selectionLines = () =>
    Array.from(screen.getByRole('region', { name: 'Selection' }).querySelectorAll('li'), (each) => each.textContent)
  const title = (region: string, name: string) =>
    within(within(side(region)).getByRole('group', { name: 'Range matrix' })).getByRole('button', { name }).getAttribute('title')

  it("show a % column per side, each over that side's own live Combos", () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')

    const rows = tableRows('Made hands')
    expect(rows[0]).toBe('Made hand | % Range 1 | % Range 2')
    expect(rows).toContain('Set | 0.0 % | 50.0 %')
    expect(rows).toContain('Overpair | 66.7 % | 0.0 %')
    expect(rows).toContain('Top pair | 33.3 % | 50.0 %')
  })

  it("leave under each matrix only the side's live Combos", () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')

    for (const name of ['Range 1', 'Range 2']) {
      expect(within(side(name)).getByText(/live combos/)).toBeTruthy()
      expect(within(side(name)).queryByRole('region', { name: 'Range stats' })).toBeNull()
    }
  })

  it("select a row for one side by clicking in that side's column, lighting up only that side's matrix", async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')

    await userEvent.click(pick('Top pair', 'Range 2'))
    // A hovered row lights up on both sides: only the selection stays once the pointer leaves.
    await userEvent.unhover(pick('Top pair', 'Range 2'))

    expect(pressed()).toEqual(['Top pair · Range 2 · 50.0 %'])
    expect(selectionLines()).toEqual([
      'Range 1: 0.0 combos · 0.0 % of the live combos',
      'Range 2: 3.0 combos · 50.0 % of the live combos',
    ])
    expect(title('Range 2', 'KQs')).toBe('KQs · 4 combos · 100 % · 1 removed by the board or the dead cards · 3 in the selection')
    expect(title('Range 1', 'KQs')).toBe('KQs · 4 combos · 100 % · 1 removed by the board or the dead cards')
  })

  it("select a row on both sides, each side with its own selection and combined %", async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')

    await userEvent.click(pick('Top pair', 'Range 1'))
    await userEvent.click(pick('Top pair', 'Range 2'))
    await userEvent.click(pick('Set', 'Range 2'))

    expect(selectionLines()).toEqual([
      'Range 1: 3.0 combos · 33.3 % of the live combos',
      'Range 2: 6.0 combos · 100.0 % of the live combos',
    ])
    expect(title('Range 1', 'KQs')).toBe('KQs · 4 combos · 100 % · 1 removed by the board or the dead cards · 3 in the selection')
    expect(title('Range 2', '77')).toBe('77 · 6 combos · 100 % · 3 removed by the board or the dead cards · 3 in the selection')
    expect(title('Range 1', 'AA')).toBe('AA · 6 combos · 100 %')

    await userEvent.click(pick('Top pair', 'Range 1'))
    expect(pressed()).toEqual(['Set · Range 2 · 50.0 %', 'Top pair · Range 2 · 50.0 %'])
  })

  it('select a row for a side from the keyboard', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')

    pick('Set', 'Range 2').focus()
    await userEvent.keyboard('{Enter}')
    pick('Overpair', 'Range 1').focus()
    await userEvent.keyboard(' ')

    expect(pressed()).toEqual(['Set · Range 2 · 50.0 %', 'Overpair · Range 1 · 66.7 %'])
  })

  it('light up a hovered row in both matrices', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')

    await userEvent.hover(pick('Top pair', 'Range 1'))

    expect(title('Range 1', 'KQs')).toBe('KQs · 4 combos · 100 % · 1 removed by the board or the dead cards · 3 in the selection')
    expect(title('Range 2', 'KQs')).toBe('KQs · 4 combos · 100 % · 1 removed by the board or the dead cards · 3 in the selection')
    expect(pressed()).toEqual([])
  })

  it('clear both sides in one click', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')
    await userEvent.click(pick('Overpair', 'Range 1'))
    await userEvent.click(pick('Set', 'Range 2'))

    await userEvent.click(within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', { name: 'Clear selection' }))

    expect(pressed()).toEqual([])
    expect(screen.queryByRole('region', { name: 'Selection' })).toBeNull()
    expect(title('Range 1', 'AA')).toBe('AA · 6 combos · 100 %')
  })

  it('are in Spanish too', async () => {
    renderAnalysis('es', '/lab/analysis?range=AA&range2=KK&board=Kd7c4h')

    expect(screen.getByRole('region', { name: 'Rango 1' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Rango 2' })).getByRole('button', { name: 'Quitar rango' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Overpair · Rango 1 · 100,0 %' }))
    expect(Array.from(screen.getByRole('region', { name: 'Selección' }).querySelectorAll('li'), (each) => each.textContent)).toEqual([
      'Rango 1: 6,0 combos · 100,0 % de los combos vivos',
      'Rango 2: 0,0 combos · 0,0 % de los combos vivos',
    ])
  })
})

describe('LabAnalysisPage · the Equity between two Ranges', () => {
  const side = (name: string) => screen.getByRole('region', { name })
  const equityBar = () => screen.queryByRole('region', { name: 'Equity' })
  const lines = () =>
    Array.from(equityBar()!.querySelectorAll('li, p'), (each) => each.textContent).filter((text) => text !== '')
  const cellOf = (region: string, name: string) =>
    within(within(side(region)).getByRole('group', { name: 'Range matrix' })).getByRole('button', { name })

  // On K♠7♦2♣9♥4♠, AK ties AK and beats QQ: 72 meetings each.
  const river = '/lab/analysis?range=AK&range2=AK%2CQQ&board=Ks7d2c9h4s'

  it('shows each side its exact Equity against the other on a river, with win and tie shares', () => {
    renderAnalysis('en', river)

    expect(lines()).toEqual([
      'Range 1: Equity 75.0 % · Win 50.0 % · Tie 50.0 %',
      'Range 2: Equity 25.0 % · Win 0.0 % · Tie 50.0 %',
      'Exact, not sampled',
    ])
  })

  it("marks each side's Equity at its end of the bar", () => {
    renderAnalysis('en', river)

    // Read out by the lines below it: the ends are for the eye alone.
    expect(within(equityBar()!).getByText('75.0 %')).toBeTruthy()
    expect(within(equityBar()!).getByText('25.0 %')).toBeTruthy()
  })

  it('shows it preflop too, sampled, with the margin it reached', () => {
    renderAnalysis('en', '/lab/analysis?range=AA&range2=KK')

    const [first, second, precision] = lines()
    expect(first).toMatch(/^Range 1: Equity 8\d\.\d % · Win 8\d\.\d % · Tie 0\.\d %$/)
    expect(second).toMatch(/^Range 2: Equity 1\d\.\d % · Win 1\d\.\d % · Tie 0\.\d %$/)
    expect(precision).toMatch(/^Sampled · ± 0\.\d+ %$/)
  })

  it('shows nothing with one side, while the flop is being picked, or against an empty side', () => {
    renderAnalysis('en', '/lab/analysis?range=AA&board=Ks7d2c')
    expect(equityBar()).toBeNull()
    cleanup()

    renderAnalysis('en', '/lab/analysis?range=AA&range2=KK&board=Ks7d')
    expect(equityBar()).toBeNull()
    cleanup()

    renderAnalysis('en', '/lab/analysis?range=AA&range2=')
    expect(equityBar()).toBeNull()
  })

  it('starts over when a Range or the Board changes, never showing the old one', async () => {
    renderAnalysis('en', river)
    const boardField = within(screen.getByRole('region', { name: 'Board' })).getByRole<HTMLInputElement>('textbox', {
      name: 'Board as text',
    })

    // On Q♠7♦2♣9♥4♠ the queens make a set: AK ties AK (144 meetings) and loses to QQ (48).
    await userEvent.clear(boardField)
    await userEvent.type(boardField, 'Qs7d2c9h4s{Enter}')
    expect(lines()[0]).toBe('Range 1: Equity 37.5 % · Win 0.0 % · Tie 75.0 %')

    await userEvent.click(cellOf('Range 2', 'QQ'))
    expect(lines()[0]).toBe('Range 1: Equity 50.0 % · Win 0.0 % · Tie 100.0 %')
  })

  it("shows a hovered cell's Hand Class Equity against the other side", async () => {
    renderAnalysis('en', river)

    await userEvent.hover(cellOf('Range 2', 'QQ'))
    expect(lines()).toContain('QQ (Range 2): Equity 0.0 % against Range 1 · Win 0.0 % · Tie 0.0 %')

    await userEvent.hover(cellOf('Range 1', 'AKs'))
    expect(lines()).toContain('AKs (Range 1): Equity 75.0 % against Range 2 · Win 50.0 % · Tie 50.0 %')

    await userEvent.hover(cellOf('Range 1', 'KK'))
    expect(lines()).toContain('KK (Range 1): meets no combo of Range 2')

    await userEvent.unhover(cellOf('Range 1', 'KK'))
    expect(lines()).toHaveLength(3)
  })

  it('shows a hovered cell on the precision line, in its place while it lasts', async () => {
    renderAnalysis('en', river)
    expect(lines()).toContain('Exact, not sampled')

    await userEvent.hover(cellOf('Range 2', 'QQ'))
    expect(lines()).not.toContain('Exact, not sampled')
    expect(lines()).toContain('QQ (Range 2): Equity 0.0 % against Range 1 · Win 0.0 % · Tie 0.0 %')

    await userEvent.unhover(cellOf('Range 2', 'QQ'))
    expect(lines()).toContain('Exact, not sampled')
  })

  it('is in Spanish too', () => {
    renderAnalysis('es', river)

    expect(lines()).toEqual([
      'Rango 1: Equity 75,0 % · Gana 50,0 % · Empata 50,0 %',
      'Rango 2: Equity 25,0 % · Gana 0,0 % · Empata 50,0 %',
      'Exacta, sin muestreo',
    ])
  })
})

describe('LabAnalysisPage · narrowing the Range Street by Street', () => {
  const board = () => screen.getByRole('region', { name: 'Board' })
  const deck = () => within(board()).getByRole('group', { name: "Pick the board's cards" })
  const pickCard = (name: string) => userEvent.click(within(deck()).getByRole('button', { name }))
  const boardField = () => within(board()).getByRole<HTMLInputElement>('textbox', { name: 'Board as text' })
  const typeBoard = async (text: string) => {
    await userEvent.clear(boardField())
    await userEvent.type(boardField(), `${text}{Enter}`)
  }
  const row = (category: string) => screen.getByRole('button', { name: category })
  const selected = () =>
    screen
      .getAllByRole('button')
      .filter((button) => button.closest('table') && button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent)
  /** A table's rows holding any Combo, as [Category, Combos, %]. */
  const heldRows = (name: string) =>
    within(screen.getByRole('table', { name }))
      .getAllByRole('row')
      .slice(1)
      .map((each) => [...each.children].map((cell) => cell.textContent))
      .filter(([, combos]) => combos !== '0.0')
  const live = () => screen.getByText(/live combos/).textContent
  const select = async (...categories: string[]) => {
    for (const category of categories) await userEvent.click(row(category))
  }
  /** On Kd7c4h: AA overpairs, KQs top pair, 77 a set. */
  const flop = '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h'

  it('turns the Selection into the flop’s Narrowing when the turn is dealt from the grid, analysing the turn with only its Combos', async () => {
    renderAnalysis('en', flop)
    await select('Overpair', 'Set')

    await pickCard('2 of spades')

    expect(heldRows('Made hands')).toEqual([
      ['Set', '3.0', '33.3 %'],
      ['Overpair', '6.0', '66.7 %'],
    ])
    expect(live()).toBe('9.0 live combos')
    expect(pressed()).toEqual(['AA', '77'])
    // The turn starts with nothing selected.
    expect(selected()).toEqual([])
    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs', board: 'Kd7c4h2s', narrowing: 'set.overpair' }))
  })

  it('narrows the same when the turn is typed or dealt at random', async () => {
    renderAnalysis('en', flop)
    await select('Top pair')
    await typeBoard('Kd7c4h2s')
    expect(heldRows('Made hands')).toEqual([['Top pair', '3.0', '100.0 %']])
    cleanup()

    // The first card left in the deck: the ace of spades.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    renderAnalysis('en', flop)
    await select('Overpair')
    await userEvent.click(within(board()).getByRole('button', { name: 'Random card' }))
    expect(boardField().value).toBe('Kd7c4hAs')
    expect(heldRows('Made hands')).toEqual([['Set', '3.0', '100.0 %']])
  })

  it('narrows again from the turn to the river, keeping each Combo’s Frequency', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%3A0.5%2CKQs%2C77&board=Kd7c4h')
    await select('Overpair', 'Set')
    await pickCard('2 of spades')
    await select('Overpair')

    await pickCard('9 of hearts')

    expect(heldRows('Made hands')).toEqual([['Overpair', '3.0', '100.0 %']])
    expect(live()).toBe('3.0 live combos')
    await waitFor(() => expect(address().narrowing).toBe('set.overpair_overpair'))
  })

  it('carries the whole Range on when the next card is dealt with nothing selected', async () => {
    renderAnalysis('en', flop)

    await pickCard('2 of spades')
    await pickCard('9 of hearts')

    expect(live()).toBe('12.0 live combos')
    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs', board: 'Kd7c4h2s9h' }))
  })

  it('measures my own Combo against the narrowed Range', async () => {
    renderAnalysis('en', `${flop}&dead=QhQd`)
    await select('Overpair')

    await pickCard('2 of spades')

    const own = screen.getByRole('region', { name: 'Your hand' })
    expect(within(own).getByText(/^Ahead/).textContent).toBe('Ahead of 0.0 combos · 0.0 %')
    expect(within(own).getByText(/^Behind/).textContent).toBe('Behind 6.0 combos · 100.0 %')
    expect(within(own).getByText(/^Equity/).textContent).toMatch(/^Equity 4\.5 % · exact/)
  })

  it('brings a Street’s Narrowing back as the Selection when the last card is taken off', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s9h&narrowing=set.overpair_overpair')

    await pickCard('9 of hearts')
    expect(selected()).toEqual(['Overpair'])
    expect(heldRows('Made hands')).toEqual([
      ['Set', '3.0', '33.3 %'],
      ['Overpair', '6.0', '66.7 %'],
    ])
    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs', board: 'Kd7c4h2s', narrowing: 'set.overpair' }))

    await pickCard('2 of spades')
    expect(selected()).toEqual(['Set', 'Overpair'])
    expect(heldRows('Made hands')).toContainEqual(['Top pair', '3.0', '25.0 %'])
    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs', board: 'Kd7c4h' }))
  })

  it('drops the Narrowings from a Street whose card changes on, keeping the earlier ones', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s9h&narrowing=set.overpair_overpair')

    // The turn taken off: the river's card becomes the turn.
    await pickCard('2 of spades')
    expect(selected()).toEqual([])
    expect(heldRows('Made hands')).toEqual([
      ['Set', '3.0', '33.3 %'],
      ['Overpair', '6.0', '66.7 %'],
    ])
    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs', board: 'Kd7c4h9h', narrowing: 'set.overpair' }))

    await pickCard('K of diamonds')
    expect(live()).toBe('13.0 live combos')
    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs', board: '7c4h9h' }))
  })

  it('keeps the flop’s Narrowing when another turn is typed, and drops it when another flop is', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s&narrowing=set.overpair')

    await typeBoard('Kd7c4h3s')
    await waitFor(() => expect(address().narrowing).toBe('set.overpair'))

    await typeBoard('Kd7c5h3s')
    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs', board: 'Kd7c5h3s' }))
    expect(live()).toBe('12.0 live combos')
  })

  it('drops every Narrowing when the Board is cleared', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s9h&narrowing=set.overpair_overpair')

    await userEvent.click(within(board()).getByRole('button', { name: 'Clear board' }))

    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs' }))
  })

  it('drops the Narrowings when a Range is loaded or the Range is cleared, and keeps them when the Dead Cards change', async () => {
    const narrowed = '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s&narrowing=set.overpair'
    renderAnalysis('en', narrowed)

    const deadField = within(board()).getByRole<HTMLInputElement>('textbox', { name: 'Dead cards as text' })
    await userEvent.type(deadField, 'QhQd{Enter}')
    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs', board: 'Kd7c4h2s', dead: 'QhQd', narrowing: 'set.overpair' }))

    await waitFor(() => expect(screen.getByRole('option', { name: 'OR BTN' })).toBeTruthy())
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Load a saved range' }), 'OR BTN')
    await waitFor(() => expect(address()).toEqual({ range: 'AA', source: 'r1', board: 'Kd7c4h2s', dead: 'QhQd' }))
    cleanup()

    renderAnalysis('en', narrowed)
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(address()).toEqual({ board: 'Kd7c4h2s' }))
  })

  it('locks the brush while the Range is narrowed, saying why', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s&narrowing=set.overpair')
    const reason = 'The range is narrowed on the board: go back to the flop or clear the trail to paint it.'

    expect(screen.getByText(reason)).toBeTruthy()
    expect(screen.getByRole('radio', { name: `50 %. ${reason}` }).getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(cell('KK'))
    expect(pressed()).toEqual(['AA', '77'])

    await pickCard('2 of spades')
    expect(screen.queryByText(reason)).toBeNull()
    await userEvent.click(cell('KK'))
    expect(pressed()).toEqual(['AA', 'KK', 'KQs', '77'])
  })

  it('says why the brush is locked in Spanish too', () => {
    renderAnalysis('es', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s&narrowing=set.overpair')

    expect(screen.getByText('El rango está acotado en el board: vuelve al flop o quita el acotado para pintarlo.')).toBeTruthy()
  })

  it('reads the Narrowings from the address, leaving out the Category ids it cannot read', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s&narrowing=nonsense.set..overpair_flush')

    expect(heldRows('Made hands')).toEqual([
      ['Set', '3.0', '33.3 %'],
      ['Overpair', '6.0', '66.7 %'],
    ])
    // Any change writes the address again, as the screen reads it.
    await userEvent.type(within(board()).getByRole('textbox', { name: 'Dead cards as text' }), 'Qh{Enter}')
    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs', board: 'Kd7c4h2s', dead: 'Qh', narrowing: 'set.overpair' }))
  })
})

describe('LabAnalysisPage · the trail of Narrowings', () => {
  const board = () => screen.getByRole('region', { name: 'Board' })
  const pickCard = (name: string) =>
    userEvent.click(within(within(board()).getByRole('group', { name: "Pick the board's cards" })).getByRole('button', { name }))
  const select = async (...categories: string[]) => {
    for (const category of categories) await userEvent.click(screen.getByRole('button', { name: category }))
  }
  const live = () => screen.getByText(/live combos/).textContent
  const madeHands = () =>
    within(screen.getByRole('table', { name: 'Made hands' }))
      .getAllByRole('row')
      .slice(1)
      .map((each) => [...each.children].map((cell) => cell.textContent))
      .filter(([, combos]) => combos !== '0.0')
  /** Each step of the trail, as [its Board, its Street, the Categories kept, what it kept]. */
  const trail = (name = 'Narrowings') =>
    within(screen.getByRole('region', { name }))
      .getAllByRole('listitem')
      .map((step) => [within(step).getAllByRole('img')[0].getAttribute('aria-label'), ...Array.from(step.querySelectorAll('p'), (line) => line.textContent)])

  it('shows one step per narrowed Street, with its Board, the Categories kept, and the Combos and % of the step before', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h')
    await select('Overpair', 'Set')
    await pickCard('2 of spades')
    await select('Overpair')

    await pickCard('9 of hearts')

    expect(trail()).toEqual([
      ['Kd7c4h', 'Flop', 'Set, Overpair', 'Kept 9.0 combos · 75.0 %'],
      ['Kd7c4h2s', 'Turn', 'Overpair', 'Kept 6.0 combos · 66.7 %'],
    ])
  })

  it('shows a Street dealt with nothing selected as a step that kept everything', () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s9h&narrowing=_overpair')

    expect(trail()).toEqual([
      ['Kd7c4h', 'Flop', 'Everything', 'Kept 12.0 combos · 100.0 %'],
      ['Kd7c4h2s', 'Turn', 'Overpair', 'Kept 6.0 combos · 50.0 %'],
    ])
  })

  it('shows no trail with no Narrowing', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h')
    expect(screen.queryByRole('region', { name: 'Narrowings' })).toBeNull()

    await pickCard('2 of spades')

    expect(screen.queryByRole('region', { name: 'Narrowings' })).toBeNull()
  })

  it('removes a step by keyboard, recomputing the later Streets on what is left, and the address follows', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s9h&narrowing=set.overpair_overpair')
    expect(live()).toBe('6.0 live combos')

    screen.getByRole('button', { name: 'Remove the flop’s narrowing' }).focus()
    await userEvent.keyboard('{Enter}')

    expect(trail()).toEqual([
      ['Kd7c4h', 'Flop', 'Everything', 'Kept 12.0 combos · 100.0 %'],
      ['Kd7c4h2s', 'Turn', 'Overpair', 'Kept 6.0 combos · 50.0 %'],
    ])
    expect(madeHands()).toEqual([['Overpair', '6.0', '100.0 %']])
    expect(live()).toBe('6.0 live combos')
    expect(pressed()).toEqual(['AA'])
    await waitFor(() => expect(address()).toEqual({ range: 'AA,77,KQs', board: 'Kd7c4h2s9h', narrowing: '_overpair' }))
  })

  it('takes the trail away and unlocks the brush once every step is removed', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s&narrowing=set.overpair')

    await userEvent.click(screen.getByRole('button', { name: 'Remove the flop’s narrowing' }))

    expect(screen.queryByRole('region', { name: 'Narrowings' })).toBeNull()
    expect(live()).toBe('12.0 live combos')
    expect(screen.queryByText(/The range is narrowed/)).toBeNull()
    await userEvent.click(cell('KK'))
    expect(pressed()).toEqual(['AA', 'KK', 'KQs', '77'])
    await waitFor(() => expect(address()).toEqual({ range: 'KK+,77,KQs', board: 'Kd7c4h2s' }))
  })

  it('reads the trail in Spanish', () => {
    renderAnalysis('es', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h2s9h&narrowing=_overpair')

    expect(trail('Acotado')).toEqual([
      ['Kd7c4h', 'Flop', 'Todo', 'Quedan 12,0 combos · 100,0 %'],
      ['Kd7c4h2s', 'Turn', 'Overpair', 'Quedan 6,0 combos · 50,0 %'],
    ])
    expect(screen.getByRole('button', { name: 'Quitar el acotado del turn' })).toBeTruthy()
  })
})


describe('LabAnalysisPage · narrowing two Ranges', () => {
  const board = () => screen.getByRole('region', { name: 'Board' })
  const pickCard = (name: string) =>
    userEvent.click(within(within(board()).getByRole('group', { name: "Pick the board's cards" })).getByRole('button', { name }))
  const side = (name: string) => screen.getByRole('region', { name })
  const pick = (category: string, region: string) => screen.getByRole('button', { name: new RegExp(`^${category} · ${region} · `) })
  const liveOf = (name: string) => within(side(name)).getByText(/live combos/).textContent
  const pressedIn = (name: string) =>
    within(within(side(name)).getByRole('group', { name: 'Range matrix' }))
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.getAttribute('aria-label'))
  /** A table's rows as text, cell by cell. */
  const tableRows = (caption: string) =>
    Array.from(screen.getByRole('table', { name: caption }).querySelectorAll('tr'), (row) =>
      Array.from(row.children, (each) => each.textContent).join(' | '),
    )
  /** Each step of a side's trail, as [its Street, the Categories kept, what it kept]. */
  const trail = (name: string) =>
    within(screen.getByRole('region', { name }))
      .getAllByRole('listitem')
      .map((step) => Array.from(step.querySelectorAll('p'), (line) => line.textContent))
  /** On Kd7c4h: AA overpairs, KQs top pair, 77 a set. */
  const flop = '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h'
  /** Both sides narrowed on the flop, on Kd7c4h2s. */
  const turn = '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h2s&narrowing=overpair&narrowing2=set'

  it("turns each side's own Selection into its Narrowing when the turn is dealt", async () => {
    renderAnalysis('en', flop)
    await userEvent.click(pick('Overpair', 'Range 1'))
    await userEvent.click(pick('Set', 'Range 2'))

    await pickCard('2 of spades')

    expect(liveOf('Range 1')).toBe('6.0 live combos')
    expect(liveOf('Range 2')).toBe('3.0 live combos')
    expect(pressedIn('Range 1')).toEqual(['AA'])
    expect(pressedIn('Range 2')).toEqual(['77'])
    const rows = tableRows('Made hands')
    expect(rows).toContain('Set | 0.0 % | 100.0 %')
    expect(rows).toContain('Overpair | 100.0 % | 0.0 %')
    expect(rows).toContain('Top pair | 0.0 % | 0.0 %')
    await waitFor(() =>
      expect(address()).toEqual({ range: 'AA,KQs', range2: '77,KQs', board: 'Kd7c4h2s', narrowing: 'overpair', narrowing2: 'set' }),
    )
  })

  it('asks for the Equity on the turn between both narrowed Ranges', async () => {
    const posted = vi.spyOn(SyncEquityWorker.prototype, 'postMessage')
    renderAnalysis('en', flop)
    await userEvent.click(pick('Overpair', 'Range 1'))
    await userEvent.click(pick('Set', 'Range 2'))

    await pickCard('2 of spades')

    const { request } = posted.mock.lastCall![0]
    expect(request.board).toEqual(['Kd', '7c', '4h', '2s'])
    expect(request.ranges.map((range) => Object.keys(range).sort())).toEqual([
      ['AdAc', 'AhAc', 'AhAd', 'AsAc', 'AsAd', 'AsAh'],
      ['7h7d', '7s7d', '7s7h'],
    ])
  })

  it('shows each side its own trail, and removing a step on one side leaves the other untouched', async () => {
    renderAnalysis('en', turn)

    expect(trail('Narrowings · Range 1')).toEqual([['Flop', 'Overpair', 'Kept 6.0 combos · 66.7 %']])
    expect(trail('Narrowings · Range 2')).toEqual([['Flop', 'Set', 'Kept 3.0 combos · 50.0 %']])

    await userEvent.click(screen.getByRole('button', { name: 'Remove the flop’s narrowing · Range 2' }))

    expect(screen.queryByRole('region', { name: 'Narrowings · Range 2' })).toBeNull()
    expect(trail('Narrowings · Range 1')).toEqual([['Flop', 'Overpair', 'Kept 6.0 combos · 66.7 %']])
    expect(liveOf('Range 1')).toBe('6.0 live combos')
    expect(liveOf('Range 2')).toBe('6.0 live combos')
    await waitFor(() =>
      expect(address()).toEqual({ range: 'AA,KQs', range2: '77,KQs', board: 'Kd7c4h2s', narrowing: 'overpair' }),
    )
  })

  it("names the side in each trail's remove buttons, in Spanish too", () => {
    renderAnalysis('es', turn)

    expect(screen.getByRole('button', { name: 'Quitar el acotado del flop · Rango 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Quitar el acotado del flop · Rango 2' })).toBeTruthy()
  })

  it('locks only the narrowed side’s brush', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h2s&narrowing=overpair')

    await userEvent.click(within(within(side('Range 1')).getByRole('group', { name: 'Range matrix' })).getByRole('button', { name: 'KK' }))
    await userEvent.click(within(within(side('Range 2')).getByRole('group', { name: 'Range matrix' })).getByRole('button', { name: 'KK' }))

    expect(pressedIn('Range 1')).toEqual(['AA'])
    expect(pressedIn('Range 2')).toEqual(['KK', 'KQs', '77'])
  })

  it('says why under the narrowed side only', () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h2s&narrowing=overpair')
    const reason = 'The range is narrowed on the board: go back to the flop or clear the trail to paint it.'

    expect(within(side('Range 1')).getByText(reason)).toBeTruthy()
    expect(within(side('Range 2')).queryByText(reason)).toBeNull()
    expect(screen.getAllByText(reason)).toHaveLength(1)
  })

  it('says why once, in the brush, when both sides are narrowed', () => {
    renderAnalysis('en', turn)
    const reason = 'The range is narrowed on the board: go back to the flop or clear the trail to paint it.'

    expect(within(screen.getByRole('group', { name: 'Brush' })).getByText(reason)).toBeTruthy()
    expect(screen.getAllByText(reason)).toHaveLength(1)
  })

  it("drops only that side's Narrowings when one side is loaded or cleared", async () => {
    renderAnalysis('en', turn)

    await userEvent.click(within(side('Range 2')).getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(address()).toEqual({ range: 'AA,KQs', range2: '', board: 'Kd7c4h2s', narrowing: 'overpair' }))
    cleanup()

    renderAnalysis('en', turn)
    await waitFor(() => expect(within(side('Range 1')).getByRole('option', { name: 'OR BTN' })).toBeTruthy())
    await userEvent.selectOptions(within(side('Range 1')).getByRole('combobox', { name: 'Load a saved range' }), 'OR BTN')
    await waitFor(() =>
      expect(address()).toEqual({ range: 'AA', source: 'r1', range2: '77,KQs', board: 'Kd7c4h2s', narrowing2: 'set' }),
    )
  })

  it("keeps the first side's Narrowings when the second side is removed, and when a side is added", async () => {
    renderAnalysis('en', turn)

    await userEvent.click(within(side('Range 2')).getByRole('button', { name: 'Remove range' }))
    await waitFor(() => expect(address()).toEqual({ range: 'AA,KQs', board: 'Kd7c4h2s', narrowing: 'overpair' }))
    expect(screen.getByText('6.0 live combos')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Add a second range' }))
    await waitFor(() => expect(address()).toEqual({ range: 'AA,KQs', range2: '', board: 'Kd7c4h2s', narrowing: 'overpair' }))
    expect(trail('Narrowings · Range 1')).toEqual([['Flop', 'Overpair', 'Kept 6.0 combos · 66.7 %']])
  })

  it("round-trips both sides' Narrowings through the address", async () => {
    renderAnalysis('en', turn)
    await userEvent.click(pick('Overpair', 'Range 1'))
    await userEvent.click(pick('Set', 'Range 2'))
    await pickCard('9 of hearts')
    await waitFor(() =>
      expect(address()).toEqual({
        range: 'AA,KQs',
        range2: '77,KQs',
        board: 'Kd7c4h2s9h',
        narrowing: 'overpair_overpair',
        narrowing2: 'set_set',
      }),
    )
    const written = window.location.pathname + window.location.search
    cleanup()

    renderAnalysis('en', written)

    expect(liveOf('Range 1')).toBe('6.0 live combos')
    expect(liveOf('Range 2')).toBe('3.0 live combos')
    expect(trail('Narrowings · Range 1')).toEqual([
      ['Flop', 'Overpair', 'Kept 6.0 combos · 66.7 %'],
      ['Turn', 'Overpair', 'Kept 6.0 combos · 100.0 %'],
    ])
    expect(trail('Narrowings · Range 2')).toEqual([
      ['Flop', 'Set', 'Kept 3.0 combos · 50.0 %'],
      ['Turn', 'Set', 'Kept 3.0 combos · 100.0 %'],
    ])
  })
})
