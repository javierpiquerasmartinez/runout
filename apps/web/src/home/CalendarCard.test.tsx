import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Milestone } from '../calendar/calendar'
import { I18nProvider, type Locale } from '../i18n'
import { SessionContext } from '../identity/context'
import { Routes } from '../routes/Routes'
import { fakeApi, refusal, type ApiCall } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'

/** The Milestones the faked server holds. */
let stored: Milestone[]
let calls: ApiCall[]
/** What the listing answers instead of the Milestones, when set. */
let listReply: (() => Response | Promise<Response>) | null
/** What a change answers instead of changing, when set. */
let changeReply: (() => Response) | null
let answers: Parameters<typeof fakeApi>[0]

const TODAY = '2026-11-09'

/** A Milestone on `date`, created in the order the test lists them. */
function planned(title: string, { done = false, date = TODAY }: { done?: boolean; date?: string } = {}): Milestone {
  const createdAt = new Date(Date.UTC(2026, 9, 1, 9, stored.length)).toISOString()
  const milestone = { id: `m${stored.length + 1}`, title, description: '', date, done, createdAt }
  stored.push(milestone)
  answers[`PATCH /calendar/milestones/${milestone.id}`] = ({ body }) => {
    if (changeReply) return changeReply()
    Object.assign(milestone, body)
    return Response.json(milestone)
  }
  return milestone
}

