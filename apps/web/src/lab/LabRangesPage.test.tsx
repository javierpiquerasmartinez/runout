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
  tagIds?: string[]
}

interface StoredTag {
  id: string
  name: string
}

/** The Account's Ranges as the faked server keeps them. */
let stored: StoredRange[]
/** The Account's Lab Tags as the faked server keeps them. */
let storedTags: StoredTag[]
/** Writes, as `POST /api/lab/ranges {"name":"OR","combos":{},"tagIds":[]}`. */
let writes: string[]
/** What the server answers a write with, unless the test leaves it to the faked store. */
let writeReply: (() => Response) | null
/** While set, reading one Range waits for it. */
let readHeld: Promise<void> | null
/** While set, a write to the Lab Tags waits for it. */
let tagWriteHeld: Promise<void> | null

const aces = { AsAh: 100, AsAd: 100, AsAc: 100, AhAd: 100, AhAc: 100, AdAc: 100 }

beforeEach(() => {
  stored = [
    { id: 'r1', name: 'OR BTN', combos: aces },
    { id: 'r2', name: '3B BB', combos: {} },
  ]
  storedTags = []
  writes = []
  writeReply = null
  readHeld = null
  tagWriteHeld = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url.startsWith('/api/lab/tags')) return tagsReply(method, url, init)
      const id = /^\/api\/lab\/ranges\/(.+)$/.exec(url)?.[1]
      if (method === 'GET' && (url === '/api/lab/ranges' || url.startsWith('/api/lab/ranges?'))) {
        const query = new URLSearchParams(url.split('?')[1])
        const tags = query.getAll('tag')
        const search = query.get('search')?.toLowerCase() ?? ''
        const kept = stored.filter(
          (range) =>
            (tags.length === 0 || tags.some((tag) => range.tagIds?.includes(tag))) && range.name.toLowerCase().includes(search),
        )
        const summaries = kept.map(({ id, name, combos, tagIds }) => {
          const comboCount = Object.values(combos).reduce((sum, value) => sum + value, 0) / 100
          return { id, name, comboCount, percent: (comboCount / 1326) * 100, tags: tagsOf(tagIds) }
        })
        return Response.json(summaries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())))
      }
      if (method === 'GET') {
        await readHeld
        const range = stored.find((each) => each.id === id)
        return range ? Response.json(opened(range)) : Response.json({ reason: 'range-not-found' }, { status: 404 })
      }
      writes.push(`${method} ${url} ${String(init?.body)}`)
      if (writeReply) return writeReply()
      if (method === 'DELETE') {
        stored = stored.filter((each) => each.id !== id)
        return new Response(null, { status: 204 })
      }
      const copied = /^(.+)\/copies$/.exec(id ?? '')?.[1]
      if (copied) {
        const original = stored.find((each) => each.id === copied)!
        const copy = { ...original, id: `r${stored.length + 1}`, name: `${original.name} (copy)` }
        stored = [...stored, copy]
        return Response.json(opened(copy), { status: 201 })
      }
      const body = JSON.parse(String(init?.body)) as Omit<StoredRange, 'id'>
      const name = body.name.trim()
      if (stored.some((each) => each.id !== id && each.name.toLowerCase() === name.toLowerCase())) {
        return Response.json({ reason: 'range-name-taken' }, { status: 409 })
      }
      const range = { id: id ?? `r${stored.length + 1}`, name, combos: body.combos, tagIds: body.tagIds }
      stored = [...stored.filter((each) => each.id !== range.id), range]
      return Response.json(opened(range), { status: id ? 200 : 201 })
    }),
  )
})

const byName = (a: { name: string }, b: { name: string }) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())

/** The Lab Tags with these ids, as a Range carries them. */
const tagsOf = (tagIds: string[] = []) => storedTags.filter((tag) => tagIds.includes(tag.id)).sort(byName)

/** A Range as the server opens it, with its Tags. */
const opened = ({ tagIds, ...range }: StoredRange) => ({ ...range, tags: tagsOf(tagIds) })

/** The faked `/api/lab/tags`: the Lab Tags, each with how many Ranges carry it. */
async function tagsReply(method: string, url: string, init?: RequestInit): Promise<Response> {
  const id = /^\/api\/lab\/tags\/(.+)$/.exec(url)?.[1]
  if (method === 'GET') {
    const counted = storedTags.map((tag) => ({ ...tag, ranges: stored.filter((range) => range.tagIds?.includes(tag.id)).length }))
    return Response.json(counted.sort(byName))
  }
  writes.push(`${method} ${url} ${String(init?.body)}`)
  await tagWriteHeld
  if (writeReply) return writeReply()
  if (method === 'DELETE') {
    storedTags = storedTags.filter((tag) => tag.id !== id)
    stored = stored.map((range) => ({ ...range, tagIds: range.tagIds?.filter((tagId) => tagId !== id) }))
    return new Response(null, { status: 204 })
  }
  const name = (JSON.parse(String(init?.body)) as { name: string }).name.trim()
  if (storedTags.some((tag) => tag.id !== id && tag.name.toLowerCase() === name.toLowerCase())) {
    return Response.json({ reason: 'tag-name-taken' }, { status: 409 })
  }
  const tag = { id: id ?? `t${storedTags.length + 1}`, name }
  storedTags = [...storedTags.filter((each) => each.id !== tag.id), tag]
  const ranges = stored.filter((range) => range.tagIds?.includes(tag.id)).length
  return Response.json({ ...tag, ranges }, { status: id ? 200 : 201 })
}

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

