import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal } from '../goals/goals'
import { I18nProvider, type Locale } from '../i18n'
import { SessionContext } from '../identity/context'
import { Routes } from '../routes/Routes'
import { fakeApi, refusal } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'

let stored: Goal[]
let answers: Parameters<typeof fakeApi>[0]

/** A Goal In Progress on the day the tests run, with 42 of 60 done, unless told otherwise. */
function goal(name: string, fields: Partial<Goal> = {}): Goal {
  const made: Goal = {
    id: `goal-${stored.length}`,
    name,
    description: '',
    target: 60,
    currentValue: 42,
    startDate: '2026-11-01',
    deadline: '2026-11-30',
    createdAt: `2026-11-01T10:00:${String(stored.length).padStart(2, '0')}.000Z`,
    ...fields,
  }
  stored.push(made)
  return made
}

beforeEach(() => {
  // Saturday 7 November 2026, at noon in the browser's own zone. Only Date is faked: timers run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 7, 12, 0))
  stored = []
  answers = { 'GET /goals': () => Response.json({ goals: stored }) }
  fakeApi(answers)
})

afterEach(() => {
  cleanup()
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

type Card = Awaited<ReturnType<typeof loadedCard>>

/** The card, once it has finished loading. */
async function loadedCard(name = 'Goals') {
  const section = await screen.findByRole('region', { name })
  await vi.waitFor(() => expect(section.querySelector('[aria-busy="true"]')).toBeNull())
  return within(section)
}

/** The Goals on the card, top to bottom: the links that aren't the card's own. */
const namesOn = (card: Card) =>
  card
    .getAllByRole('link')
    .map((link) => link.textContent)
    .filter((text) => text !== 'Goals' && text !== 'See all')

/** The save of this Goal's Current Value answers as the server does; returns what has been sent. */
function answering(target: Goal): unknown[] {
  const sent: unknown[] = []
  answers[`PATCH /goals/${target.id}`] = ({ body }) => {
    sent.push(body)
    Object.assign(target, body)
    return Response.json(target)
  }
  return sent
}

async function changeValue(card: Card, name: string, from: number, to: string) {
  await userEvent.click(card.getByRole('button', { name: `Current value of “${name}”: ${from}. Change` }))
  const field = card.getByRole('textbox', { name: `Current value of “${name}”` })
  await userEvent.clear(field)
  await userEvent.type(field, `${to}{Enter}`)
}

/** The fill of the bar in the row of the Goal with this name. */
const fillOf = (card: Card, name: string) => card.getByRole('link', { name }).closest('li')!.querySelector<HTMLElement>('.goal-card__fill')!

describe('Home · the Goals card', () => {
  it("shows a Goal's name, Current Value, Target and Progress", async () => {
    goal('Review October')
    renderHome()

    const card = await loadedCard()
    expect(card.getByRole('link', { name: 'Review October' }).getAttribute('href')).toBe('/goals')
    expect(card.getByRole('button', { name: 'Current value of “Review October”: 42. Change' }).textContent).toBe('42')
    expect(card.getByText('/ 60')).toBeTruthy()
    expect(card.getByText('70%')).toBeTruthy()
  })

  it('keeps only the Goals In Progress today', async () => {
    goal('Going')
    goal('Starts later', { startDate: '2026-11-08' })
    goal('Ran out', { deadline: '2026-11-06' })
    goal('Done', { currentValue: 60 })
    goal('Last day', { deadline: '2026-11-07' })
    goal('First day', { startDate: '2026-11-07' })
    renderHome()

    expect(namesOn(await loadedCard()).sort()).toEqual(['First day', 'Going', 'Last day'])
  })

  it('orders them by nearest Deadline, ties by creation as on the Goals screen', async () => {
    goal('Far', { deadline: '2026-12-20' })
    goal('Tied, created later', { deadline: '2026-11-10', createdAt: '2026-11-02T10:00:00.000Z' })
    goal('Tied, created first', { deadline: '2026-11-10', createdAt: '2026-11-01T10:00:00.000Z' })
    goal('Near', { deadline: '2026-11-08' })
    renderHome()

    expect(namesOn(await loadedCard())).toEqual(['Near', 'Tied, created first', 'Tied, created later', 'Far'])
  })

  it('shows five at most, the five with the nearest Deadlines', async () => {
    for (const day of [16, 11, 15, 12, 14, 13]) goal(`Day ${day}`, { deadline: `2026-11-${day}` })
    renderHome()

    expect(namesOn(await loadedCard())).toEqual(['Day 11', 'Day 12', 'Day 13', 'Day 14', 'Day 15'])
  })

  it('stops the bar at full while the number goes past 100 %', async () => {
    answering(goal('Passing'))
    renderHome()

    const card = await loadedCard()
    await changeValue(card, 'Passing', 42, '90')

    expect(await card.findByText('150%')).toBeTruthy()
    expect(fillOf(card, 'Passing').style.width).toBe('100%')
  })

  it('fills the bar as far as the Progress', async () => {
    goal('Going')
    renderHome()

    expect(fillOf(await loadedCard(), 'Going').style.width).toBe('70%')
  })

  it('changes the Current Value right on the row, and saves it', async () => {
    const going = goal('Going')
    const patches = answering(going)
    renderHome()

    const card = await loadedCard()
    await changeValue(card, 'Going', 42, '48')

    expect(await card.findByText('80%')).toBeTruthy()
    expect(card.getByRole('button', { name: 'Current value of “Going”: 48. Change' })).toBeTruthy()
    expect(fillOf(card, 'Going').style.width).toBe('80%')
    await vi.waitFor(() => expect(patches).toEqual([{ currentValue: 48 }]))
  })

  it('says so on the row when the new value is not saved, and goes back to the one that was', async () => {
    const going = goal('Going')
    answers[`PATCH /goals/${going.id}`] = () => refusal(500, 'internal')
    renderHome()

    const card = await loadedCard()
    await changeValue(card, 'Going', 42, '48')

    expect(await card.findByText("The change wasn't saved. Try again.")).toBeTruthy()
    expect(card.getByRole('button', { name: 'Current value of “Going”: 42. Change' })).toBeTruthy()
  })

  it('keeps a Goal that has just reached its Target, marked Achieved and in its place', async () => {
    const first = goal('First', { deadline: '2026-11-10' })
    goal('Second', { deadline: '2026-11-20' })
    answering(first)
    renderHome()

    const card = await loadedCard()
    expect(card.queryByText('Achieved')).toBeNull()
    await changeValue(card, 'First', 42, '60')

    expect(await card.findByText('Achieved')).toBeTruthy()
    expect(card.getByText('100%')).toBeTruthy()
    expect(namesOn(card)).toEqual(['First', 'Second'])
  })

  it('does not let a sixth Goal in when one is Achieved', async () => {
    const first = goal('Day 11', { deadline: '2026-11-11' })
    for (const day of [12, 13, 14, 15, 16]) goal(`Day ${day}`, { deadline: `2026-11-${day}` })
    answering(first)
    renderHome()

    const card = await loadedCard()
    await changeValue(card, 'Day 11', 42, '60')

    await card.findByText('Achieved')
    expect(namesOn(card)).toEqual(['Day 11', 'Day 12', 'Day 13', 'Day 14', 'Day 15'])
  })

  it('takes off the mark if the value is brought back under the Target', async () => {
    const first = goal('First')
    answering(first)
    renderHome()

    const card = await loadedCard()
    await changeValue(card, 'First', 42, '60')
    await card.findByText('Achieved')
    await changeValue(card, 'First', 60, '50')

    await vi.waitFor(() => expect(card.queryByText('Achieved')).toBeNull())
    expect(namesOn(card)).toEqual(['First'])
  })

  it('leads from its title and from "See all" to the Goals screen', async () => {
    goal('Going')
    renderHome()

    const card = await loadedCard()
    expect(card.getByRole('link', { name: 'Goals' }).getAttribute('href')).toBe('/goals')
    expect(card.getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('/goals')
  })

  it('goes to the Goals screen from a name without leaving the app', async () => {
    goal('Going')
    renderHome()

    await userEvent.click((await loadedCard()).getByRole('link', { name: 'Going' }))

    expect(window.location.pathname).toBe('/goals')
  })

  it('says when no Goal is In Progress and offers a way to the Goals screen', async () => {
    goal('Starts later', { startDate: '2026-11-08' })
    goal('Done', { currentValue: 60 })
    renderHome()

    const card = await loadedCard()
    expect(card.getByText('No goals in progress')).toBeTruthy()
    expect(card.getByText('The ones starting later, expired and achieved are in Goals.')).toBeTruthy()
    expect(card.getAllByRole('link', { name: 'See all' })).toHaveLength(1)
    expect(card.getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('/goals')
    expect(card.queryByRole('link', { name: 'New goal' })).toBeNull()
  })

  it('says when there are no Goals and offers "New goal", which leads to the Goals screen', async () => {
    renderHome()

    const card = await loadedCard()
    expect(card.getByText("You don't have any goals yet")).toBeTruthy()
    expect(card.getByText('Set yourself a target with a date and follow how it goes here.')).toBeTruthy()
    expect(card.getByRole('link', { name: 'New goal' }).getAttribute('href')).toBe('/goals')
    expect(card.queryByRole('link', { name: 'See all' })).toBeNull()
  })

  it('reads in Spanish too', async () => {
    const first = goal('Primero')
    goal('Segundo')
    answering(first)
    renderHome('es')

    const card = await loadedCard('Objetivos')
    expect(card.getByRole('link', { name: 'Ver todos' })).toBeTruthy()
    await userEvent.click(card.getByRole('button', { name: 'Valor actual de «Primero»: 42. Cambiar' }))
    const field = card.getByRole('textbox', { name: 'Valor actual de «Primero»' })
    await userEvent.clear(field)
    await userEvent.type(field, '60{Enter}')
    expect(await card.findByText('Conseguido')).toBeTruthy()
  })

  it('says both empty states in Spanish', async () => {
    renderHome('es')
    const card = await loadedCard('Objetivos')
    expect(card.getByText('Aún no tienes objetivos')).toBeTruthy()
    expect(card.getByText('Ponte una meta con fecha y sigue aquí cómo avanza.')).toBeTruthy()
    expect(card.getByRole('link', { name: 'Nuevo objetivo' })).toBeTruthy()
    cleanup()

    goal('Más adelante', { startDate: '2026-12-01', deadline: '2026-12-31' })
    renderHome('es')
    const none = await loadedCard('Objetivos')
    expect(none.getByText('Ningún objetivo en curso')).toBeTruthy()
    expect(none.getByText('Los que empiezan más adelante, los vencidos y los conseguidos están en Objetivos.')).toBeTruthy()
    expect(none.getByRole('link', { name: 'Ver todos' })).toBeTruthy()
  })

  it('shows it is loading, title kept, until the read answers', async () => {
    let answer: (response: Response) => void = () => undefined
    answers['GET /goals'] = () => new Promise<Response>((resolve) => (answer = resolve))
    renderHome()

    const section = await screen.findByRole('region', { name: 'Goals' })
    expect(section.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(within(section).getByRole('link', { name: 'Goals' })).toBeTruthy()
    expect(within(section).queryByRole('link', { name: 'See all' })).toBeNull()

    goal('Going')
    answer(Response.json({ goals: stored }))

    expect(namesOn(await loadedCard())).toEqual(['Going'])
  })

  it('shows a failed read with "Retry", which recovers it', async () => {
    let failing = true
    goal('Going')
    answers['GET /goals'] = () => (failing ? refusal(500, 'internal') : Response.json({ goals: stored }))
    renderHome()

    const card = await loadedCard()
    expect(await card.findByText("Couldn't load this")).toBeTruthy()
    expect(card.queryByRole('link', { name: 'See all' })).toBeNull()

    failing = false
    await userEvent.click(card.getByRole('button', { name: 'Retry' }))

    expect(await card.findByRole('link', { name: 'Going' })).toBeTruthy()
    expect(card.queryByText("Couldn't load this")).toBeNull()
  })

  it('does not take the others down when it fails, nor when another fails', async () => {
    answers['GET /goals'] = () => refusal(500, 'internal')
    answers['GET /lab/ranges'] = () => Response.json([{ id: 'r', name: 'R' }])
    renderHome()

    expect(await (await loadedCard()).findByText("Couldn't load this")).toBeTruthy()
    expect(await (await loadedCard('Lab')).findByText('range')).toBeTruthy()
    cleanup()

    goal('Going')
    answers['GET /goals'] = () => Response.json({ goals: stored })
    answers['GET /lab/ranges'] = () => refusal(500, 'internal')
    renderHome()

    expect(namesOn(await loadedCard())).toEqual(['Going'])
    expect(await (await loadedCard('Lab')).findByText("Couldn't load this")).toBeTruthy()
  })

  it('no longer shows the Achieved Goal the next time Home is loaded', async () => {
    const first = goal('First')
    goal('Second')
    const patches = answering(first)
    renderHome()

    const card = await loadedCard()
    await changeValue(card, 'First', 42, '60')
    await card.findByText('Achieved')
    await vi.waitFor(() => expect(patches).toHaveLength(1))

    cleanup()
    renderHome()

    const again = await loadedCard()
    expect(namesOn(again)).toEqual(['Second'])
    expect(again.queryByText('Achieved')).toBeNull()
  })
})
