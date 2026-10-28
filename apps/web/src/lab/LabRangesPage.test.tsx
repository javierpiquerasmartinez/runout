import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { Locale } from '../i18n/catalogue'
import { SessionContext } from '../identity/context'
import { fakeSession } from '../test/fakeSession'
import { HAND_CLASSES } from './range'
import { LabRangesPage } from './LabRangesPage'

interface StoredRange {
  id: string
  name: string
  combos: Record<string, number>
}

/** The Account's Ranges as the faked server keeps them. */
let stored: StoredRange[]
/** Writes, as `POST /api/lab/ranges {"name":"OR","combos":{}}`. */
let writes: string[]
/** What the server answers a write with, unless the test leaves it to the faked store. */
let writeReply: (() => Response) | null
/** While set, reading one Range waits for it. */
let readHeld: Promise<void> | null

const aces = { AsAh: 100, AsAd: 100, AsAc: 100, AhAd: 100, AhAc: 100, AdAc: 100 }

beforeEach(() => {
  stored = [
    { id: 'r1', name: 'OR BTN', combos: aces },
    { id: 'r2', name: '3B BB', combos: {} },
  ]
  writes = []
  writeReply = null
  readHeld = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const id = /^\/api\/lab\/ranges\/(.+)$/.exec(url)?.[1]
      if (method === 'GET' && url === '/api/lab/ranges') {
        const summaries = stored.map(({ id, name, combos }) => {
          const comboCount = Object.values(combos).reduce((sum, value) => sum + value, 0) / 100
          return { id, name, comboCount, percent: (comboCount / 1326) * 100 }
        })
        return Response.json(summaries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())))
      }
      if (method === 'GET') {
        await readHeld
        const range = stored.find((each) => each.id === id)
        return range ? Response.json(range) : Response.json({ reason: 'range-not-found' }, { status: 404 })
      }
      writes.push(`${method} ${url} ${String(init?.body)}`)
      if (writeReply) return writeReply()
      const body = JSON.parse(String(init?.body)) as Omit<StoredRange, 'id'>
      const name = body.name.trim()
      if (stored.some((each) => each.id !== id && each.name.toLowerCase() === name.toLowerCase())) {
        return Response.json({ reason: 'range-name-taken' }, { status: 409 })
      }
      const range = { id: id ?? `r${stored.length + 1}`, name, combos: body.combos }
      stored = [...stored.filter((each) => each.id !== range.id), range]
      return Response.json(range, { status: id ? 200 : 201 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

function renderLab(locale: Locale = 'en', path = '/lab/ranges') {
  window.history.replaceState(null, '', path)
  render(
    <I18nProvider initialLocale={locale}>
      <SessionContext.Provider value={fakeSession()}>
        <LabRangesPage />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

const matrix = () => screen.getByRole('group', { name: 'Range matrix' })
const cell = (name: string) => within(matrix()).getByRole('button', { name })
const stats = () => screen.getByRole('region', { name: 'Range stats' })
/** The stats as one line of text, as read block by block, spaces collapsed. */
const textOf = (region: HTMLElement) =>
  Array.from(region.querySelectorAll('p, dt, dd'), (block) => block.textContent!.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
const statsText = () => textOf(stats())
const ranges = () => screen.getByRole('navigation', { name: 'Saved ranges' })
const listed = (name: string) => within(ranges()).getByRole('link', { name: new RegExp(`^${name}`) })
const nameField = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Range name' })
const unsaved = () => screen.queryByText('Unsaved')
const leaveDialog = () => screen.queryByRole('dialog', { name: 'Discard your changes?' })

async function name(value: string) {
  await userEvent.clear(nameField())
  if (value) await userEvent.type(nameField(), value)
}
const save = () => userEvent.click(screen.getByRole('button', { name: /^Save/ }))

describe('LabRangesPage · entering the Lab', () => {
  it('shows an empty matrix of every Hand Class, aces top-left', () => {
    renderLab()

    const cells = within(matrix()).getAllByRole('button')
    expect(cells.map((button) => button.textContent)).toEqual(HAND_CLASSES.map((handClass) => handClass.name))
    expect(cells.slice(0, 3).map((button) => button.textContent)).toEqual(['AA', 'AKs', 'AQs'])
    expect(cells.every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('offers a new Range in the side column', () => {
    renderLab()

    expect(screen.getByRole('button', { name: 'New range' })).toBeTruthy()
  })

  it('starts the stats at nothing', () => {
    renderLab()

    expect(statsText()).toBe(
      '0.0 % of all combos 0.0 of 1326 combos ' +
        'Pairs 0.0 / 78 — Suited 0.0 / 312 — Offsuit 0.0 / 936 —',
    )
  })
})

describe('LabRangesPage · toggling cells', () => {
  it('puts a cell in the Range at 100 % with a click, and takes it out with another', async () => {
    renderLab()

    await userEvent.click(cell('AKs'))
    expect(cell('AKs').getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(cell('AKs'))
    expect(cell('AKs').getAttribute('aria-pressed')).toBe('false')
  })

  it('updates the stats on every change', async () => {
    renderLab()

    await userEvent.click(cell('AA'))
    await userEvent.click(cell('AKs'))
    await userEvent.click(cell('AKo'))

    // 6 + 4 + 12 = 22 Combos, 1.659… % of 1326.
    expect(statsText()).toBe(
      '1.7 % of all combos 22.0 of 1326 combos ' +
        'Pairs 6.0 / 78 27.3 % of the range Suited 4.0 / 312 18.2 % of the range Offsuit 12.0 / 936 54.5 % of the range',
    )

    await userEvent.click(cell('AKo'))
    expect(statsText()).toContain('10.0 of 1326 combos')
    expect(statsText()).toContain('Offsuit 0.0 / 936 0.0 % of the range')
  })

  it('empties the matrix with Clear', async () => {
    renderLab()
    await userEvent.click(cell('AA'))
    await userEvent.click(cell('72o'))

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(within(matrix()).getAllByRole('button').some((button) => button.getAttribute('aria-pressed') === 'true')).toBe(false)
    expect(statsText()).toContain('0.0 of 1326 combos')
  })
})

describe('LabRangesPage · the list of saved Ranges', () => {
  it('lists them by name, with their %', async () => {
    renderLab()

    await waitFor(() => expect(within(ranges()).getAllByRole('link')).toHaveLength(2))
    expect(within(ranges()).getAllByRole('link').map((link) => link.textContent)).toEqual(['3B BB0.0 %', 'OR BTN0.5 %'])
  })

  it('says so briefly when there are none', async () => {
    stored = []
    renderLab()

    expect(await screen.findByText('No saved ranges yet.')).toBeTruthy()
  })
})

describe('LabRangesPage · saving', () => {
  it('saves a new Range under its name, opens it at its own address and lists it', async () => {
    renderLab()
    await userEvent.click(cell('AKs'))
    await name('  OR CO ')

    await save()

    await waitFor(() => expect(window.location.pathname).toBe('/lab/ranges/r3'))
    expect(writes).toEqual(['POST /api/lab/ranges {"name":"OR CO","combos":{"AsKs":100,"AhKh":100,"AdKd":100,"AcKc":100}}'])
    expect(await within(ranges()).findByRole('link', { name: /^OR CO/ })).toBeTruthy()
    expect(listed('OR CO').getAttribute('aria-current')).toBe('page')
    expect(nameField().value).toBe('OR CO')
    expect(unsaved()).toBeNull()
  })

  it('saves an empty Range', async () => {
    renderLab()
    await name('Later')

    await save()

    await waitFor(() => expect(writes).toEqual(['POST /api/lab/ranges {"name":"Later","combos":{}}']))
  })

  it('asks for a name before saving a new Range', async () => {
    renderLab()
    await userEvent.click(cell('AA'))
    await name('   ')

    await save()

    expect(screen.getByRole('alert').textContent).toBe('Name the range to save it.')
    expect(writes).toEqual([])
  })

  it('names the name that is taken, and keeps the edits', async () => {
    renderLab()
    await screen.findByRole('link', { name: /^OR BTN/ })
    await userEvent.click(cell('AA'))
    await name('or btn')

    await save()

    expect((await screen.findByRole('alert')).textContent).toBe('You already have a range called “or btn”.')
    expect(window.location.pathname).toBe('/lab/ranges')
    expect(cell('AA').getAttribute('aria-pressed')).toBe('true')
    expect(unsaved()).toBeTruthy()
  })

  it('says so when a save fails, and keeps the edits', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))
    await userEvent.click(cell('KK'))
    writeReply = () => Response.json({}, { status: 500 })

    await save()

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't save the range. Your changes are still here.")
    expect(cell('KK').getAttribute('aria-pressed')).toBe('true')
    expect(unsaved()).toBeTruthy()
  })

  it('saves an open Range over itself', async () => {
    renderLab('en', '/lab/ranges/r2')
    await waitFor(() => expect(nameField().value).toBe('3B BB'))
    await userEvent.click(cell('AKo'))
    await name('3B BB vs CO')

    await save()

    await waitFor(() => expect(unsaved()).toBeNull())
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatch(/^PUT \/api\/lab\/ranges\/r2 \{"name":"3B BB vs CO","combos":\{"AsKh":100,/)
    expect(window.location.pathname).toBe('/lab/ranges/r2')
    expect(await within(ranges()).findByRole('link', { name: /^3B BB vs CO/ })).toBeTruthy()
  })
})

describe('LabRangesPage · reopening', () => {
  it('opens a Range from the list at its own address, highlighted', async () => {
    renderLab()

    await userEvent.click(await screen.findByRole('link', { name: /^OR BTN/ }))

    expect(window.location.pathname).toBe('/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))
    expect(cell('AA').getAttribute('aria-pressed')).toBe('true')
    expect(statsText()).toContain('6.0 of 1326 combos')
    expect(listed('OR BTN').getAttribute('aria-current')).toBe('page')
    expect(listed('3B BB').getAttribute('aria-current')).toBeNull()
  })

  it('opens a Range by its address', async () => {
    renderLab('en', '/lab/ranges/r1')

    await waitFor(() => expect(nameField().value).toBe('OR BTN'))
    expect(cell('AA').getAttribute('aria-pressed')).toBe('true')
  })

  it("says a Range that is gone or not mine isn't available, on the empty matrix", async () => {
    renderLab('en', '/lab/ranges/gone')

    expect(await screen.findByText("This range isn't available. It may have been deleted, or it isn't yours.")).toBeTruthy()
    expect(within(matrix()).getAllByRole('button').some((button) => button.getAttribute('aria-pressed') === 'true')).toBe(false)
    expect(nameField().value).toBe('')
  })

  it('goes back to an empty matrix at /lab/ranges with New range', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))

    await userEvent.click(screen.getByRole('button', { name: 'New range' }))

    expect(window.location.pathname).toBe('/lab/ranges')
    expect(nameField().value).toBe('')
    expect(cell('AA').getAttribute('aria-pressed')).toBe('false')
  })

  it('waits for a Range opened by its address before saving it', async () => {
    let release = () => {}
    readHeld = new Promise((resolve) => (release = resolve))
    renderLab('en', '/lab/ranges/r1')
    await name('Too soon')

    await save()

    expect(writes).toEqual([])
    expect(screen.getByRole('button', { name: /^Save/ }).getAttribute('aria-label')).toBe('Save. Opening the range…')
    release()
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })
})

describe('LabRangesPage · unsaved changes', () => {
  async function openWithChanges() {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))
    await userEvent.click(cell('KK'))
  }

  it('marks the Range while its name or Combos differ from what was saved', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))
    expect(unsaved()).toBeNull()

    await userEvent.click(cell('KK'))
    expect(unsaved()).toBeTruthy()
    await userEvent.click(cell('KK'))
    expect(unsaved()).toBeNull()

    await name('OR BTN 2')
    expect(unsaved()).toBeTruthy()
    await name('OR BTN')
    expect(unsaved()).toBeNull()
  })

  it('ignores spaces around the name, which saving trims', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))

    await userEvent.type(nameField(), '  ')

    expect(unsaved()).toBeNull()
  })

  it('asks before opening another Range, and stays on Cancel', async () => {
    await openWithChanges()

    await userEvent.click(listed('3B BB'))
    expect(leaveDialog()).toBeTruthy()
    await userEvent.click(within(leaveDialog()!).getByRole('button', { name: 'Cancel' }))

    expect(leaveDialog()).toBeNull()
    expect(window.location.pathname).toBe('/lab/ranges/r1')
    expect(cell('KK').getAttribute('aria-pressed')).toBe('true')
  })

  it('opens the other Range once the changes are discarded', async () => {
    await openWithChanges()

    await userEvent.click(listed('3B BB'))
    await userEvent.click(within(leaveDialog()!).getByRole('button', { name: 'Discard changes' }))

    expect(window.location.pathname).toBe('/lab/ranges/r2')
    await waitFor(() => expect(nameField().value).toBe('3B BB'))
    expect(cell('KK').getAttribute('aria-pressed')).toBe('false')
  })

  it('asks before New range', async () => {
    await openWithChanges()

    await userEvent.click(screen.getByRole('button', { name: 'New range' }))
    expect(window.location.pathname).toBe('/lab/ranges/r1')
    await userEvent.click(within(leaveDialog()!).getByRole('button', { name: 'Discard changes' }))

    expect(window.location.pathname).toBe('/lab/ranges')
    expect(nameField().value).toBe('')
  })

  it('asks before leaving the Lab from the header', async () => {
    await openWithChanges()

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { name: 'Library' }))
    expect(window.location.pathname).toBe('/lab/ranges/r1')
    await userEvent.click(within(leaveDialog()!).getByRole('button', { name: 'Discard changes' }))

    expect(window.location.pathname).toBe('/library')
  })

  it("asks before going back with the browser, and goes back once they're discarded", async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))
    await userEvent.click(listed('3B BB'))
    await waitFor(() => expect(nameField().value).toBe('3B BB'))
    await userEvent.click(cell('KK'))

    window.history.back()

    await waitFor(() => expect(leaveDialog()).toBeTruthy())
    expect(window.location.pathname).toBe('/lab/ranges/r2')
    expect(cell('KK').getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(within(leaveDialog()!).getByRole('button', { name: 'Discard changes' }))

    expect(window.location.pathname).toBe('/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))
  })

  it("asks through the browser's own prompt when closing or reloading the tab, only with changes", async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))
    expect(fireEvent(window, new Event('beforeunload', { cancelable: true }))).toBe(true)

    await userEvent.click(cell('KK'))

    expect(fireEvent(window, new Event('beforeunload', { cancelable: true }))).toBe(false)
  })

  it('leaves without asking when nothing changed', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))

    await userEvent.click(listed('3B BB'))

    expect(leaveDialog()).toBeNull()
    expect(window.location.pathname).toBe('/lab/ranges/r2')
  })
})

describe('LabRangesPage · in Spanish', () => {
  it('names the controls and the stats in Spanish', async () => {
    renderLab('es')

    await userEvent.click(within(screen.getByRole('group', { name: 'Matriz del rango' })).getByRole('button', { name: 'AA' }))

    expect(screen.getByRole('button', { name: 'Nuevo rango' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeTruthy()
    const text = textOf(screen.getByRole('region', { name: 'Estadísticas del rango' }))
    expect(text).toContain('0,5 % del total')
    expect(text).toContain('6,0 de 1326 combos')
    expect(text).toContain('Parejas 6,0 / 78 100,0 % del rango')
  })

  it('names saving and the unsaved mark in Spanish', async () => {
    renderLab('es')
    await screen.findByRole('link', { name: /^OR BTN/ })

    await userEvent.click(within(screen.getByRole('group', { name: 'Matriz del rango' })).getByRole('button', { name: 'AA' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('Sin guardar')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Ponle un nombre al rango para guardarlo.')
    expect(screen.getByRole('navigation', { name: 'Rangos guardados' })).toBeTruthy()
  })
})
