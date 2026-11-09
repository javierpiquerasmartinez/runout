import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, type Locale } from '../i18n'
import { SessionContext } from '../identity/context'
import { Routes } from '../routes/Routes'
import { fakeApi, refusal, type ApiCall } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'
import type { Goal } from './goals'

/** The Goals the faked server holds. */
let stored: Goal[]
let calls: ApiCall[]
/** What the next create answers instead of creating, when set. */
let createReply: (() => Response) | null
/** What listing answers instead of the Goals, when set. */
let listReply: (() => Response) | null

/** A Goal the faked server holds, with whatever a test cares about. */
function held(goal: Partial<Goal> = {}): Goal {
  const made: Goal = {
    id: `g${stored.length + 1}`,
    name: 'Jugar 50.000 manos',
    description: '',
    target: 50000,
    currentValue: 0,
    startDate: '2026-11-01',
    deadline: '2026-12-31',
    createdAt: '2026-11-01T09:00:00.000Z',
    ...goal,
  }
  stored.push(made)
  return made
}

beforeEach(() => {
  // Saturday 7 November 2026, at noon in the browser's own zone. Only Date is faked: timers run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 7, 12, 0))
  stored = []
  createReply = null
  listReply = null
  calls = fakeApi({
    'GET /goals': () => (listReply ? listReply() : Response.json({ goals: stored })),
    'POST /goals': ({ body }) => {
      if (createReply) return createReply()
      const sent = body as Pick<Goal, 'name' | 'description' | 'target' | 'startDate' | 'deadline'>
      return Response.json(held({ ...sent, name: sent.name.trim(), description: sent.description.trim() }), { status: 201 })
    },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

function renderGoals(locale: Locale = 'en') {
  window.history.replaceState(null, '', '/goals')
  render(
    <I18nProvider initialLocale={locale}>
      <SessionContext.Provider value={fakeSession()}>
        <Routes />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

const card = (name: string) => screen.findByRole('article', { name })
const created = () => calls.filter(({ method }) => method === 'POST')
const dialog = (name = 'New goal') => screen.getByRole('dialog', { name })
const openDialog = async () => userEvent.click(await screen.findByRole('button', { name: 'New goal' }))
const field = (label: string | RegExp) => within(dialog()).getByLabelText<HTMLInputElement>(label)
const submit = () => userEvent.click(within(dialog()).getByRole('button', { name: 'Create goal' }))

/** Fills in what a Goal needs to be accepted; the rest stays as the dialog opened. */
async function fillIn({ name = 'Estudiar ICM', target = '20', deadline = '2026-11-30' } = {}) {
  await userEvent.type(field('Name'), name)
  await userEvent.type(field('Target'), target)
  await userEvent.type(field('Deadline'), deadline)
}

describe('GoalsPage · the list', () => {
  it('shows each Goal as a card with its numbers and its Progress', async () => {
    held({ name: 'Terminar el curso', target: 60, currentValue: 42 })
    held({ name: 'Revisar spots', target: 100, currentValue: 120 })
    renderGoals()

    const first = within(await card('Terminar el curso'))
    expect(first.getByText('42')).toBeTruthy()
    expect(first.getByText('/ 60')).toBeTruthy()
    expect(first.getByText('70%')).toBeTruthy()
    expect(within(await card('Revisar spots')).getByText('120%')).toBeTruthy()
  })

  it('writes the numbers the way the UI language does', async () => {
    held({ name: 'Manos', target: 50000, currentValue: 12000.5 })
    renderGoals('es')

    const goal = within(await card('Manos'))
    expect(goal.getByText('12.000,5')).toBeTruthy()
    expect(goal.getByText('/ 50.000')).toBeTruthy()
    expect(goal.getByText('24 %')).toBeTruthy()
  })

  it('offers the whole description on hover', async () => {
    held({ name: 'Con detalle', description: 'Los doce módulos, con sus ejercicios.' })
    renderGoals()

    await card('Con detalle')
    expect(screen.getByTitle('Los doce módulos, con sus ejercicios.').textContent).toBe('Los doce módulos, con sus ejercicios.')
  })

  it('takes no room for a description there is none of', async () => {
    held({ name: 'Sin detalle' })
    renderGoals()

    const goal = await card('Sin detalle')
    expect(within(goal).queryByRole('paragraph')).toBeNull()
  })

  it('marks Goals in the header', async () => {
    renderGoals()

    await screen.findByRole('heading', { level: 1, name: 'Goals' })
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(nav).getByRole('link', { current: 'page' }).textContent).toBe('Goals')
  })
})

describe('GoalsPage · where each Goal stands', () => {
  // Today is 7 November 2026.
  it.each([
    ['Not Started', { startDate: '2026-11-12', deadline: '2026-11-30' }, 'Not started', 'Starts in 5 days'],
    ['Not Started by a day', { startDate: '2026-11-08', deadline: '2026-11-30' }, 'Not started', 'Starts in 1 day'],
    ['In Progress', { deadline: '2026-11-19' }, 'In progress', '12 days left'],
    ['In Progress by a day', { deadline: '2026-11-08' }, 'In progress', '1 day left'],
    ['on its Deadline', { deadline: '2026-11-07' }, 'In progress', 'Last day'],
    ['Expired', { deadline: '2026-11-04' }, 'Expired', 'Expired 3 days ago'],
    ['Expired by a day', { deadline: '2026-11-06' }, 'Expired', 'Expired 1 day ago'],
  ])('says so of a Goal %s, in English', async (_, dates, status, countdown) => {
    held({ name: 'Una meta', target: 10, currentValue: 3, startDate: '2026-11-01', ...dates })
    renderGoals()

    const goal = within(await card('Una meta'))
    expect(goal.getByText(status)).toBeTruthy()
    expect(goal.getByText(countdown)).toBeTruthy()
  })

  it.each([
    ['Sin empezar', { startDate: '2026-11-12', deadline: '2026-11-30' }, 'Empieza en 5 días'],
    ['Sin empezar', { startDate: '2026-11-08', deadline: '2026-11-30' }, 'Empieza en 1 día'],
    ['En curso', { deadline: '2026-11-19' }, 'Quedan 12 días'],
    ['En curso', { deadline: '2026-11-08' }, 'Queda 1 día'],
    ['En curso', { deadline: '2026-11-07' }, 'Último día'],
    ['Vencido', { deadline: '2026-11-04' }, 'Venció hace 3 días'],
    ['Vencido', { deadline: '2026-11-06' }, 'Venció hace 1 día'],
  ])('says %s and «%s» in Spanish', async (status, dates, countdown) => {
    held({ name: 'Una meta', target: 10, currentValue: 3, startDate: '2026-11-01', ...dates })
    renderGoals('es')

    const goal = within(await card('Una meta'))
    expect(goal.getByText(status)).toBeTruthy()
    expect(goal.getByText(countdown)).toBeTruthy()
  })

  it.each([
    ['before its Start Date', '2026-11-12', '2026-11-30'],
    ['after its Deadline', '2026-10-01', '2026-11-01'],
  ])('reads Achieved %s and says nothing about time', async (_, startDate, deadline) => {
    held({ name: 'Hecho', target: 10, currentValue: 10, startDate, deadline })
    renderGoals()

    const goal = await card('Hecho')
    expect(within(goal).getByText('Achieved')).toBeTruthy()
    expect(goal.textContent).not.toMatch(/\bdays?\b|Starts|Expired/i)
  })

  it.each([
    ['first thing', new Date(2026, 10, 7, 0, 5)],
    ['last thing', new Date(2026, 10, 7, 23, 55)],
  ])('takes today from the local date, %s at night', async (_, now) => {
    vi.setSystemTime(now)
    held({ name: 'Hoy acaba', deadline: '2026-11-07' })
    held({ name: 'Mañana empieza', startDate: '2026-11-08', deadline: '2026-11-30' })
    renderGoals()

    expect(within(await card('Hoy acaba')).getByText('Last day')).toBeTruthy()
    expect(within(await card('Mañana empieza')).getByText('Starts in 1 day')).toBeTruthy()
  })
})

describe('GoalsPage · the order of the list', () => {
  const shown = () => screen.getAllByRole('article').map((goal) => within(goal).getByRole('heading').textContent)

  it('puts what needs attention first and what is over after it', async () => {
    held({ name: 'Vencido antes', deadline: '2026-11-02', createdAt: '2026-10-01T09:00:00.000Z' })
    held({ name: 'En curso lejos', deadline: '2026-12-31' })
    held({ name: 'Conseguido', target: 10, currentValue: 10, deadline: '2026-11-20' })
    held({ name: 'Empata, el nuevo', deadline: '2026-11-20', createdAt: '2026-11-02T09:00:00.000Z' })
    held({ name: 'Sin empezar pronto', startDate: '2026-11-10', deadline: '2026-11-15' })
    held({ name: 'Empata, el viejo', deadline: '2026-11-20', createdAt: '2026-10-20T09:00:00.000Z' })
    renderGoals()
    await card('Conseguido')

    expect(shown()).toEqual([
      'Sin empezar pronto',
      'Empata, el viejo',
      'Empata, el nuevo',
      'En curso lejos',
      'Conseguido',
      'Vencido antes',
    ])
  })

  it('puts a new Goal in its place', async () => {
    held({ name: 'Más tarde', deadline: '2026-12-31' })
    renderGoals()
    await card('Más tarde')
    await openDialog()
    await fillIn({ name: 'Antes', deadline: '2026-11-30' })
    await submit()
    await card('Antes')

    expect(shown()).toEqual(['Antes', 'Más tarde'])
  })
})

describe('GoalsPage · with no Goals', () => {
  it('shows a short phrase and the way to create one, once', async () => {
    renderGoals()

    expect(await screen.findByText('You have no goals yet. Write down what you want to reach, and by when.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'New goal' })).toHaveLength(1)
  })
})

describe('GoalsPage · when the Goals can not be loaded', () => {
  it('says so, and does not take it for an empty list', async () => {
    listReply = () => new Response('', { status: 500 })
    renderGoals()

    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't load your goals.")
    expect(screen.queryByText(/You have no goals yet/)).toBeNull()
  })
})

describe('GoalsPage · creating a Goal', () => {
  it('opens with the Start Date on today and the rest empty', async () => {
    renderGoals()
    await openDialog()

    expect(field('Name').value).toBe('')
    expect(field(/^Description/).value).toBe('')
    expect(field('Target').value).toBe('')
    expect(field('Start date').value).toBe('2026-11-07')
    expect(field('Deadline').value).toBe('')
  })

  it('creates it and shows it without reloading, starting at 0', async () => {
    held({ name: 'Ya estaba' })
    renderGoals()
    await card('Ya estaba')
    await openDialog()

    await fillIn({ name: 'Estudiar ICM', target: '20', deadline: '2026-11-30' })
    await userEvent.type(field(/^Description/), 'Los doce módulos')
    await submit()

    const goal = within(await card('Estudiar ICM'))
    expect(goal.getByText('/ 20')).toBeTruthy()
    expect(goal.getByText('0%')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(created()[0].body).toEqual({
      name: 'Estudiar ICM',
      description: 'Los doce módulos',
      target: 20,
      startDate: '2026-11-07',
      deadline: '2026-11-30',
    })
    expect(screen.getByRole('article', { name: 'Ya estaba' })).toBeTruthy()
  })

  it('creates the first one from the empty state, which then goes', async () => {
    renderGoals()
    await openDialog()
    await fillIn()
    await submit()

    await card('Estudiar ICM')
    expect(screen.queryByText(/You have no goals yet/)).toBeNull()
  })

  it('reads the Target the way the UI language writes it', async () => {
    renderGoals('es')
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo objetivo' }))
    const form = within(screen.getByRole('dialog', { name: 'Nuevo objetivo' }))

    await userEvent.type(form.getByLabelText('Nombre'), 'Estudiar')
    await userEvent.type(form.getByLabelText('Meta'), '12.000,5')
    await userEvent.type(form.getByLabelText('Fecha límite'), '2026-11-30')
    await userEvent.click(form.getByRole('button', { name: 'Crear objetivo' }))

    await waitFor(() => expect(created()).toHaveLength(1))
    expect(created()[0].body).toMatchObject({ target: 12000.5 })
  })

  it('refuses every invalid field in place at once, keeping what was typed and sending nothing', async () => {
    renderGoals()
    await openDialog()
    await userEvent.type(field(/^Description/), 'Lo que cuenta')
    await userEvent.type(field('Target'), 'mucho')
    await submit()

    expect(within(dialog()).getByText('Write a name.')).toBeTruthy()
    expect(within(dialog()).getByText('Write a number above 0.')).toBeTruthy()
    expect(within(dialog()).getByText('Choose a deadline.')).toBeTruthy()
    expect(field(/^Description/).value).toBe('Lo que cuenta')
    expect(field('Target').value).toBe('mucho')
    expect(created()).toHaveLength(0)
  })

  it('refuses a Target with too many decimals, or too large', async () => {
    renderGoals()
    await openDialog()
    await fillIn({ target: '5.555' })
    await submit()

    expect(within(dialog()).getByText('Write a number above 0 and up to 999,999,999, with two decimals at most.')).toBeTruthy()
    expect(created()).toHaveLength(0)
  })

  it('refuses a Deadline before the Start Date, and accepts one on it', async () => {
    renderGoals()
    await openDialog()
    await fillIn({ deadline: '2026-11-06' })
    await submit()

    expect(within(dialog()).getByText('It is before the start date.')).toBeTruthy()
    expect(created()).toHaveLength(0)

    await userEvent.clear(field('Deadline'))
    await userEvent.type(field('Deadline'), '2026-11-07')
    await submit()

    await card('Estudiar ICM')
    expect(created()[0].body).toMatchObject({ startDate: '2026-11-07', deadline: '2026-11-07' })
  })

  it('takes a refusal away as its field is corrected', async () => {
    renderGoals()
    await openDialog()
    await submit()

    await userEvent.type(field('Name'), 'E')

    expect(within(dialog()).queryByText('Write a name.')).toBeNull()
    expect(within(dialog()).getByText('Choose a deadline.')).toBeTruthy()
  })

  it("shows the server's refusal beside its field, keeping what was typed", async () => {
    createReply = () => refusal(400, 'invalid-goal-name')
    renderGoals()
    await openDialog()
    await fillIn({ name: 'Rechazado' })
    await submit()

    expect(await within(dialog()).findByText("That name doesn't work: write one of 80 characters at most.")).toBeTruthy()
    expect(field('Name').value).toBe('Rechazado')
  })

  it('says so inside the dialog when it can not be created', async () => {
    createReply = () => new Response('', { status: 500 })
    renderGoals()
    await openDialog()
    await fillIn()
    await submit()

    expect((await within(dialog()).findByRole('alert')).textContent).toBe("We couldn't reach the server. Try again.")
    expect(field('Name').value).toBe('Estudiar ICM')
  })

  it('creates nothing when cancelled, and opens empty again', async () => {
    renderGoals()
    await openDialog()
    await fillIn()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(created()).toHaveLength(0)
    expect(screen.queryByRole('article')).toBeNull()

    await openDialog()
    expect(field('Name').value).toBe('')
  })
})
