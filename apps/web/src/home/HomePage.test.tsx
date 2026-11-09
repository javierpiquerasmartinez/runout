import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Milestone } from '../calendar/calendar'
import type { Goal } from '../goals/goals'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { Routes } from '../routes/Routes'
import { fakeApi, type ApiCall } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'

let milestones: Milestone[]
let goals: Goal[]
let calls: ApiCall[]
let answers: Parameters<typeof fakeApi>[0]

function planned(title: string, date: string) {
  milestones.push({ id: `m${milestones.length + 1}`, title, description: '', date, done: false, createdAt: '2026-10-01T09:00:00.000Z' })
}

function aGoal(name: string, fields: Partial<Goal>) {
  const n = goals.length
  goals.push({ id: `goal-${n}`, name, description: '', target: 60, currentValue: 42, startDate: '2026-11-01', deadline: '2026-11-30', createdAt: `2026-11-01T10:00:0${n}.000Z`, ...fields })
}

/** A Hand count alone is enough for a month: the rest of the card is its own test's. */
function monthWith(hands: number) {
  const lines = { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 }
  return { hands, currency: 'EUR', totals: { bigBlinds: lines, amounts: lines }, start: { bigBlinds: lines, amounts: lines }, zoom: null, rakeGenerated: { bigBlinds: 0, amounts: null }, points: [] }
}

/** Puts the clock just before a midnight, with timers it controls. */
function lateAt(year: number, monthIndex: number, day: number) {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
  vi.setSystemTime(new Date(year, monthIndex, day, 23, 59, 30))
}

const pastMidnight = () => act(() => vi.advanceTimersByTime(31_000))

function comeBackToTheTab() {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  act(() => void document.dispatchEvent(new Event('visibilitychange')))
}

