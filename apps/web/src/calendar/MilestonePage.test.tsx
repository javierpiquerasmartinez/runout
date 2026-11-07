import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
/** What the next change answers instead of changing, when set. */
let changeReply: (() => Response | Promise<Response>) | null
/** What the next delete answers instead of deleting, when set. */
let deleteReply: (() => Response) | null
let answers: Parameters<typeof fakeApi>[0]

/** A Milestone on `date`, held by the faked server with its own read, change and delete. */
function planned(date: string, title: string, { done = false, description = '' } = {}): Milestone {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 9, stored.length)).toISOString()
  const milestone = { id: `m${stored.length + 1}`, title, description, date, done, createdAt }
  stored.push(milestone)
  const path = `/calendar/milestones/${milestone.id}`
  const there = () => stored.includes(milestone)
  answers[`GET ${path}`] = () => (there() ? Response.json(milestone) : refusal(404, 'milestone-not-found'))
  answers[`PATCH ${path}`] = ({ body }) => {
    if (changeReply) return changeReply()
    if (!there()) return refusal(404, 'milestone-not-found')
    const change = body as Partial<Milestone>
    Object.assign(milestone, change.title === undefined ? change : { ...change, title: change.title.trim() })
    return Response.json(milestone)
  }
  answers[`DELETE ${path}`] = () => {
    if (deleteReply) return deleteReply()
    if (!there()) return refusal(404, 'milestone-not-found')
    stored.splice(stored.indexOf(milestone), 1)
    return new Response(null, { status: 204 })
  }
  return milestone
}

beforeEach(() => {
  // Saturday 7 November 2026, at noon in the browser's own zone. Only Date is faked: timers run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 7, 12, 0))
  stored = []
  changeReply = null
  deleteReply = null
  calls = fakeApi(
    (answers = {
      'GET /calendar/milestones': ({ search }) => {
        const query = new URLSearchParams(search)
        const from = query.get('from')!
        const to = query.get('to')!
        const milestones = stored.filter(({ date }) => date >= from && date <= to)
        return Response.json({ milestones, hasAny: stored.length > 0 })
      },
    }),
  )
})

afterEach(() => {
  cleanup()
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

const breadcrumb = () => screen.getByRole('navigation', { name: 'Breadcrumb' })
/** The breadcrumb as it reads: each link with where it leads, then the current page. */
const trail = () => {
  const nav = breadcrumb()
  const links = within(nav)
    .getAllByRole('link')
    .map((link) => `${link.textContent} → ${link.getAttribute('href')}`)
  const current = nav.querySelector('[aria-current="page"]')?.textContent
  return [...links, current]
}
const titleField = () => screen.findByRole<HTMLInputElement>('textbox', { name: 'Milestone title' })
const descriptionField = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: /^Description/ })
const dateField = () => screen.getByLabelText<HTMLInputElement>('Date')
const save = () => screen.getByRole('button', { name: 'Save' })
const leaveDialog = () => screen.queryByRole('dialog', { name: 'Discard the changes?' })
const deleteDialog = () => screen.queryByRole('dialog', { name: 'Delete this milestone?' })

/** Opens the Milestone by clicking its title in the Calendar at `address`. */
async function openFrom(address: string, title: string) {
  renderAt(address)
  await userEvent.click(await screen.findByRole('link', { name: title }))
  await titleField()
}

describe('MilestonePage · opening it', () => {
  it('opens from a cell of the month, with the month in the breadcrumb', async () => {
    const squeeze = planned('2026-11-10', 'Squeeze vs BTN', { description: 'Out of position.' })
    renderAt('/calendar/month/2026-11')
    const entries = window.history.length

    await userEvent.click(await screen.findByRole('link', { name: 'Squeeze vs BTN' }))

    expect(window.location.pathname).toBe(`/calendar/milestones/${squeeze.id}`)
    expect(window.history.length).toBe(entries + 1)
    expect((await titleField()).value).toBe('Squeeze vs BTN')
    expect(descriptionField().value).toBe('Out of position.')
    expect(dateField().value).toBe('2026-11-10')
    expect(trail()).toEqual(['Calendar → /calendar', 'November 2026 → /calendar/month/2026-11', 'Squeeze vs BTN'])
  })
})