const brush = () => screen.getByRole('group', { name: 'Brush' })
const preset = (percent: number) => within(brush()).getByRole('radio', { name: `${percent} %` })
/** Which of the shortcuts 100, 75, 50 and 25 % are chosen, in that order. */
const checkedPresets = () => [100, 75, 50, 25].map((percent) => preset(percent).getAttribute('aria-checked') === 'true')
const brushField = () => within(brush()).getByRole<HTMLInputElement>('spinbutton', { name: 'Brush frequency' })
const pressed = (button: HTMLElement) => button.getAttribute('aria-pressed') === 'true'

describe('LabRangesPage · the brush', () => {
  it('starts at 100 %, and marks the shortcut chosen', async () => {
    renderLab()
    expect(checkedPresets()).toEqual([true, false, false, false])
    expect(brushField().value).toBe('100')

    await userEvent.click(preset(50))

    expect(checkedPresets()).toEqual([false, false, true, false])
    expect(brushField().value).toBe('50')
  })

  it('takes any whole number from 1 to 100 typed in its field, marking no shortcut', async () => {
    renderLab()

    await userEvent.clear(brushField())
    await userEvent.type(brushField(), '35')
    await userEvent.click(cell('AKo'))

    expect(checkedPresets()).toEqual([false, false, false, false])
    expect(cell('AKo').title).toBe('AKo · 12 combos · 35 %')
  })

  it('keeps its Frequency while the field holds something outside 1–100, and shows it again on leaving', async () => {
    renderLab()
    await userEvent.click(preset(75))

    // Set whole: typed key by key, 101 would pass through 10.
    for (const typed of ['', '0', '101', '2.5']) {
      fireEvent.change(brushField(), { target: { value: typed } })
      await userEvent.click(cell('AA'))
      expect(cell('AA').title).toBe('AA · 6 combos · 75 %')
      await userEvent.click(cell('AA'))
    }
    fireEvent.blur(brushField())
    expect(brushField().value).toBe('75')
  })
})

describe('LabRangesPage · painting', () => {
  it("sets a cell to the brush's Frequency with a click, filled in proportion and showing the number", async () => {
    renderLab()
    await userEvent.click(preset(50))

    await userEvent.click(cell('AKo'))

    expect(pressed(cell('AKo'))).toBe(true)
    expect(cell('AKo').textContent).toBe('AKo50')
    expect(cell('AKo').title).toBe('AKo · 12 combos · 50 %')
    expect(statsText()).toContain('6.0 of 1326 combos')
  })

  it('shows no number on a cell at 100 %, and tells its Frequency on hover', async () => {
    renderLab()

    expect(cell('AKs').title).toBe('AKs · 4 combos · 0 %')
    await userEvent.click(cell('AKs'))

    expect(cell('AKs').textContent).toBe('AKs')
    expect(cell('AKs').title).toBe('AKs · 4 combos · 100 %')
  })

  it("repaints a cell at another Frequency, and takes out one already at the brush's", async () => {
    renderLab()
    await userEvent.click(cell('QQ'))

    await userEvent.click(preset(25))
    await userEvent.click(cell('QQ'))
    expect(cell('QQ').title).toBe('QQ · 6 combos · 25 %')

    await userEvent.click(cell('QQ'))
    expect(pressed(cell('QQ'))).toBe(false)
    expect(statsText()).toContain('0.0 of 1326 combos')
  })
})

/** Lays the cells out as a grid of 40 px squares, as `document.elementFromPoint` sees them. */
function layOutMatrix() {
  const cells = within(matrix()).getAllByRole('button')
  document.elementFromPoint = (x: number, y: number) => {
    const column = Math.floor(x / 40)
    const row = Math.floor(y / 40)
    return column >= 0 && column < 13 && row >= 0 && row < 13 ? cells[row * 13 + column] : document.body
  }
}
/** The middle of the cell at this row and column of the grid `layOutMatrix` draws. */
const at = (row: number, column: number) => ({ clientX: column * 40 + 20, clientY: row * 40 + 20 })

