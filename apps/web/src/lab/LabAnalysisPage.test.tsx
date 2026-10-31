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
/** Writes, as `POST /api/lab/ranges {"name":"OR","combos":{},"tagIds":[]}`. */
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
      writes.push(`${method} ${url} ${String(init?.body)}`)
      const body = JSON.parse(String(init?.body)) as Omit<StoredRange, 'id'>
      const name = body.name.trim()
      if (name.length > 60) return Response.json({ reason: 'invalid-range-name' }, { status: 400 })
      if (stored.some((each) => each.name.toLowerCase() === name.toLowerCase())) {
        return Response.json({ reason: 'range-name-taken' }, { status: 409 })
      }
      const range = { id: `r${stored.length + 1}`, name, combos: body.combos }
      stored = [...stored, range]
      return Response.json({ ...range, tags: [] }, { status: 201 })
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

describe('LabAnalysisPage · pasting a Range', () => {
  const paste = async (text: string) => {
    await userEvent.type(screen.getByRole('textbox', { name: 'Paste a range' }), text)
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
  }

  it("replaces the Range with what was pasted, in the Lab's notation", async () => {
    renderAnalysis('en', '/lab/analysis?range=72o')

    await paste('QQ+,AKs:0.5')

    expect(pressed()).toEqual(['AA', 'AKs', 'KK', 'QQ'])
    await waitFor(() => expect(address()).toEqual({ range: 'QQ+,AKs:0.5' }))
  })

  it('refuses the whole text, naming the first piece not understood', async () => {
    renderAnalysis('en', '/lab/analysis?range=72o')

    await paste('AA,banana,KK')

    expect(screen.getByRole('alert').textContent).toBe("“banana” isn't range notation Runout understands. Nothing was imported.")
    expect(pressed()).toEqual(['72o'])
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

describe('LabAnalysisPage · saving as a new Range', () => {
  const saveAs = () => userEvent.click(screen.getByRole('button', { name: 'Save as range' }))
  const dialog = () => screen.getByRole('dialog', { name: 'Save as a new range' })
  const nameField = () => within(dialog()).getByRole<HTMLInputElement>('textbox', { name: 'Range name' })
  const confirm = () => userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))

  it('asks for a name, saves a new Range with the Combos on screen and stays in the Analysis with it as the source', async () => {
    renderAnalysis('en', '/lab/analysis?range=KK&source=r1')
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('OR BTN'))

    await saveAs()
    await userEvent.type(nameField(), '  OR CO ')
    await confirm()

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(writes).toEqual(['POST /api/lab/ranges {"name":"OR CO","combos":{"KsKh":100,"KsKd":100,"KsKc":100,"KhKd":100,"KhKc":100,"KdKc":100},"tagIds":[]}'])
    expect(stored.find((range) => range.id === 'r1')!.combos).toEqual(aces)
    expect(window.location.pathname).toBe('/lab/analysis')
    await waitFor(() => expect(address()).toEqual({ range: 'KK', source: 'r3' }))
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('OR CO')
    expect(screen.queryByText('Changed')).toBeNull()
    expect(within(screen.getByRole('combobox', { name: 'Load a saved range' })).getByRole('option', { name: 'OR CO' })).toBeTruthy()
  })

  it('saves with Enter in the name field', async () => {
    renderAnalysis('en', '/lab/analysis?range=KK')

    await saveAs()
    await userEvent.type(nameField(), 'OR CO{Enter}')

    await waitFor(() => expect(writes).toHaveLength(1))
  })

  it('asks for a name before saving without one', async () => {
    renderAnalysis('en', '/lab/analysis?range=KK')

    await saveAs()
    await userEvent.type(nameField(), '   ')
    await confirm()

    expect(within(dialog()).getByRole('alert').textContent).toBe('Name the range to save it.')
    expect(writes).toEqual([])
  })

  it('takes names up to 60 characters', async () => {
    renderAnalysis()

    await saveAs()

    expect(nameField().maxLength).toBe(60)
  })

  it('refuses a name already in use, saying which, and keeps the dialog open', async () => {
    renderAnalysis('en', '/lab/analysis?range=KK')

    await saveAs()
    await userEvent.type(nameField(), 'or btn')
    await confirm()

    expect(await within(dialog()).findByRole('alert')).toHaveProperty('textContent', 'You already have a range called “or btn”.')
    expect(address()).toEqual({ range: 'KK' })
  })

  it('is in Spanish too', async () => {
    renderAnalysis('es')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar como rango' }))

    expect(screen.getByRole('dialog', { name: 'Guardar como un rango nuevo' })).toBeTruthy()
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
    expect(within(region).getByRole('button', { name: 'Guardar selección como rango' })).toBeTruthy()
  })
})

describe('LabAnalysisPage · saving a selection as a Range', () => {
  const dialog = () => screen.getByRole('dialog', { name: 'Save the selection as a new range' })
  const nameField = () => within(dialog()).getByRole<HTMLInputElement>('textbox', { name: 'Range name' })
  const confirm = () => userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
  const selectAndSave = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Overpair' }))
    await userEvent.click(screen.getByRole('button', { name: 'Top pair' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save selection as range' }))
  }

  it('asks for a name, saves the selected Combos at their Frequencies and stays in the Analysis as it was', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%3A0.5%2C77&source=r1&board=Kd7c4h')
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('OR BTN'))

    await selectAndSave()
    await userEvent.type(nameField(), ' Overpairs and top pair ')
    await confirm()

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(writes).toHaveLength(1)
    const body = JSON.parse(writes[0].slice('POST /api/lab/ranges '.length)) as Omit<StoredRange, 'id'>
    expect(body.name).toBe('Overpairs and top pair')
    // KdQd holds a Board card.
    expect(body.combos).toEqual({ ...aces, KsQs: 50, KhQh: 50, KcQc: 50 })
    expect(window.location.pathname).toBe('/lab/analysis')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('OR BTN')
    expect(within(screen.getByRole('region', { name: 'Selection' })).getByRole('status').textContent).toBe(
      'Saved as “Overpairs and top pair”.',
    )
    expect(
      within(screen.getByRole('combobox', { name: 'Load a saved range' })).getByRole('option', { name: 'Overpairs and top pair' }),
    ).toBeTruthy()
    await waitFor(() => expect(address()).toEqual({ range: 'AA,KQs:0.5,77', source: 'r1', board: 'Kd7c4h' }))
  })

  it('follows the name rules of any Range', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs%2C77&board=Kd7c4h')

    await selectAndSave()
    expect(nameField().maxLength).toBe(60)
    await confirm()
    expect(within(dialog()).getByRole('alert').textContent).toBe('Name the range to save it.')
    await userEvent.type(nameField(), 'or btn')
    await confirm()

    expect(await within(dialog()).findByRole('alert')).toHaveProperty('textContent', 'You already have a range called “or btn”.')
    // Only the refused one reached the server.
    expect(writes).toHaveLength(1)
  })

  it('is in Spanish too', async () => {
    renderAnalysis('es', '/lab/analysis?range=AA&board=Kd7c4h')

    await userEvent.click(screen.getByRole('button', { name: 'Overpair' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar selección como rango' }))

    expect(screen.getByRole('dialog', { name: 'Guardar la selección como un rango nuevo' })).toBeTruthy()
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

  it('is loaded, painted, pasted, cleared and saved on its own, the brush painting whichever matrix is pressed', async () => {
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

    await userEvent.type(within(side('Range 1')).getByRole('textbox', { name: 'Paste a range' }), 'QQ')
    await userEvent.click(within(side('Range 1')).getByRole('button', { name: 'Import' }))
    expect(pressedIn(side('Range 1'))).toEqual(['QQ'])
    await waitFor(() => expect(address()).toEqual({ range: 'QQ', range2: 'KK+', source2: 'r1' }))

    await userEvent.click(within(second).getByRole('button', { name: 'Clear' }))
    expect(pressedIn(second)).toEqual([])
    expect(pressedIn(side('Range 1'))).toEqual(['QQ'])

    await userEvent.click(within(side('Range 1')).getByRole('button', { name: 'Save as range' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Range name' }), 'QQ only{Enter}')
    await waitFor(() => expect(within(side('Range 1')).getByRole('heading', { level: 2 }).textContent).toBe('QQ only'))
    expect(JSON.parse(writes[0].slice('POST /api/lab/ranges '.length))).toMatchObject({ name: 'QQ only', combos: { QsQh: 100 } })
    expect(within(second).getByRole('heading', { level: 2 }).textContent).toBe('OR BTN')
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
  const row = (category: string) => screen.getByRole('button', { name: category })
  const title = (region: string, name: string) =>
    within(within(side(region)).getByRole('group', { name: 'Range matrix' })).getByRole('button', { name }).getAttribute('title')

  it("show a column per side, each over that side's own live Combos", () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')

    const rows = tableRows('Made hands')
    expect(rows.slice(0, 2)).toEqual([' | Range 1 | Range 2', 'Made hand | Combos | % | Combos | %'])
    expect(rows).toContain('Set | 0.0 | 0.0 % | 3.0 | 50.0 %')
    expect(rows).toContain('Overpair | 6.0 | 66.7 % | 0.0 | 0.0 %')
    expect(rows).toContain('Top pair | 3.0 | 33.3 % | 3.0 | 50.0 %')
  })

  it('light up a selection in both matrices, with each side its combined %', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')

    await userEvent.click(row('Top pair'))
    await userEvent.click(row('Set'))

    expect(Array.from(screen.getByRole('region', { name: 'Selection' }).querySelectorAll('li'), (each) => each.textContent)).toEqual([
      'Range 1: 3.0 combos · 33.3 % of the live combos',
      'Range 2: 6.0 combos · 100.0 % of the live combos',
    ])
    expect(title('Range 1', 'KQs')).toBe('KQs · 4 combos · 100 % · 1 removed by the board or the dead cards · 3 in the selection')
    expect(title('Range 2', 'KQs')).toBe('KQs · 4 combos · 100 % · 1 removed by the board or the dead cards · 3 in the selection')
    expect(title('Range 2', '77')).toBe('77 · 6 combos · 100 % · 3 removed by the board or the dead cards · 3 in the selection')
    expect(title('Range 1', 'AA')).toBe('AA · 6 combos · 100 %')
  })

  it('ask which side a selection is saved from', async () => {
    renderAnalysis('en', '/lab/analysis?range=AA%2CKQs&range2=KQs%2C77&board=Kd7c4h')
    await userEvent.click(row('Set'))
    await userEvent.click(row('Overpair'))
    await userEvent.click(screen.getByRole('button', { name: 'Save selection as range' }))
    const dialog = screen.getByRole('dialog', { name: 'Save the selection as a new range' })
    const choice = within(dialog).getByRole('radiogroup', { name: 'Save the combos of' })

    expect(within(choice).getByRole('radio', { name: 'Range 1' }).getAttribute('aria-checked')).toBe('true')
    await userEvent.click(within(choice).getByRole('radio', { name: 'Range 2' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Range name' }), 'Sets{Enter}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(JSON.parse(writes[0].slice('POST /api/lab/ranges '.length))).toMatchObject({
      name: 'Sets',
      combos: { '7s7h': 100, '7s7d': 100, '7h7d': 100 },
    })
  })

  it('are in Spanish too', async () => {
    renderAnalysis('es', '/lab/analysis?range=AA&range2=KK&board=Kd7c4h')

    expect(screen.getByRole('region', { name: 'Rango 1' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Rango 2' })).getByRole('button', { name: 'Quitar rango' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Overpair' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar selección como rango' }))
    expect(screen.getByRole('radiogroup', { name: 'Guardar los combos de' })).toBeTruthy()
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

  it('is in Spanish too', () => {
    renderAnalysis('es', river)

    expect(lines()).toEqual([
      'Rango 1: Equity 75,0 % · Gana 50,0 % · Empata 50,0 %',
      'Rango 2: Equity 25,0 % · Gana 0,0 % · Empata 50,0 %',
      'Exacta, sin muestreo',
    ])
  })
})