describe('MilestonePage · the breadcrumb', () => {
  it('names the week it was opened from, and returns to that exact week', async () => {
    const squeeze = planned('2026-11-12', 'Squeeze vs BTN')
    await openFrom('/calendar/week/2026-11-09', 'Squeeze vs BTN')

    expect(window.location.pathname).toBe(`/calendar/milestones/${squeeze.id}`)
    expect(trail()).toEqual(['Calendar → /calendar', 'Nov 9 – 15, 2026 → /calendar/week/2026-11-09', 'Squeeze vs BTN'])

    await userEvent.click(within(breadcrumb()).getByRole('link', { name: 'Nov 9 – 15, 2026' }))

    await waitFor(() => expect(window.location.pathname).toBe('/calendar/week/2026-11-09'))
    expect(await screen.findByRole('region', { name: 'Thursday, November 12' })).toBeTruthy()
  })

  it('names the month of its date when the address is opened directly', async () => {
    const squeeze = planned('2026-12-03', 'Squeeze vs BTN')
    renderAt(`/calendar/milestones/${squeeze.id}`)
    await titleField()

    expect(trail()).toEqual(['Calendar → /calendar', 'December 2026 → /calendar/month/2026-12', 'Squeeze vs BTN'])

    await userEvent.click(within(breadcrumb()).getByRole('link', { name: 'December 2026' }))

    expect(window.location.pathname).toBe('/calendar/month/2026-12')
  })

  it('leads to the Calendar, which opens on the current month', async () => {
    const squeeze = planned('2026-12-03', 'Squeeze vs BTN')
    renderAt(`/calendar/milestones/${squeeze.id}`)
    await titleField()

    await userEvent.click(within(breadcrumb()).getByRole('link', { name: 'Calendar' }))

    await waitFor(() => expect(window.location.pathname).toBe('/calendar/month/2026-11'))
  })

  it('reads in Spanish', async () => {
    const squeeze = planned('2026-11-05', 'Squeeze vs BTN')
    renderAt(`/calendar/milestones/${squeeze.id}`, 'es')

    expect((await screen.findByRole<HTMLInputElement>('textbox', { name: 'Título del hito' })).value).toBe('Squeeze vs BTN')
    const nav = screen.getByRole('navigation', { name: 'Ruta' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Calendario', 'Noviembre 2026'])
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Hecho' })).toBeTruthy()
    expect(screen.getByText(/^Pendiente desde el jueves, 5 de noviembre/)).toBeTruthy()
  })
})

describe('MilestonePage · editing', () => {
  it('keeps the title, description and date with Save, the only primary button', async () => {
    const squeeze = planned('2026-11-10', 'Squeeze')
    renderAt(`/calendar/milestones/${squeeze.id}`)

    await userEvent.clear(await titleField())
    await userEvent.type(await titleField(), '  Squeeze vs BTN ')
    await userEvent.type(descriptionField(), 'Out of position.')
    fireEvent.change(dateField(), { target: { value: '2026-11-20' } })
    await userEvent.click(save())

    const change = calls.find(({ method }) => method === 'PATCH')
    expect(change?.body).toEqual({ title: '  Squeeze vs BTN ', description: 'Out of position.', date: '2026-11-20' })
    await waitFor(() => expect(within(breadcrumb()).getByText('Squeeze vs BTN')).toBeTruthy())
    expect((await titleField()).value).toBe('Squeeze vs BTN')
    expect(stored[0]).toMatchObject({ title: 'Squeeze vs BTN', description: 'Out of position.', date: '2026-11-20' })
    expect(screen.getByRole('main').querySelectorAll('.ro-btn--primary')).toHaveLength(1)
  })

  it('refuses an empty title in place, sending nothing', async () => {
    const squeeze = planned('2026-11-10', 'Squeeze')
    renderAt(`/calendar/milestones/${squeeze.id}`)

    await userEvent.clear(await titleField())
    await userEvent.click(save())

    expect(screen.getByText('Write a title.')).toBeTruthy()
    expect((await titleField()).getAttribute('aria-invalid')).toBe('true')
    expect(calls.filter(({ method }) => method === 'PATCH')).toEqual([])
  })

  it("shows the server's refusal beside the field it is about", async () => {
    const squeeze = planned('2026-11-10', 'Squeeze')
    changeReply = () => refusal(400, 'invalid-milestone-description')
    renderAt(`/calendar/milestones/${squeeze.id}`)

    await userEvent.type(await titleField(), '!')
    await userEvent.click(save())

    await waitFor(() => expect(descriptionField().getAttribute('aria-invalid')).toBe('true'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('MilestonePage · unsaved changes', () => {
  async function editedFrom(address: string) {
    const squeeze = planned('2026-11-10', 'Squeeze')
    await openFrom(address, 'Squeeze')
    await userEvent.type(await titleField(), ' vs BTN')
    return squeeze
  }

  it('asks before leaving through the breadcrumb, and stays on Cancel', async () => {
    const squeeze = await editedFrom('/calendar/month/2026-11')

    await userEvent.click(within(breadcrumb()).getByRole('link', { name: 'Calendar' }))
    expect(leaveDialog()).toBeTruthy()
    await userEvent.click(within(leaveDialog()!).getByRole('button', { name: 'Cancel' }))

    expect(leaveDialog()).toBeNull()
    expect(window.location.pathname).toBe(`/calendar/milestones/${squeeze.id}`)
    expect((await titleField()).value).toBe('Squeeze vs BTN')
  })

  it('goes back to the view it was opened from once the changes are discarded', async () => {
    await editedFrom('/calendar/week/2026-11-09')

    await userEvent.click(within(breadcrumb()).getByRole('link', { name: 'Nov 9 – 15, 2026' }))
    await waitFor(() => expect(leaveDialog()).toBeTruthy())
    await userEvent.click(within(leaveDialog()!).getByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(window.location.pathname).toBe('/calendar/week/2026-11-09'))
    expect(stored[0].title).toBe('Squeeze')
  })

  it('asks before leaving from the header', async () => {
    await editedFrom('/calendar/month/2026-11')

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { name: 'Library' }))
    await userEvent.click(within(leaveDialog()!).getByRole('button', { name: 'Discard changes' }))

    expect(window.location.pathname).toBe('/library')
  })

  it("asks through the browser's own prompt when closing or reloading, only with changes", async () => {
    const squeeze = planned('2026-11-10', 'Squeeze')
    renderAt(`/calendar/milestones/${squeeze.id}`)
    await titleField()
    expect(fireEvent(window, new Event('beforeunload', { cancelable: true }))).toBe(true)

    await userEvent.type(await titleField(), '!')

    expect(fireEvent(window, new Event('beforeunload', { cancelable: true }))).toBe(false)
  })

  it('leaves without asking once the changes are saved', async () => {
    await editedFrom('/calendar/month/2026-11')
    await userEvent.click(save())
    await waitFor(() => expect(stored[0].title).toBe('Squeeze vs BTN'))
    await waitFor(() => expect(within(breadcrumb()).getByText('Squeeze vs BTN')).toBeTruthy())

    await userEvent.click(within(breadcrumb()).getByRole('link', { name: 'Calendar' }))

    expect(leaveDialog()).toBeNull()
    await waitFor(() => expect(window.location.pathname).toBe('/calendar/month/2026-11'))
  })
})

describe('MilestonePage · done', () => {
  it('saves the check at once, with nothing else', async () => {
    const squeeze = planned('2026-11-10', 'Squeeze')
    renderAt(`/calendar/milestones/${squeeze.id}`)
    await titleField()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Done' }))

    expect(screen.getByRole('checkbox', { name: 'Done' }).getAttribute('aria-checked')).toBe('true')
    expect(calls.filter(({ method }) => method === 'PATCH').map(({ body }) => body)).toEqual([{ done: true }])
    await waitFor(() => expect(stored[0].done).toBe(true))
    expect(fireEvent(window, new Event('beforeunload', { cancelable: true }))).toBe(true)
  })

  it('goes back with a message when the check cannot be saved', async () => {
    const squeeze = planned('2026-11-10', 'Squeeze')
    changeReply = () => refusal(500, 'internal')
    renderAt(`/calendar/milestones/${squeeze.id}`)
    await titleField()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Done' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Done' }).getAttribute('aria-checked')).toBe('false')
  })
})

describe('MilestonePage · deleting', () => {
  it('asks first, and stays on Cancel', async () => {
    const squeeze = planned('2026-11-10', 'Squeeze')
    renderAt(`/calendar/milestones/${squeeze.id}`)
    await titleField()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(within(deleteDialog()!).getByText("It can't be undone.")).toBeTruthy()
    await userEvent.click(within(deleteDialog()!).getByRole('button', { name: 'Cancel' }))

    expect(deleteDialog()).toBeNull()
    expect(calls.filter(({ method }) => method === 'DELETE')).toEqual([])
    expect(stored).toHaveLength(1)
  })

  it('deletes once confirmed, back on the week it was opened from', async () => {
    planned('2026-11-12', 'Squeeze')
    planned('2026-11-12', 'Float')
    await openFrom('/calendar/week/2026-11-09', 'Squeeze')
    await userEvent.type(await titleField(), ' with changes')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(deleteDialog()!).getByRole('button', { name: 'Delete milestone' }))

    await waitFor(() => expect(window.location.pathname).toBe('/calendar/week/2026-11-09'))
    expect(leaveDialog()).toBeNull()
    expect(stored.map(({ title }) => title)).toEqual(['Float'])
    const thursday = await screen.findByRole('region', { name: 'Thursday, November 12' })
    await waitFor(() => expect(within(thursday).getByRole('link', { name: 'Float' })).toBeTruthy())
    expect(within(thursday).queryByRole('link', { name: 'Squeeze' })).toBeNull()
  })

  it('lands on the month of its date when opened directly', async () => {
    const squeeze = planned('2026-12-03', 'Squeeze')
    renderAt(`/calendar/milestones/${squeeze.id}`)
    await titleField()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(deleteDialog()!).getByRole('button', { name: 'Delete milestone' }))

    await waitFor(() => expect(window.location.pathname).toBe('/calendar/month/2026-12'))
    expect(stored).toEqual([])
  })

  it('stays with a message when it cannot be deleted', async () => {
    const squeeze = planned('2026-11-10', 'Squeeze')
    deleteReply = () => refusal(500, 'internal')
    renderAt(`/calendar/milestones/${squeeze.id}`)
    await titleField()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(deleteDialog()!).getByRole('button', { name: 'Delete milestone' }))

    expect((await screen.findByRole('alert')).textContent).toBe("The milestone couldn't be deleted. Try again.")
    expect(window.location.pathname).toBe(`/calendar/milestones/${squeeze.id}`)
  })
})

describe('MilestonePage · not found', () => {
  it("says a Milestone that isn't there, or isn't theirs, is not found, with a way back", async () => {
    const gone = planned('2026-12-03', 'Squeeze')
    stored.splice(0)
    renderAt(`/calendar/milestones/${gone.id}`)

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe("This milestone isn't in your calendar")
    expect(trail()).toEqual(['Calendar → /calendar', 'November 2026 → /calendar/month/2026-11', 'Milestone not found'])
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    await userEvent.click(screen.getByRole('link', { name: 'Back to the calendar' }))

    await waitFor(() => expect(window.location.pathname).toBe('/calendar/month/2026-11'))
  })
})
