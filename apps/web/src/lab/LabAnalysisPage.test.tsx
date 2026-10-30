import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { Locale } from '../i18n/catalogue'
import { SessionContext } from '../identity/context'
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

beforeEach(() => {
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
    expect(address()).toEqual({})
  })
})

describe('LabAnalysisPage · the address', () => {
  it('carries the Range as text, replacing the address rather than pushing one', async () => {
    renderAnalysis()
    const entries = window.history.length

    await userEvent.click(cell('AKs'))
    await userEvent.click(cell('AA'))

    expect(address()).toEqual({ range: 'AA,AKs' })
    expect(window.location.pathname).toBe('/lab/analysis')
    expect(window.history.length).toBe(entries)
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
    expect(address()).toEqual({ range: 'QQ+,AKs:0.5' })
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
    expect(address()).toEqual({ range: 'AA', source: 'r1' })
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
    expect(address()).toEqual({ range: 'KK', source: 'r3' })
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