describe('LabRangesPage · dragging', () => {
  afterEach(() => {
    // jsdom has no layout, so no elementFromPoint of its own.
    delete (document as Partial<Document>).elementFromPoint
  })

  it('paints every cell a fast drag crosses, with one move', () => {
    renderLab()
    layOutMatrix()

    fireEvent.pointerDown(cell('AA'), at(0, 0))
    fireEvent.pointerMove(cell('ATs'), at(0, 4))
    fireEvent.pointerUp(cell('ATs'), at(0, 4))

    expect(['AA', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s'].map((name) => pressed(cell(name)))).toEqual([true, true, true, true, true, false])
  })

  it('keeps taking cells out when the stroke started by taking one out', async () => {
    renderLab()
    await userEvent.click(cell('KK'))
    await userEvent.click(preset(50))
    await userEvent.click(cell('QQ'))
    layOutMatrix()

    // KK and QQ are in, JJ is out; the stroke starts on QQ, at the brush's 50 %.
    fireEvent.pointerDown(cell('QQ'), at(2, 2))
    fireEvent.pointerMove(cell('KK'), at(1, 1))
    fireEvent.pointerMove(cell('JJ'), at(3, 3))
    fireEvent.pointerUp(window, at(3, 3))

    expect(['KK', 'QQ', 'JJ'].map((name) => pressed(cell(name)))).toEqual([false, false, false])
  })

  it('paints only what the pointer crosses when it leaves the matrix and comes back elsewhere', () => {
    renderLab()
    layOutMatrix()

    fireEvent.pointerDown(cell('AA'), at(0, 0))
    fireEvent.pointerMove(document.body, { clientX: -100, clientY: 20 })
    fireEvent.pointerMove(document.body, { clientX: -100, clientY: 300 })
    fireEvent.pointerMove(cell('A7o'), at(7, 0))
    fireEvent.pointerUp(cell('A7o'), at(7, 0))

    expect(['AA', 'AKo', 'A9o', 'A8o', 'A7o'].map((name) => pressed(cell(name)))).toEqual([true, false, false, false, true])
  })

  it('ends the stroke when the pointer is released anywhere', () => {
    renderLab()
    layOutMatrix()

    fireEvent.pointerDown(cell('AA'), at(0, 0))
    fireEvent.pointerUp(document.body, { clientX: 900, clientY: 900 })
    fireEvent.pointerMove(cell('AKs'), at(0, 1))

    expect(pressed(cell('AA'))).toBe(true)
    expect(pressed(cell('AKs'))).toBe(false)
  })
})

const topSlider = () => screen.getByRole<HTMLInputElement>('slider', { name: 'Top % of combos' })
/** What the slider says it is set to. */
const topValue = () => within(screen.getByRole('group', { name: 'Top' })).getByRole('status').textContent

describe('LabRangesPage · the top X % slider', () => {
  it('starts at 0 %', () => {
    renderLab()

    expect(topSlider().value).toBe('0')
    expect(topValue()).toBe('0.0 %')
  })

  it('replaces whatever was painted with the top X % at 100 %, and updates the stats', async () => {
    renderLab()
    await userEvent.click(cell('72o'))

    fireEvent.change(topSlider(), { target: { value: '5' } })

    expect(topValue()).toBe('5.0 %')
    expect(cell('72o').getAttribute('aria-pressed')).toBe('false')
    expect(cell('AKo').getAttribute('aria-pressed')).toBe('true')
    expect(cell('ATs').getAttribute('aria-pressed')).toBe('false')
    // 88+, AKs, 77, AQs, AJs and AKo: 72 Combos, the nearest whole Hand Classes to 66.3.
    expect(statsText()).toContain('5.4 % of all combos 72.0 of 1326 combos')
  })

  it("follows the Range's % when cells are painted by hand", async () => {
    renderLab()
    fireEvent.change(topSlider(), { target: { value: '5' } })

    await userEvent.click(cell('AKo'))

    // 60 Combos are 4.5 % of 1326.
    expect(topValue()).toBe('4.5 %')
    expect(topSlider().value).toBe('4.5')

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(topValue()).toBe('0.0 %')
  })

  it('follows the % of a Range opened from the list', async () => {
    renderLab()

    await userEvent.click(await screen.findByRole('link', { name: /^OR BTN/ }))

    await waitFor(() => expect(topValue()).toBe('0.5 %'))
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
    expect(writes).toEqual(['POST /api/lab/ranges {"name":"OR CO","combos":{"AsKs":100,"AhKh":100,"AdKd":100,"AcKc":100},"tagIds":[]}'])
    expect(await within(ranges()).findByRole('link', { name: /^OR CO/ })).toBeTruthy()
    expect(listed('OR CO').getAttribute('aria-current')).toBe('page')
    expect(nameField().value).toBe('OR CO')
    expect(unsaved()).toBeNull()
  })

  it('saves an empty Range', async () => {
    renderLab()
    await name('Later')

    await save()

    await waitFor(() => expect(writes).toEqual(['POST /api/lab/ranges {"name":"Later","combos":{},"tagIds":[]}']))
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

  it('saves partial Frequencies, and reopens them intact', async () => {
    renderLab()
    await userEvent.click(preset(25))
    await userEvent.click(cell('AKo'))
    await name('Thin')
    await save()
    await waitFor(() => expect(window.location.pathname).toBe('/lab/ranges/r3'))
    expect(stored.find((range) => range.id === 'r3')!.combos.AhKd).toBe(25)

    await userEvent.click(screen.getByRole('button', { name: 'New range' }))
    await userEvent.click(listed('Thin'))

    await waitFor(() => expect(cell('AKo').title).toBe('AKo · 12 combos · 25 %'))
    expect(statsText()).toContain('3.0 of 1326 combos')
    expect(unsaved()).toBeNull()
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

const pasteBox = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Paste a range' })
const exported = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Range as text' }).value
const importButton = () => screen.getByRole('button', { name: /^Import/ })

/** Pastes `text` into the box, as a paste from another tool does. */
async function paste(text: string) {
  await userEvent.click(pasteBox())
  await userEvent.paste(text)
}

describe('LabRangesPage · importing text', () => {
  it('replaces the matrix with the pasted Range, and empties the box', async () => {
    renderLab()
    await userEvent.click(cell('72o'))

    await paste('TT+, AKs, AQo:0.5')
    await userEvent.click(importButton())

    expect(pressed(cell('72o'))).toBe(false)
    expect(pressed(cell('TT'))).toBe(true)
    expect(cell('AQo').textContent).toBe('AQo50')
    expect(statsText()).toContain('40.0 of 1326 combos')
    expect(pasteBox().value).toBe('')
    expect(unsaved()).toBeTruthy()
  })

  it('refuses the whole paste, naming the first piece it does not understand, and changes nothing', async () => {
    renderLab()
    await userEvent.click(cell('72o'))

    await paste('AA,KK:half,QQ,zz')
    await userEvent.click(importButton())

    expect(screen.getByRole('alert').textContent).toBe("“KK:half” isn't range notation Runout understands. Nothing was imported.")
    expect(pressed(cell('72o'))).toBe(true)
    expect(pressed(cell('AA'))).toBe(false)
    expect(pasteBox().value).toBe('AA,KK:half,QQ,zz')
  })

  it('forgets a refusal once the paste is edited', async () => {
    renderLab()
    await paste('AKx')
    await userEvent.click(importButton())

    await userEvent.type(pasteBox(), 's')

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('has nothing to import while the box is empty', async () => {
    renderLab()
    await userEvent.click(cell('AA'))

    await userEvent.click(importButton())

    expect(pressed(cell('AA'))).toBe(true)
  })

  it('marks a cell whose Combos differ as mixed, at their average, and paints all its Combos with the brush', async () => {
    renderLab()
    await paste('AhKh,AsKs:0.5')
    await userEvent.click(importButton())

    expect(cell('AKs').textContent).toBe('AKs≈38')
    expect(cell('AKs').title).toBe('AKs · 4 combos · mixed, 38 % on average')

    await userEvent.click(cell('AKs'))

    expect(cell('AKs').textContent).toBe('AKs')
    expect(statsText()).toContain('4.0 of 1326 combos')
  })
})

describe('LabRangesPage · exporting text', () => {
  let writeText: ReturnType<typeof vi.fn>
  beforeEach(() => {
    writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  it('shows the Range in PioSolver notation as it is painted', async () => {
    renderLab()
    expect(exported()).toBe('')

    await userEvent.click(cell('AA'))
    await userEvent.click(cell('KK'))
    await userEvent.click(preset(50))
    await userEvent.click(cell('AKo'))

    expect(exported()).toBe('KK+,AKo:0.5')
  })

  it('copies it with Copy range, and says so', async () => {
    renderLab()
    await userEvent.click(cell('AA'))

    await userEvent.click(screen.getByRole('button', { name: /^Copy range/ }))

    expect(writeText).toHaveBeenCalledWith('AA')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })
})

describe('LabRangesPage · duplicating and deleting', () => {
  const duplicateButton = () => screen.queryByRole('button', { name: /^Duplicate/ })
  const deleteButton = () => screen.queryByRole('button', { name: /^Delete range/ })
  const duplicateDialog = () => screen.queryByRole('dialog', { name: 'Duplicate without your changes?' })
  const deleteDialog = () => screen.queryByRole('dialog', { name: 'Delete “OR BTN”?' })

  async function open() {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN'))
  }

  it('offers neither on a Range never saved', async () => {
    renderLab()
    await screen.findByRole('link', { name: /^OR BTN/ })

    expect(duplicateButton()).toBeNull()
    expect(deleteButton()).toBeNull()
  })

  it('duplicates a saved Range and opens the copy at its own address', async () => {
    await open()

    await userEvent.click(duplicateButton()!)

    expect(writes).toEqual(['POST /api/lab/ranges/r1/copies undefined'])
    await waitFor(() => expect(window.location.pathname).toBe('/lab/ranges/r3'))
    expect(nameField().value).toBe('OR BTN (copy)')
    expect(cell('AA').getAttribute('aria-pressed')).toBe('true')
    expect(unsaved()).toBeNull()
    await waitFor(() => expect(listed('OR BTN \\(copy\\)').getAttribute('aria-current')).toBe('page'))
  })

  it('asks before duplicating over unsaved changes, and copies what was saved', async () => {
    await open()
    await userEvent.click(cell('KK'))

    await userEvent.click(duplicateButton()!)
    expect(writes).toEqual([])
    await userEvent.click(within(duplicateDialog()!).getByRole('button', { name: 'Cancel' }))
    expect(cell('KK').getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(duplicateButton()!)
    await userEvent.click(within(duplicateDialog()!).getByRole('button', { name: 'Duplicate without them' }))

    await waitFor(() => expect(window.location.pathname).toBe('/lab/ranges/r3'))
    expect(nameField().value).toBe('OR BTN (copy)')
    expect(cell('KK').getAttribute('aria-pressed')).toBe('false')
    expect(leaveDialog()).toBeNull()
  })

  it('says a duplicate failed and keeps the screen as it was', async () => {
    await open()
    await userEvent.click(cell('KK'))
    writeReply = () => Response.json({ reason: 'range-not-found' }, { status: 404 })

    await userEvent.click(duplicateButton()!)
    await userEvent.click(within(duplicateDialog()!).getByRole('button', { name: 'Duplicate without them' }))

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't duplicate the range.")
    expect(window.location.pathname).toBe('/lab/ranges/r1')
    expect(cell('KK').getAttribute('aria-pressed')).toBe('true')
    expect(unsaved()).toBeTruthy()
  })

  it('deletes a Range once confirmed, back to the empty matrix', async () => {
    await open()
    await userEvent.click(cell('KK'))

    await userEvent.click(deleteButton()!)
    expect(writes).toEqual([])
    await userEvent.click(within(deleteDialog()!).getByRole('button', { name: 'Delete range' }))

    expect(writes).toEqual(['DELETE /api/lab/ranges/r1 undefined'])
    await waitFor(() => expect(window.location.pathname).toBe('/lab/ranges'))
    expect(nameField().value).toBe('')
    expect(cell('AA').getAttribute('aria-pressed')).toBe('false')
    expect(leaveDialog()).toBeNull()
    await waitFor(() => expect(within(ranges()).queryByRole('link', { name: /^OR BTN/ })).toBeNull())
    expect(listed('3B BB')).toBeTruthy()
  })

  it('keeps the Range when deleting is cancelled', async () => {
    await open()

    await userEvent.click(deleteButton()!)
    await userEvent.click(within(deleteDialog()!).getByRole('button', { name: 'Cancel' }))

    expect(writes).toEqual([])
    expect(window.location.pathname).toBe('/lab/ranges/r1')
    expect(nameField().value).toBe('OR BTN')
  })

  it('says a delete failed and keeps the screen as it was', async () => {
    await open()
    await userEvent.click(cell('KK'))
    writeReply = () => new Response('', { status: 500 })

    await userEvent.click(deleteButton()!)
    await userEvent.click(within(deleteDialog()!).getByRole('button', { name: 'Delete range' }))

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't delete the range. It's still here.")
    expect(deleteDialog()).toBeNull()
    expect(window.location.pathname).toBe('/lab/ranges/r1')
    expect(cell('KK').getAttribute('aria-pressed')).toBe('true')
    expect(listed('OR BTN')).toBeTruthy()
  })

  it('treats a Range already deleted elsewhere as deleted', async () => {
    await open()
    writeReply = () => Response.json({ reason: 'range-not-found' }, { status: 404 })

    await userEvent.click(deleteButton()!)
    await userEvent.click(within(deleteDialog()!).getByRole('button', { name: 'Delete range' }))

    await waitFor(() => expect(window.location.pathname).toBe('/lab/ranges'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(nameField().value).toBe('')
  })

  it('names duplicating and deleting in Spanish', async () => {
    renderLab('es', '/lab/ranges/r1')
    await waitFor(() => expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Nombre del rango' }).value).toBe('OR BTN'))

    expect(screen.getByRole('button', { name: /^Duplicar/ })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /^Borrar rango/ }))

    const dialog = screen.getByRole('dialog', { name: '¿Borrar «OR BTN»?' })
    expect(within(dialog).getByRole('button', { name: 'Borrar rango' })).toBeTruthy()
  })
})

describe('LabRangesPage · in Spanish', () => {
  it('names the controls and the stats in Spanish', async () => {
    renderLab('es')

    await userEvent.click(within(screen.getByRole('group', { name: 'Matriz del rango' })).getByRole('button', { name: 'AA' }))

    expect(screen.getByRole('button', { name: 'Nuevo rango' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeTruthy()
    const brocha = screen.getByRole('group', { name: 'Brocha' })
    expect(within(brocha).getByRole('radio', { name: '50 %' })).toBeTruthy()
    expect(within(brocha).getByRole('spinbutton', { name: 'Frecuencia de la brocha' })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Matriz del rango' })).getByRole('button', { name: 'AA' }).title).toBe(
      'AA · 6 combos · 100 %',
    )
    const text = textOf(screen.getByRole('region', { name: 'Estadísticas del rango' }))
    expect(text).toContain('0,5 % del total')
    expect(text).toContain('6,0 de 1326 combos')
    expect(text).toContain('Parejas 6,0 / 78 100,0 % del rango')
    expect(screen.getByRole('slider', { name: 'Top % de los combos' })).toBeTruthy()
    expect(topValue()).toBe('0,5 %')
    expect(screen.getByRole('textbox', { name: 'Pega un rango' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Rango en texto' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Copiar rango/ })).toBeTruthy()
  })

  it('names importing and its refusal in Spanish', async () => {
    renderLab('es')

    await userEvent.click(screen.getByRole('textbox', { name: 'Pega un rango' }))
    await userEvent.paste('AA,AKx')
    await userEvent.click(screen.getByRole('button', { name: /^Importar/ }))

    expect(screen.getByRole('alert').textContent).toBe('Runout no entiende «AKx» como notación de rangos. No se ha importado nada.')
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

describe('LabRangesPage · Tags on a Range', () => {
  beforeEach(() => {
    storedTags = [
      { id: 't1', name: 'OR' },
      { id: 't2', name: 'BTN' },
      { id: 't3', name: '3B' },
    ]
    stored = [
      { id: 'r1', name: 'OR BTN', combos: aces, tagIds: ['t1'] },
      { id: 'r2', name: '3B BB', combos: {} },
    ]
  })

  const rangeTags = () => screen.getByRole('group', { name: 'Range tags' })
  const tagField = () => within(rangeTags()).getByRole<HTMLInputElement>('combobox', { name: 'Add a tag' })
  const chips = () => tagsOnRange(rangeTags())

  it("shows the open Range's Tags, and each Range's Tags in the list", async () => {
    renderLab('en', '/lab/ranges/r1')

    await waitFor(() => expect(chips()).toEqual(['OR']))
    expect(listed('OR BTN').textContent).toContain('OR')
  })

  it('suggests the Lab Tags not on the Range yet', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(chips()).toEqual(['OR']))

    await waitFor(() =>
      expect(within(rangeTags()).getAllByRole('option', { hidden: true }).map((option) => (option as HTMLOptionElement).value)).toEqual([
        '3B',
        'BTN',
      ]),
    )
  })

  it('puts an existing Tag on the Range, whatever its case, and saves it with the Range', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(chips()).toEqual(['OR']))

    await userEvent.type(tagField(), 'btn{Enter}')

    expect(chips()).toEqual(['BTN', 'OR'])
    expect(tagField().value).toBe('')
    expect(unsaved()).toBeTruthy()
    expect(writes).toEqual([])
    await save()
    await waitFor(() => expect(unsaved()).toBeNull())
    expect(writes).toEqual([
      `PUT /api/lab/ranges/r1 ${JSON.stringify({ name: 'OR BTN', combos: aces, tagIds: ['t2', 't1'] })}`,
    ])
  })

  it('creates a Tag on a new name and puts it on the Range', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(chips()).toEqual(['OR']))

    await userEvent.type(tagField(), ' vs BB {Enter}')

    await waitFor(() => expect(chips()).toEqual(['OR', 'vs BB']))
    expect(writes).toEqual([`POST /api/lab/tags ${JSON.stringify({ name: 'vs BB' })}`])
    expect(within(sideTags()).getByText('vs BB')).toBeTruthy()
    expect(unsaved()).toBeTruthy()
  })

  it('puts on every new Tag typed one after another, without waiting for the first', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(chips()).toEqual(['OR']))
    let release = () => {}
    tagWriteHeld = new Promise((resolve) => (release = resolve))

    await userEvent.type(tagField(), 'vs BB{Enter}CO{Enter}')
    release()

    await waitFor(() => expect(chips()).toEqual(['CO', 'OR', 'vs BB']))
    expect(writes).toEqual([
      `POST /api/lab/tags ${JSON.stringify({ name: 'vs BB' })}`,
      `POST /api/lab/tags ${JSON.stringify({ name: 'CO' })}`,
    ])
  })

  it('says why a new Tag could not be made, and keeps what was typed', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(chips()).toEqual(['OR']))
    writeReply = () => Response.json({ reason: 'invalid-tag-name' }, { status: 400 })

    await userEvent.type(tagField(), 'x{Enter}')

    expect(await within(rangeTags()).findByRole('alert')).toHaveProperty(
      'textContent',
      'A tag needs a name of up to 40 characters.',
    )
    expect(tagField().value).toBe('x')
    expect(chips()).toEqual(['OR'])
  })

  it('takes a Tag off the Range, which is then unsaved until put back', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(chips()).toEqual(['OR']))

    await userEvent.click(within(rangeTags()).getByRole('button', { name: 'Remove OR' }))

    expect(chips()).toEqual([])
    expect(unsaved()).toBeTruthy()
    await userEvent.type(tagField(), 'OR{Enter}')
    expect(unsaved()).toBeNull()
  })

  it('puts Tags on a new Range and saves them with it', async () => {
    renderLab()
    await waitFor(() => expect(within(sideTags()).getByText('OR')).toBeTruthy())

    await userEvent.type(tagField(), 'OR{Enter}')
    await name('OR CO')
    await save()

    await waitFor(() => expect(window.location.pathname).toBe('/lab/ranges/r3'))
    expect(writes).toEqual([`POST /api/lab/ranges ${JSON.stringify({ name: 'OR CO', combos: {}, tagIds: ['t1'] })}`])
    expect(chips()).toEqual(['OR'])
  })

  it('names the Tag field in Spanish', async () => {
    renderLab('es', '/lab/ranges/r1')

    const group = await screen.findByRole('group', { name: 'Etiquetas del rango' })
    expect(within(group).getByRole('combobox', { name: 'Añadir una etiqueta' })).toBeTruthy()
    expect(await within(group).findByRole('button', { name: 'Quitar OR' })).toBeTruthy()
  })
})

const sideTags = () => screen.getByRole('group', { name: 'Tags' })
/** The Tags on the Range, read from the button that takes each off. */
const tagsOnRange = (group: HTMLElement) =>
  within(group)
    .queryAllByRole('button', { name: /^(Remove|Quitar) / })
    .map((button) => button.getAttribute('aria-label')!.replace(/^(Remove|Quitar) /, ''))

describe("LabRangesPage · the side column's Tags", () => {
  beforeEach(() => {
    storedTags = [
      { id: 't1', name: 'OR' },
      { id: 't2', name: 'BTN' },
    ]
    stored = [
      { id: 'r1', name: 'OR BTN', combos: aces, tagIds: ['t1', 't2'] },
      { id: 'r2', name: 'OR CO', combos: {}, tagIds: ['t1'] },
    ]
  })

  const rangeChips = () => tagsOnRange(screen.getByRole('group', { name: 'Range tags' }))

  it('lists the Lab Tags with how many Ranges carry each', async () => {
    renderLab()

    await waitFor(() => expect(within(sideTags()).getByText('BTN')).toBeTruthy())
    expect(sideTags().textContent).toBe('TagsBTN1OR2New tag')
  })

  it("renames a Tag with the pencil, on the open Range and in the list, without marking it unsaved", async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(rangeChips()).toEqual(['BTN', 'OR']))

    await userEvent.click(within(sideTags()).getByRole('button', { name: 'Edit tags' }))
    const field = within(sideTags()).getByRole('textbox', { name: 'Rename OR' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Open{Enter}')

    await waitFor(() => expect(rangeChips()).toEqual(['BTN', 'Open']))
    expect(writes).toEqual([`PATCH /api/lab/tags/t1 ${JSON.stringify({ name: 'Open' })}`])
    expect(unsaved()).toBeNull()
    await waitFor(() => expect(listed('OR CO').textContent).toContain('Open'))
  })

  it('deletes a Tag once confirmed, taking it off the open Range without marking it unsaved', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(rangeChips()).toEqual(['BTN', 'OR']))

    await userEvent.click(within(sideTags()).getByRole('button', { name: 'Edit tags' }))
    await userEvent.click(within(sideTags()).getByRole('button', { name: 'Delete OR' }))
    await userEvent.click(within(sideTags()).getByRole('button', { name: 'Delete OR from 2 ranges' }))

    await waitFor(() => expect(rangeChips()).toEqual(['BTN']))
    expect(writes).toEqual(['DELETE /api/lab/tags/t1 undefined'])
    expect(unsaved()).toBeNull()
    expect(stored.find((range) => range.id === 'r1')?.combos).toEqual(aces)
    await waitFor(() => expect(within(sideTags()).queryByText('OR')).toBeNull())
  })

  it('keeps the changes unsaved on the open Range when a Tag is renamed or deleted', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(rangeChips()).toEqual(['BTN', 'OR']))
    await userEvent.click(within(screen.getByRole('group', { name: 'Range tags' })).getByRole('button', { name: 'Remove BTN' }))

    await userEvent.click(within(sideTags()).getByRole('button', { name: 'Edit tags' }))
    await userEvent.click(within(sideTags()).getByRole('button', { name: 'Delete OR' }))
    await userEvent.click(within(sideTags()).getByRole('button', { name: 'Delete OR from 2 ranges' }))

    await waitFor(() => expect(rangeChips()).toEqual([]))
    // BTN taken off is still a change.
    expect(unsaved()).toBeTruthy()
  })

  it('names deleting a Tag from its Ranges in Spanish', async () => {
    renderLab('es')
    const side = () => screen.getByRole('group', { name: 'Etiquetas' })
    await waitFor(() => expect(within(side()).getByText('BTN')).toBeTruthy())

    await userEvent.click(within(side()).getByRole('button', { name: 'Editar etiquetas' }))
    await userEvent.click(within(side()).getByRole('button', { name: 'Borrar BTN' }))

    expect(within(side()).getByRole('button', { name: 'Borrar BTN de 1 rango' })).toBeTruthy()
  })
})

describe('LabRangesPage · finding a Range', () => {
  beforeEach(() => {
    storedTags = [
      { id: 't1', name: 'OR' },
      { id: 't2', name: '3B' },
    ]
    stored = [
      { id: 'r1', name: 'OR BTN vs BB', combos: aces, tagIds: ['t1'] },
      { id: 'r2', name: 'OR CO', combos: {}, tagIds: ['t1'] },
      { id: 'r3', name: '3B BB vs CO', combos: {}, tagIds: ['t2'] },
      { id: 'r4', name: 'Untagged', combos: {} },
    ]
  })

  /** The names the list shows, in order: each link's text starts with its Range's name. */
  const listedNames = () => {
    const names = stored.map((range) => range.name)
    return within(ranges())
      .queryAllByRole('link')
      .map((link) => names.find((name) => link.textContent?.startsWith(name)))
  }
  const sideTag = (name: string) => within(sideTags()).getByRole('button', { name: new RegExp(`^${name}`) })

  it('shows only the Ranges carrying any of the Tags chosen, and all of them once none is', async () => {
    renderLab()
    await waitFor(() => expect(listedNames()).toHaveLength(4))

    await userEvent.click(sideTag('OR'))
    await waitFor(() => expect(listedNames()).toEqual(['OR BTN vs BB', 'OR CO']))
    expect(pressed(sideTag('OR'))).toBe(true)

    await userEvent.click(sideTag('3B'))
    await waitFor(() => expect(listedNames()).toEqual(['3B BB vs CO', 'OR BTN vs BB', 'OR CO']))

    await userEvent.click(sideTag('OR'))
    await userEvent.click(sideTag('3B'))
    await waitFor(() => expect(listedNames()).toHaveLength(4))
  })

  const searchBox = () => screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search ranges' })

  it('narrows the list by name as the person types, ignoring case', async () => {
    renderLab()
    await waitFor(() => expect(listedNames()).toHaveLength(4))

    await userEvent.type(searchBox(), 'bb')
    await waitFor(() => expect(listedNames()).toEqual(['3B BB vs CO', 'OR BTN vs BB']))

    await userEvent.type(searchBox(), ' vs c')
    await waitFor(() => expect(listedNames()).toEqual(['3B BB vs CO']))

    await userEvent.clear(searchBox())
    await waitFor(() => expect(listedNames()).toHaveLength(4))
  })

  it('combines the search with the Tags chosen', async () => {
    renderLab()
    await waitFor(() => expect(listedNames()).toHaveLength(4))

    await userEvent.click(sideTag('OR'))
    await userEvent.type(searchBox(), 'bb')

    await waitFor(() => expect(listedNames()).toEqual(['OR BTN vs BB']))
  })

  it('says when nothing matches, and clears the search and the Tags from there', async () => {
    renderLab()
    await waitFor(() => expect(listedNames()).toHaveLength(4))
    await userEvent.click(sideTag('3B'))
    await userEvent.type(searchBox(), 'btn')

    await waitFor(() => expect(within(ranges()).getByText('No ranges match these filters.')).toBeTruthy())
    expect(within(ranges()).queryByText('No saved ranges yet.')).toBeNull()

    await userEvent.click(within(ranges()).getByRole('button', { name: 'Clear filters' }))

    await waitFor(() => expect(listedNames()).toHaveLength(4))
    expect(searchBox().value).toBe('')
    expect(pressed(sideTag('3B'))).toBe(false)
  })

  it('keeps the open Range open when the filter hides it from the list', async () => {
    renderLab('en', '/lab/ranges/r1')
    await waitFor(() => expect(nameField().value).toBe('OR BTN vs BB'))

    await userEvent.click(sideTag('3B'))

    await waitFor(() => expect(listedNames()).toEqual(['3B BB vs CO']))
    expect(nameField().value).toBe('OR BTN vs BB')
    expect(statsText()).toContain('6.0 of 1326 combos')
    expect(window.location.pathname).toBe('/lab/ranges/r1')
  })

  it('drops a deleted Tag from the filter', async () => {
    renderLab()
    await waitFor(() => expect(listedNames()).toHaveLength(4))
    await userEvent.click(sideTag('3B'))
    await waitFor(() => expect(listedNames()).toEqual(['3B BB vs CO']))

    await userEvent.click(within(sideTags()).getByRole('button', { name: 'Edit tags' }))
    await userEvent.click(within(sideTags()).getByRole('button', { name: 'Delete 3B' }))
    await userEvent.click(within(sideTags()).getByRole('button', { name: 'Delete 3B from 1 range' }))

    await waitFor(() => expect(listedNames()).toHaveLength(4))
  })

  it('names the search and the empty result in Spanish', async () => {
    renderLab('es')
    const list = () => screen.getByRole('navigation', { name: 'Rangos guardados' })
    await waitFor(() => expect(within(list()).getAllByRole('link')).toHaveLength(4))

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar rangos' }), 'zzz')

    await waitFor(() => expect(within(list()).getByText('Ningún rango cumple estos filtros.')).toBeTruthy())
    expect(within(list()).getByRole('button', { name: 'Limpiar filtros' })).toBeTruthy()
  })

  it('offers to clear the filters when the server cannot read them', async () => {
    renderLab()
    await waitFor(() => expect(listedNames()).toHaveLength(4))
    await userEvent.click(sideTag('OR'))
    await waitFor(() => expect(listedNames()).toHaveLength(2))
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({ reason: 'invalid-range-filter' }, { status: 400 }))

    await userEvent.type(searchBox(), 'x')

    await waitFor(() => expect(within(ranges()).getByRole('alert').textContent).toBe("The server couldn't read these filters. Clear them and try again."))
    await userEvent.click(within(ranges()).getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(listedNames()).toHaveLength(4))
  })
})