function renderHome() {
  window.history.replaceState(null, '', '/')
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={fakeSession()}>
        <Routes />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

/** The card, once it has finished loading. */
async function loadedCard(name: string) {
  const section = await screen.findByRole('region', { name })
  await waitFor(() => expect(section.querySelector('[aria-busy="true"]')).toBeNull())
  return within(section)
}

const readsOf = (path: string) => calls.filter((call) => call.path === path)

beforeEach(() => {
  milestones = []
  goals = []
  answers = {
    'GET /calendar/milestones': ({ search }) => {
      const query = new URLSearchParams(search)
      return Response.json({ milestones: milestones.filter(({ date }) => date >= query.get('from')! && date <= query.get('to')!) })
    },
    'GET /calendar/milestones/outlook': () => Response.json({ next: null, overdue: 0 }),
    'GET /goals': () => Response.json({ goals }),
    'GET /library/results': () => Response.json(monthWith(0)),
    'GET /library/hands': () => Response.json({ total: 1, hands: [] }),
  }
  calls = fakeApi(answers)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('Home · in a tab left open past midnight', () => {
  it("moves the Calendar card on to the new day's Milestones", async () => {
    lateAt(2026, 10, 8)
    planned('Repasar 3-bet', '2026-11-08')
    planned('Estudiar river', '2026-11-09')
    renderHome()
    const calendar = await loadedCard('Calendar')
    expect(calendar.getByRole('link', { name: 'Repasar 3-bet' })).toBeTruthy()

    pastMidnight()

    expect(await calendar.findByRole('link', { name: 'Estudiar river' })).toBeTruthy()
    expect(calendar.queryByRole('link', { name: 'Repasar 3-bet' })).toBeNull()
    expect(calendar.getByText('Today, Nov 9')).toBeTruthy()
    expect(new URLSearchParams(readsOf('/calendar/milestones').at(-1)!.search).get('from')).toBe('2026-11-09')
    expect(new URLSearchParams(readsOf('/calendar/milestones/outlook').at(-1)!.search).get('today')).toBe('2026-11-09')
  })

  it('selects the Goals again for the new day', async () => {
    lateAt(2026, 10, 8)
    aGoal('Acaba hoy', { deadline: '2026-11-08' })
    aGoal('Empieza mañana', { startDate: '2026-11-09', deadline: '2026-11-30' })
    renderHome()
    const card = await loadedCard('Goals')
    expect(card.getByRole('link', { name: 'Acaba hoy' })).toBeTruthy()
    expect(card.queryByRole('link', { name: 'Empieza mañana' })).toBeNull()

    pastMidnight()

    expect(card.getByRole('link', { name: 'Empieza mañana' })).toBeTruthy()
    expect(card.queryByRole('link', { name: 'Acaba hoy' })).toBeNull()
  })

  it('keeps a just-Achieved Goal on coming back the same day, and lets it go on the new day', async () => {
    lateAt(2026, 10, 8)
    aGoal('Casi hecho', {})
    answers['PATCH /goals/goal-0'] = ({ body }) => Response.json(Object.assign(goals[0], body))
    renderHome()
    const card = await loadedCard('Goals')
    await userEvent.click(card.getByRole('button', { name: 'Current value of “Casi hecho”: 42. Change' }))
    const field = card.getByRole('textbox', { name: 'Current value of “Casi hecho”' })
    await userEvent.clear(field)
    await userEvent.type(field, '60{Enter}')
    await card.findByText('Achieved')

    comeBackToTheTab()
    expect(card.getByRole('link', { name: 'Casi hecho' })).toBeTruthy()

    pastMidnight()
    expect(card.queryByRole('link', { name: 'Casi hecho' })).toBeNull()
    expect(card.getByText('No goals in progress')).toBeTruthy()
  })

  it('reloads the Library card and names the new month on the 1st', async () => {
    lateAt(2026, 10, 30)
    renderHome()
    const card = await loadedCard('Library')
    expect(card.getByText('November')).toBeTruthy()

    pastMidnight()

    expect(await card.findByText('December')).toBeTruthy()
    await card.findByText('No hands in December')
    const read = new URLSearchParams(readsOf('/library/results').at(-1)!.search)
    expect(read.get('from')).toBe(new Date(2026, 11, 1).toISOString())
    expect(read.get('to')).toBe(new Date(2026, 11, 2).toISOString())
    // On the 1st the month so far is just today, which a bare address means.
    expect(card.getByRole('link', { name: 'Library' }).getAttribute('href')).toBe('/library')
  })

  it('leaves the Library card alone on a new day of the same month', async () => {
    lateAt(2026, 10, 8)
    renderHome()
    const card = await loadedCard('Library')
    const reads = readsOf('/library/results').length

    pastMidnight()
    await loadedCard('Calendar')

    expect(readsOf('/library/results')).toHaveLength(reads)
    expect(card.getByText('November')).toBeTruthy()
  })

  const cardsInOrder = () => screen.getAllByRole('region').map((card) => card.getAttribute('aria-label'))

  it('has its cards in the order of the wide grid', async () => {
    renderHome()
    await loadedCard('Library')

    expect(cardsInOrder()).toEqual(['Library', 'Rooms', 'Goals', 'Calendar', 'Lab'])
  })

  it('has its cards in the phone order on a narrow screen, for the keyboard and screen readers too', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 760px)', addEventListener() {}, removeEventListener() {} }))
    renderHome()
    await loadedCard('Library')

    expect(cardsInOrder()).toEqual(['Rooms', 'Calendar', 'Library', 'Goals', 'Lab'])
  })

  it('catches up on coming back to the tab after the day has changed, without a midnight seen', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 8, 12, 0))
    planned('Estudiar river', '2026-11-09')
    renderHome()
    const calendar = await loadedCard('Calendar')

    vi.setSystemTime(new Date(2026, 10, 9, 9, 0))
    comeBackToTheTab()

    expect(await calendar.findByRole('link', { name: 'Estudiar river' })).toBeTruthy()
  })

  it('asks nothing again on coming back to the tab the same day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 8, 12, 0))
    renderHome()
    await loadedCard('Calendar')
    await loadedCard('Library')
    const reads = calls.length

    comeBackToTheTab()

    expect(calls).toHaveLength(reads)
  })
})