beforeEach(() => {
  // Monday 9 November 2026, at noon in the browser's own zone. Only Date is faked: timers run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 9, 12, 0))
  stored = []
  listReply = null
  changeReply = null
  calls = fakeApi(
    (answers = {
      'GET /calendar/milestones': ({ search }) => {
        if (listReply) return listReply()
        const query = new URLSearchParams(search)
        const milestones = stored.filter(({ date }) => date >= query.get('from')! && date <= query.get('to')!)
        return Response.json({ milestones })
      },
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

function renderHome(locale: Locale = 'en') {
  window.history.replaceState(null, '', '/')
  render(
    <I18nProvider initialLocale={locale}>
      <SessionContext.Provider value={fakeSession()}>
        <Routes />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

const calendar = async (name = 'Calendar') => within(await screen.findByRole('region', { name }))
/** The card, once what it was waiting for has come. */
const loaded = async (text: string) => within((await within(await screen.findByRole('region', { name: 'Calendar' })).findByText(text)).closest('section')!)
/** The titles the card lists, top to bottom. */
const listed = (card: Awaited<ReturnType<typeof calendar>>) => card.getAllByRole('checkbox').map((check) => check.closest('li')!.querySelector('a')!.textContent)

describe('Home · the Calendar card', () => {
  it('names today and lists its Milestones, pending first', async () => {
    planned('Watch overbets', { done: true })
    planned('Review 3-bets')
    planned('Yesterday', { date: '2026-11-08' })
    planned('Study turns')
    renderHome()

    const card = await loaded('Review 3-bets')
    expect(card.getByText('Today, Nov 9')).toBeTruthy()
    expect(listed(card)).toEqual(['Review 3-bets', 'Study turns', 'Watch overbets'])
    expect(calls.filter(({ path }) => path === '/calendar/milestones').map(({ search }) => search)).toEqual([`?from=${TODAY}&to=${TODAY}`])
  })

  it('says today the Spanish way', async () => {
    planned('Repasar 3-bets')
    renderHome('es')

    const card = within((await screen.findByText('Repasar 3-bets')).closest('section')!)
    expect(card.getByText('Hoy, 9 nov')).toBeTruthy()
  })

  it('shows five at most, pending first, and leads to the Calendar for the rest', async () => {
    planned('Done early', { done: true })
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five', 'Six']) planned(title)
    renderHome()

    const card = await loaded('One')
    expect(listed(card)).toEqual(['One', 'Two', 'Three', 'Four', 'Five'])
    await userEvent.click(card.getByRole('link', { name: 'See all' }))

    expect(window.location.pathname).toBe('/calendar/month/2026-11')
  })

  it('has no "See all" with five or fewer', async () => {
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) planned(title)
    renderHome()

    const card = await loaded('One')
    expect(listed(card)).toHaveLength(5)
    expect(card.queryByRole('link', { name: 'See all' })).toBeNull()
  })

  it('leads from its title to the Calendar', async () => {
    planned('Review 3-bets')
    renderHome()

    await userEvent.click((await loaded('Review 3-bets')).getByRole('link', { name: 'Calendar' }))

    expect(window.location.pathname).toBe('/calendar/month/2026-11')
  })

  it('opens a Milestone from its title', async () => {
    const milestone = planned('Review 3-bets')
    answers[`GET /calendar/milestones/${milestone.id}`] = () => Response.json(milestone)
    renderHome()

    await userEvent.click((await loaded('Review 3-bets')).getByRole('link', { name: 'Review 3-bets' }))

    expect(window.location.pathname).toBe(`/calendar/milestones/${milestone.id}`)
  })

  it('marks a Milestone done, which stays on the list among the done ones', async () => {
    const first = planned('Review 3-bets')
    planned('Study turns')
    renderHome()

    const card = await loaded('Review 3-bets')
    await userEvent.click(card.getByRole('checkbox', { name: 'Mark as done: Review 3-bets' }))

    expect(card.getByRole('checkbox', { name: 'Done: Review 3-bets' }).getAttribute('aria-checked')).toBe('true')
    expect(listed(card)).toEqual(['Study turns', 'Review 3-bets'])
    await waitFor(() => expect(calls.find(({ method, path }) => method === 'PATCH' && path === `/calendar/milestones/${first.id}`)?.body).toEqual({ done: true }))
  })

  it('undoes a done Milestone, back among the pending ones', async () => {
    const first = planned('Watch overbets', { done: true })
    planned('Study turns')
    renderHome()

    const card = await loaded('Watch overbets')
    await userEvent.click(card.getByRole('checkbox', { name: 'Done: Watch overbets' }))

    expect(card.getByRole('checkbox', { name: 'Mark as done: Watch overbets' }).getAttribute('aria-checked')).toBe('false')
    await waitFor(() => expect(first.done).toBe(false))
  })

  it('keeps a Milestone just marked done on the card when more than five are planned, so it can be undone', async () => {
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']) planned(title)
    renderHome()

    const card = await loaded('One')
    await userEvent.click(card.getByRole('checkbox', { name: 'Mark as done: One' }))

    expect(listed(card)).toEqual(['Two', 'Three', 'Four', 'Five', 'One'])
    await userEvent.click(card.getByRole('checkbox', { name: 'Done: One' }))
    expect(listed(card)).toEqual(['One', 'Two', 'Three', 'Four', 'Five'])
  })

  it('goes back and says so when a change can\'t be saved', async () => {
    planned('Review 3-bets')
    changeReply = () => refusal(500, 'internal')
    renderHome()

    const card = await loaded('Review 3-bets')
    await userEvent.click(card.getByRole('checkbox', { name: 'Mark as done: Review 3-bets' }))

    expect((await card.findByRole('alert')).textContent).toBe('Couldn’t save “Review 3-bets”. Try again.')
    expect(card.getByRole('checkbox', { name: 'Mark as done: Review 3-bets' }).getAttribute('aria-checked')).toBe('false')
  })

  it('shows it is loading, title and day kept, until the read answers', async () => {
    let answer: (response: Response) => void = () => undefined
    listReply = () => new Promise<Response>((resolve) => (answer = resolve))
    renderHome()

    const section = await screen.findByRole('region', { name: 'Calendar' })
    const card = within(section)
    expect(section.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(card.getByRole('link', { name: 'Calendar' })).toBeTruthy()
    expect(card.getByText('Today, Nov 9')).toBeTruthy()
    expect(card.queryByRole('button', { name: 'New milestone' })).toBeNull()

    answer(Response.json({ milestones: [] }))

    expect(await card.findByText('Nothing planned for today')).toBeTruthy()
    expect(section.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('shows a failed read with "Retry", which recovers it, the other cards untouched', async () => {
    planned('Review 3-bets')
    answers['GET /lab/ranges'] = () => Response.json([{ id: 'r1', name: 'Range' }])
    listReply = () => refusal(500, 'internal')
    renderHome()

    const card = await loaded("Couldn't load this")
    expect(card.getByText('The rest of the screen still works.')).toBeTruthy()
    expect(card.getByRole('link', { name: 'Calendar' })).toBeTruthy()
    expect(await within(screen.getByRole('region', { name: 'Lab' })).findByText('range')).toBeTruthy()

    listReply = null
    await userEvent.click(card.getByRole('button', { name: 'Retry' }))

    expect(listed(await loaded('Review 3-bets'))).toEqual(['Review 3-bets'])
    expect(card.queryByText("Couldn't load this")).toBeNull()
  })

  describe('"New milestone"', () => {
    const dialog = () => screen.getByRole('dialog', { name: 'New milestone' })
    const dateField = () => within(dialog()).getByLabelText<HTMLInputElement>('Date')
    const listings = () => calls.filter(({ method, path }) => method === 'GET' && path === '/calendar/milestones')

    beforeEach(() => {
      answers['POST /calendar/milestones'] = ({ body }) => {
        const { title, date } = body as { title: string; date: string }
        return Response.json(planned(title, { date }), { status: 201 })
      }
    })

    it('opens on Home with today filled in, and the card reloads when one is created', async () => {
      planned('Review 3-bets')
      renderHome()

      await userEvent.click((await loaded('Review 3-bets')).getByRole('button', { name: 'New milestone' }))

      expect(window.location.pathname).toBe('/')
      expect(dateField().value).toBe(TODAY)
      await userEvent.type(within(dialog()).getByRole('textbox', { name: 'Title' }), 'Study turns')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Create milestone' }))

      const card = await loaded('Study turns')
      expect(listed(card)).toEqual(['Review 3-bets', 'Study turns'])
      expect(screen.queryByRole('dialog', { name: 'New milestone' })).toBeNull()
      expect(listings()).toHaveLength(2)
      expect(calls.find(({ method }) => method === 'POST')?.body).toMatchObject({ title: 'Study turns', date: TODAY })
    })

    it('closes without reloading when cancelled', async () => {
      planned('Review 3-bets')
      renderHome()

      await userEvent.click((await loaded('Review 3-bets')).getByRole('button', { name: 'New milestone' }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog', { name: 'New milestone' })).toBeNull()
      expect(listings()).toHaveLength(1)
      expect(listed(await calendar())).toEqual(['Review 3-bets'])
    })

    it('leaves the card out of a Milestone created for another day', async () => {
      planned('Review 3-bets')
      renderHome()

      await userEvent.click((await loaded('Review 3-bets')).getByRole('button', { name: 'New milestone' }))
      await userEvent.type(within(dialog()).getByRole('textbox', { name: 'Title' }), 'Later')
      await userEvent.clear(dateField())
      await userEvent.type(dateField(), '2026-11-12')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Create milestone' }))

      await waitFor(() => expect(listings()).toHaveLength(2))
      expect(listed(await loaded('Review 3-bets'))).toEqual(['Review 3-bets'])
    })

    it('says when nothing is planned for today and offers it in the body alone', async () => {
      renderHome()

      const card = await loaded('Nothing planned for today')
      expect(card.getByText('Today, Nov 9')).toBeTruthy()
      expect(card.getByText("Note down what you're going to study and you'll see it here on the day.")).toBeTruthy()
      expect(card.queryByRole('checkbox')).toBeNull()
      expect(card.getAllByRole('button', { name: 'New milestone' })).toHaveLength(1)

      await userEvent.click(card.getByRole('button', { name: 'New milestone' }))
      expect(dateField().value).toBe(TODAY)
      await userEvent.type(within(dialog()).getByRole('textbox', { name: 'Title' }), 'Study turns')
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Create milestone' }))

      expect(listed(await loaded('Study turns'))).toEqual(['Study turns'])
    })

    it('reads "Nuevo hito" and the empty state in Spanish', async () => {
      renderHome('es')

      const card = within((await screen.findByText('Nada planeado para hoy')).closest('section')!)
      expect(card.getByText('Apunta qué vas a estudiar y lo verás aquí ese día.')).toBeTruthy()
      expect(card.getByRole('button', { name: 'Nuevo hito' })).toBeTruthy()
    })
  })

  it('shows "Reintentar" in Spanish', async () => {
    listReply = () => refusal(500, 'internal')
    renderHome('es')

    const card = await calendar('Calendario')
    expect(await card.findByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })
})
