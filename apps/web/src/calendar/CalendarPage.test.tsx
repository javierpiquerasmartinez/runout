import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, type Locale } from '../i18n'
import { SessionContext } from '../identity/context'
import { Routes } from '../routes/Routes'
import { fakeApi, refusal, type ApiCall } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'
import type { Milestone } from './calendar'

/** The Milestones the faked server holds. */
let stored: Milestone[]
let calls: ApiCall[]
/** What the next create answers instead of creating, when set. */
let createReply: (() => Response) | null

/** A Milestone on `date`, created in the order the test lists them. */
function planned(date: string, title: string, done = false): Milestone {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 9, stored.length)).toISOString()
  const milestone = { id: `m${stored.length + 1}`, title, description: '', date, done, createdAt }
  stored.push(milestone)
  return milestone
}

beforeEach(() => {
  // Saturday 7 November 2026, at noon in the browser's own zone. Only Date is faked: timers run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 7, 12, 0))
  stored = []
  createReply = null
  calls = fakeApi({
    'GET /calendar/milestones': ({ search }) => {
      const query = new URLSearchParams(search)
      const from = query.get('from')!
      const to = query.get('to')!
      const milestones = stored.filter(({ date }) => date >= from && date <= to).sort((a, b) => a.date.localeCompare(b.date))
      return Response.json({ milestones, hasAny: stored.length > 0 })
    },
    'POST /calendar/milestones': ({ body }) => {
      if (createReply) return createReply()
      const { title, description, date } = body as { title: string; description: string; date: string }
      const milestone = planned(date, title.trim())
      milestone.description = description.trim()
      return Response.json(milestone, { status: 201 })
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

function renderAt(path: string, locale: Locale = 'en') {
  window.history.replaceState(null, '', path)
  render(
    <I18nProvider initialLocale={locale}>
      <SessionContext.Provider value={fakeSession()}>
        <Routes />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

const heading = () => screen.findByRole('heading', { level: 1 })
const grid = () => screen.getByRole('grid')
const day = (name: string) => within(grid()).getByRole('gridcell', { name })
const dialog = () => screen.queryByRole('dialog', { name: 'New milestone' })
const titleField = () => within(dialog()!).getByRole<HTMLInputElement>('textbox', { name: 'Title' })
const descriptionField = () => within(dialog()!).getByRole<HTMLTextAreaElement>('textbox', { name: /^Description/ })
const dateField = () => within(dialog()!).getByLabelText<HTMLInputElement>('Date')
const fetchedSpans = () => calls.filter(({ method }) => method === 'GET').map(({ search }) => search)

describe('CalendarPage · entering the Calendar', () => {
  it('opens on the current month, in place of /calendar', async () => {
    window.history.replaceState(null, '', '/library')
    window.history.pushState(null, '', '/calendar')
    const entries = window.history.length
    renderAt('/calendar')

    expect((await heading()).textContent).toBe('November 2026')
    expect(window.location.pathname).toBe('/calendar/month/2026-11')
    expect(window.history.length).toBe(entries)
  })

  it('opens on the current month from an invalid one', async () => {
    renderAt('/calendar/month/2026-13')

    expect((await heading()).textContent).toBe('November 2026')
    expect(window.location.pathname).toBe('/calendar/month/2026-11')
  })

  it('marks Calendar in the header', async () => {
    renderAt('/calendar/month/2026-11')

    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const current = within(nav).getByRole('link', { current: 'page' })
    expect(current.textContent).toBe('Calendar')
    expect(current.getAttribute('href')).toBe('/calendar')
    await heading()
  })

  it('lays the month out from Monday, with the neighbouring days and today', async () => {
    renderAt('/calendar/month/2026-11')
    await heading()

    const cells = within(grid()).getAllByRole('gridcell')
    expect(cells).toHaveLength(42)
    expect(cells[0].getAttribute('aria-label')).toBe('Monday, October 26')
    expect(cells[6].getAttribute('aria-label')).toBe('Sunday, November 1')
    expect(cells[41].getAttribute('aria-label')).toBe('Sunday, December 6')
    expect(day('Saturday, November 7, today')).toBeTruthy()
    expect(await waitFor(() => fetchedSpans())).toEqual(['?from=2026-10-26&to=2026-12-06'])
  })

  it('says the month and its days in Spanish', async () => {
    renderAt('/calendar/month/2026-11', 'es')

    expect((await heading()).textContent).toBe('Noviembre 2026')
    expect(day('domingo, 1 de noviembre')).toBeTruthy()
    expect(day('sábado, 7 de noviembre, hoy')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nuevo hito' })).toBeTruthy()
  })
})

describe('CalendarPage · moving between months', () => {
  it('goes back, on and to today, each a new entry that back undoes', async () => {
    const user = userEvent.setup()
    renderAt('/calendar/month/2026-11')
    await heading()

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect((await heading()).textContent).toBe('October 2026')
    expect(window.location.pathname).toBe('/calendar/month/2026-10')

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(window.location.pathname).toBe('/calendar/month/2026-09')

    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect((await heading()).textContent).toBe('November 2026')
    expect(window.location.pathname).toBe('/calendar/month/2026-11')

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect((await heading()).textContent).toBe('January 2027')
    expect(window.location.pathname).toBe('/calendar/month/2027-01')
    await waitFor(() => expect(fetchedSpans().at(-1)).toBe('?from=2026-12-28&to=2027-01-31'))

    act(() => window.history.back())
    await waitFor(() => expect(window.location.pathname).toBe('/calendar/month/2026-12'))
    expect((await heading()).textContent).toBe('December 2026')

    act(() => window.history.forward())
    await waitFor(() => expect(window.location.pathname).toBe('/calendar/month/2027-01'))
    expect((await heading()).textContent).toBe('January 2027')
  })
})

describe('CalendarPage · Milestones in the cells', () => {
  it("shows each day's titles, whole on hover", async () => {
    planned('2026-11-10', 'Squeeze desde las ciegas con stacks cortos')
    planned('2026-10-27', 'Defensa de BB vs BTN')
    planned('2026-12-25', 'Christmas, outside the grid')
    renderAt('/calendar/month/2026-11')

    const title = await within(grid()).findByText('Squeeze desde las ciegas con stacks cortos')
    expect(title.getAttribute('title')).toBe('Squeeze desde las ciegas con stacks cortos')
    expect(within(day('Tuesday, November 10')).getByText('Squeeze desde las ciegas con stacks cortos')).toBeTruthy()
    expect(within(day('Tuesday, October 27')).getByText('Defensa de BB vs BTN')).toBeTruthy()
    expect(screen.queryByText('Christmas, outside the grid')).toBeNull()
  })

  it('shows three of a busy day, pending first, and how many more', async () => {
    planned('2026-11-06', 'Done first', true)
    planned('2026-11-06', 'Squeeze')
    planned('2026-11-06', 'Flat BTN')
    planned('2026-11-06', 'Blockers')
    planned('2026-11-06', 'Overbets')
    renderAt('/calendar/month/2026-11')

    const busy = day('Friday, November 6')
    await within(busy).findByText('Squeeze')
    expect(within(busy).getByText('Flat BTN')).toBeTruthy()
    expect(within(busy).getByText('Blockers')).toBeTruthy()
    expect(within(busy).queryByText('Overbets')).toBeNull()
    expect(within(busy).queryByText('Done first')).toBeNull()
    expect(within(busy).getByText('+2 more')).toBeTruthy()
  })

  it('says "+N más" in Spanish', async () => {
    for (const title of ['A', 'B', 'C', 'D']) planned('2026-11-06', title)
    renderAt('/calendar/month/2026-11', 'es')

    expect(await within(day('viernes, 6 de noviembre')).findByText('+1 más')).toBeTruthy()
  })
})

describe('CalendarPage · the empty hint', () => {
  it('shows over the grid while the Account has no Milestone at all', async () => {
    renderAt('/calendar/month/2026-11')

    expect(await screen.findByText('Click a day to plan what to study.')).toBeTruthy()
    expect(within(grid()).getAllByRole('gridcell')).toHaveLength(42)
  })

  it('stays away when there is a Milestone anywhere, even outside the month', async () => {
    planned('2027-05-04', 'Far away')
    renderAt('/calendar/month/2026-11')
    await waitFor(() => expect(fetchedSpans()).toHaveLength(1))
    await heading()

    expect(screen.queryByText('Click a day to plan what to study.')).toBeNull()
  })
})

describe('CalendarPage · creating Milestones', () => {
  it("opens on the day clicked, and the new Milestone shows on it at once", async () => {
    const user = userEvent.setup()
    renderAt('/calendar/month/2026-11')
    await screen.findByText('Click a day to plan what to study.')

    await user.click(day('Wednesday, November 11'))

    expect(dialog()).toBeTruthy()
    expect(dateField().value).toBe('2026-11-11')
    await user.type(titleField(), '  Turn barrels con proyectos ')
    await user.type(descriptionField(), 'Botes 3-bet')
    await user.click(within(dialog()!).getByRole('button', { name: 'Create milestone' }))

    await waitFor(() => expect(dialog()).toBeNull())
    expect(within(day('Wednesday, November 11')).getByText('Turn barrels con proyectos')).toBeTruthy()
    expect(calls.find(({ method }) => method === 'POST')?.body).toEqual({
      title: '  Turn barrels con proyectos ',
      description: 'Botes 3-bet',
      date: '2026-11-11',
    })
    expect(screen.queryByText('Click a day to plan what to study.')).toBeNull()
  })

  it('creates on another day when the date is changed', async () => {
    const user = userEvent.setup()
    renderAt('/calendar/month/2026-11')
    await heading()

    await user.click(day('Wednesday, November 11'))
    await user.clear(dateField())
    await user.type(dateField(), '2026-11-20')
    await user.type(titleField(), 'Thin value')
    await user.click(within(dialog()!).getByRole('button', { name: 'Create milestone' }))

    await waitFor(() => expect(dialog()).toBeNull())
    expect(within(day('Friday, November 20')).getByText('Thin value')).toBeTruthy()
    expect(within(day('Wednesday, November 11')).queryByText('Thin value')).toBeNull()
  })

  it('opens on today from "New milestone"', async () => {
    const user = userEvent.setup()
    renderAt('/calendar/month/2027-03')
    await heading()

    await user.click(screen.getByRole('button', { name: 'New milestone' }))

    expect(dateField().value).toBe('2026-11-07')
  })

  it("doesn't open on a click on a Milestone", async () => {
    const user = userEvent.setup()
    planned('2026-11-10', 'Squeeze')
    renderAt('/calendar/month/2026-11')

    await user.click(await within(grid()).findByText('Squeeze'))

    expect(dialog()).toBeNull()
  })

  it('refuses an empty title in place, and a cancel creates nothing', async () => {
    const user = userEvent.setup()
    renderAt('/calendar/month/2026-11')
    await heading()

    await user.click(day('Wednesday, November 11'))
    expect(within(dialog()!).getByText('0 / 80')).toBeTruthy()
    await user.type(titleField(), '   ')
    await user.click(within(dialog()!).getByRole('button', { name: 'Create milestone' }))

    expect(within(dialog()!).getByText('Write a title.')).toBeTruthy()
    expect(titleField().getAttribute('aria-invalid')).toBe('true')
    expect(calls.some(({ method }) => method === 'POST')).toBe(false)

    await user.click(within(dialog()!).getByRole('button', { name: 'Cancel' }))
    expect(dialog()).toBeNull()
  })

  it('takes no title longer than 80 characters', async () => {
    const user = userEvent.setup()
    renderAt('/calendar/month/2026-11')
    await heading()

    await user.click(screen.getByRole('button', { name: 'New milestone' }))
    await user.type(titleField(), 'x'.repeat(85))

    expect(titleField().value).toHaveLength(80)
    expect(within(dialog()!).getByText('80 / 80')).toBeTruthy()
  })

  it('says why, and stays open, when the server refuses', async () => {
    const user = userEvent.setup()
    createReply = () => refusal(400, 'invalid-milestone-title')
    renderAt('/calendar/month/2026-11')
    await heading()

    await user.click(screen.getByRole('button', { name: 'New milestone' }))
    await user.type(titleField(), 'Squeeze')
    await user.click(within(dialog()!).getByRole('button', { name: 'Create milestone' }))

    expect(await within(dialog()!).findByRole('alert')).toBeTruthy()
    expect(dialog()).toBeTruthy()
  })
})
