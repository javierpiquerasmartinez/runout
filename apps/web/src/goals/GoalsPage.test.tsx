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
/** What changing a Goal answers instead of changing it, when set. */
let patchReply: ((call: ApiCall) => Response | Promise<Response>) | null
/** What deleting a Goal answers instead of deleting it, when set. */
let deleteReply: (() => Response | Promise<Response>) | null
/** What the faked server answers, by request; a Goal it holds adds its own. */
let answers: Parameters<typeof fakeApi>[0]

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
  answers[`PATCH /goals/${made.id}`] = (call) => {
    if (patchReply) return patchReply(call)
    Object.assign(made, call.body)
    return Response.json(made)
  }
  answers[`DELETE /goals/${made.id}`] = () => {
    if (deleteReply) return deleteReply()
    stored.splice(stored.indexOf(made), 1)
    return new Response(null, { status: 204 })
  }
  return made
}

beforeEach(() => {
  // Saturday 7 November 2026, at noon in the browser's own zone. Only Date is faked: timers run.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 7, 12, 0))
  stored = []
  createReply = null
  listReply = null
  patchReply = null
  deleteReply = null
  answers = {
    'GET /goals': () => (listReply ? listReply() : Response.json({ goals: stored })),
    'POST /goals': ({ body }) => {
      if (createReply) return createReply()
      const sent = body as Pick<Goal, 'name' | 'description' | 'target' | 'startDate' | 'deadline'>
      return Response.json(held({ ...sent, name: sent.name.trim(), description: sent.description.trim() }), { status: 201 })
    },
  }
  calls = fakeApi(answers)
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

describe('GoalsPage · changing the Current Value', () => {
  const changes = () => calls.filter(({ method }) => method === 'PATCH')
  const control = (name: string, value: string) => screen.findByRole('button', { name: `Current value of “${name}”: ${value}. Change` })
  const valueField = (name: string) => screen.getByRole<HTMLInputElement>('textbox', { name: `Current value of “${name}”` })
  const shown = () => screen.getAllByRole('article').map((goal) => within(goal).getByRole('heading').textContent)

  /** Opens a Goal's field and leaves in it what is given, without saving. */
  async function typeValue(name: string, value: string, text: string) {
    await userEvent.click(await control(name, value))
    await userEvent.clear(valueField(name))
    if (text !== '') await userEvent.type(valueField(name), text)
  }

  it('turns the control into a field holding the present value, focused, on a numeric keyboard', async () => {
    held({ name: 'Manos', currentValue: 320 })
    renderGoals()

    await userEvent.click(await control('Manos', '320'))

    expect(valueField('Manos').value).toBe('320')
    expect(valueField('Manos').inputMode).toBe('decimal')
    expect(document.activeElement).toBe(valueField('Manos'))
  })

  it('saves on Enter, replacing the old value, and hands the focus back', async () => {
    held({ name: 'Manos', target: 1000, currentValue: 320 })
    renderGoals()
    await typeValue('Manos', '320', '500')

    await userEvent.keyboard('{Enter}')

    const saved = await control('Manos', '500')
    expect(document.activeElement).toBe(saved)
    expect(within(await card('Manos')).getByText('50%')).toBeTruthy()
    await waitFor(() => expect(changes()).toHaveLength(1))
    expect(changes()[0]).toMatchObject({ path: '/goals/g1', body: { currentValue: 500 } })
  })

  it('saves on leaving the field, once', async () => {
    held({ name: 'Manos', target: 1000, currentValue: 320 })
    renderGoals()
    await typeValue('Manos', '320', '500')

    await userEvent.tab()

    await control('Manos', '500')
    await waitFor(() => expect(changes()).toHaveLength(1))
  })

  it('sends one change for one Enter, however the field goes away', async () => {
    held({ name: 'Manos', target: 1000, currentValue: 320 })
    renderGoals()
    await typeValue('Manos', '320', '500')
    await userEvent.keyboard('{Enter}')
    await control('Manos', '500')

    await userEvent.tab()

    await waitFor(() => expect(changes()).toHaveLength(1))
    expect(changes()).toHaveLength(1)
  })

  it('restores the value on Escape, sending nothing, and hands the focus back', async () => {
    held({ name: 'Manos', currentValue: 320 })
    renderGoals()
    await typeValue('Manos', '320', '500')

    await userEvent.keyboard('{Escape}')

    expect(document.activeElement).toBe(await control('Manos', '320'))
    expect(changes()).toHaveLength(0)
  })

  it('sends nothing when the value is left as it was', async () => {
    held({ name: 'Manos', currentValue: 320 })
    renderGoals()
    await userEvent.click(await control('Manos', '320'))

    await userEvent.keyboard('{Enter}')

    await control('Manos', '320')
    expect(changes()).toHaveLength(0)
  })

  it('types and shows the value the way the UI language writes numbers', async () => {
    held({ name: 'Manos', target: 50000, currentValue: 12000.5 })
    renderGoals('es')

    await userEvent.click(await screen.findByRole('button', { name: 'Valor actual de «Manos»: 12.000,5. Cambiar' }))
    const typed = screen.getByRole<HTMLInputElement>('textbox', { name: 'Valor actual de «Manos»' })
    expect(typed.value).toBe('12.000,5')

    await userEvent.clear(typed)
    await userEvent.type(typed, '25.000,75{Enter}')

    expect(await screen.findByRole('button', { name: 'Valor actual de «Manos»: 25.000,75. Cambiar' })).toBeTruthy()
    await waitFor(() => expect(changes()).toHaveLength(1))
    expect(changes()[0].body).toEqual({ currentValue: 25000.75 })
  })

  it.each([
    ['above the Target', 1200, 'Achieved', '120%'],
    ['to 0', 0, 'In progress', '0%'],
  ])('accepts a value %s', async (_, value, status, percent) => {
    held({ name: 'Manos', target: 1000, currentValue: 320 })
    renderGoals()
    await typeValue('Manos', '320', String(value))

    await userEvent.keyboard('{Enter}')

    const goal = within(await card('Manos'))
    expect(goal.getByText(status)).toBeTruthy()
    expect(goal.getByText(percent)).toBeTruthy()
    await waitFor(() => expect(changes()).toHaveLength(1))
  })

  it('drops an Achieved Goal back when the value is lowered, with its countdown', async () => {
    held({ name: 'Manos', target: 1000, currentValue: 1000, deadline: '2026-11-19' })
    renderGoals()
    await typeValue('Manos', '1,000', '999.99')

    await userEvent.keyboard('{Enter}')

    const goal = within(await card('Manos'))
    expect(goal.getByText('In progress')).toBeTruthy()
    expect(goal.getByText('12 days left')).toBeTruthy()
    expect(goal.getByText('99%')).toBeTruthy()
  })

  it('updates a Goal that is Not Started', async () => {
    held({ name: 'Manos', target: 10, startDate: '2026-11-12', deadline: '2026-11-30' })
    renderGoals()
    await typeValue('Manos', '0', '3')

    await userEvent.keyboard('{Enter}')

    const goal = within(await card('Manos'))
    expect(goal.getByText('Not started')).toBeTruthy()
    expect(goal.getByText('30%')).toBeTruthy()
  })

  it('makes an Expired Goal Achieved on reaching its Target, without any countdown', async () => {
    held({ name: 'Vencido', target: 10, currentValue: 3, deadline: '2026-11-04' })
    renderGoals()
    await typeValue('Vencido', '3', '10')

    await userEvent.keyboard('{Enter}')

    const goal = await card('Vencido')
    expect(within(goal).getByText('Achieved')).toBeTruthy()
    expect(goal.textContent).not.toMatch(/\bdays?\b/)
  })

  it('takes a Goal to its place in the list when it stops being open', async () => {
    held({ name: 'Pronto', target: 10, currentValue: 3, deadline: '2026-11-20' })
    held({ name: 'Tarde', target: 10, currentValue: 3, deadline: '2026-12-31' })
    renderGoals()
    await card('Pronto')
    expect(shown()).toEqual(['Pronto', 'Tarde'])
    await typeValue('Pronto', '3', '10')

    await userEvent.keyboard('{Enter}')

    await control('Pronto', '10')
    expect(shown()).toEqual(['Tarde', 'Pronto'])
  })

  it('keeps the Goal Status and the Progress on the saved value while typing', async () => {
    held({ name: 'Manos', target: 10, currentValue: 3 })
    renderGoals()

    await typeValue('Manos', '3', '10')

    const goal = within(await card('Manos'))
    expect(goal.getByText('In progress')).toBeTruthy()
    expect(goal.getByText('30%')).toBeTruthy()
  })

  const invalidMessage = 'Write a number between 0 and 999,999,999, with two decimals at most.'

  it.each([
    ['below 0', '-3'],
    ['above 999,999,999', '1000000000'],
    ['with more than two decimals', '5.555'],
    ['that is not a number', 'mucho'],
    ['empty', ''],
  ])('keeps a value %s in the field with a message, and sends nothing', async (_, text) => {
    held({ name: 'Manos', currentValue: 320 })
    renderGoals()
    await typeValue('Manos', '320', text)

    await userEvent.keyboard('{Enter}')

    expect(within(await card('Manos')).getByRole('alert').textContent).toBe(invalidMessage)
    expect(valueField('Manos').value).toBe(text)
    expect(valueField('Manos').getAttribute('aria-invalid')).toBe('true')
    expect(changes()).toHaveLength(0)
  })

  it('keeps an invalid value in the field on leaving it too', async () => {
    held({ name: 'Manos', currentValue: 320 })
    renderGoals()
    await typeValue('Manos', '320', '-3')

    await userEvent.tab()

    expect(within(await card('Manos')).getByRole('alert').textContent).toBe(invalidMessage)
    expect(valueField('Manos').value).toBe('-3')
    expect(changes()).toHaveLength(0)
  })

  it('takes the message away as the value is corrected, and Escape leaves the old value', async () => {
    held({ name: 'Manos', currentValue: 320 })
    renderGoals()
    await typeValue('Manos', '320', '-3')
    await userEvent.keyboard('{Enter}')
    const goal = within(await card('Manos'))

    await userEvent.type(valueField('Manos'), '{Backspace}')
    expect(goal.queryByRole('alert')).toBeNull()

    await userEvent.keyboard('{Enter}{Escape}')
    expect(await control('Manos', '320')).toBeTruthy()
    expect(goal.queryByRole('alert')).toBeNull()
    expect(changes()).toHaveLength(0)
  })

  it('applies the value at once, before the server answers', async () => {
    let answer: (reply: Response) => void = () => {}
    patchReply = () => new Promise((resolve) => (answer = resolve))
    held({ name: 'Manos', target: 10, currentValue: 3 })
    renderGoals()
    await typeValue('Manos', '3', '10')

    await userEvent.keyboard('{Enter}')

    expect(await control('Manos', '10')).toBeTruthy()
    expect(within(await card('Manos')).getByText('Achieved')).toBeTruthy()
    await waitFor(() => expect(changes()).toHaveLength(1))
    answer(Response.json({ ...stored[0], currentValue: 10 }))
  })

  it.each([
    ['the server failing', () => new Response('', { status: 500 })],
    ['the Goal being gone', () => refusal(404, 'goal-not-found')],
  ])('goes back with a message on %s', async (_, reply) => {
    patchReply = reply
    held({ name: 'Manos', target: 10, currentValue: 3 })
    renderGoals()
    await typeValue('Manos', '3', '10')

    await userEvent.keyboard('{Enter}')

    const goal = within(await card('Manos'))
    expect((await goal.findByRole('alert')).textContent).toBe("The change wasn't saved. Try again.")
    expect(await control('Manos', '3')).toBeTruthy()
    expect(goal.getByText('In progress')).toBeTruthy()
    expect(goal.getByText('30%')).toBeTruthy()
  })

  it('says it was not saved in Spanish too', async () => {
    patchReply = () => new Response('', { status: 500 })
    held({ name: 'Manos', target: 10, currentValue: 3 })
    renderGoals('es')

    await userEvent.click(await screen.findByRole('button', { name: 'Valor actual de «Manos»: 3. Cambiar' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Valor actual de «Manos»' }), '0{Enter}')

    expect((await screen.findByRole('alert')).textContent).toBe('No se ha guardado el cambio. Vuelve a intentarlo.')
  })

  it('refuses an invalid value in Spanish with the words of the board', async () => {
    held({ name: 'Manos', currentValue: 3 })
    renderGoals('es')

    await userEvent.click(await screen.findByRole('button', { name: 'Valor actual de «Manos»: 3. Cambiar' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Valor actual de «Manos»' }), 'x{Enter}')

    expect((await screen.findByRole('alert')).textContent).toBe('Escribe un número entre 0 y 999.999.999, con dos decimales como mucho.')
  })

  it('takes the failure message away when the value is opened again', async () => {
    patchReply = () => new Response('', { status: 500 })
    held({ name: 'Manos', target: 10, currentValue: 3 })
    renderGoals()
    await typeValue('Manos', '3', '10')
    await userEvent.keyboard('{Enter}')
    const goal = within(await card('Manos'))
    await goal.findByRole('alert')

    await userEvent.click(await control('Manos', '3'))

    expect(goal.queryByRole('alert')).toBeNull()
  })

  /** Answers each change only when the test says so, in the order the test wants. */
  function heldAnswers() {
    const waiting: ((reply: Response) => void)[] = []
    patchReply = () => new Promise((resolve) => waiting.push(resolve))
    return waiting
  }

  it('does not let a failed save undo a later one', async () => {
    const waiting = heldAnswers()
    held({ name: 'Manos', target: 100, currentValue: 3 })
    renderGoals()
    await typeValue('Manos', '3', '10')
    await userEvent.keyboard('{Enter}')
    await typeValue('Manos', '10', '20')
    await userEvent.keyboard('{Enter}')
    await control('Manos', '20')

    await waitFor(() => expect(waiting).toHaveLength(1))
    waiting[0](new Response('', { status: 500 }))
    await waitFor(() => expect(waiting).toHaveLength(2))
    waiting[1](Response.json({ ...stored[0], currentValue: 20 }))

    await waitFor(() => expect(changes()).toHaveLength(2))
    expect(changes()[1].body).toEqual({ currentValue: 20 })
    expect(await control('Manos', '20')).toBeTruthy()
    expect(within(await card('Manos')).queryByRole('alert')).toBeNull()
  })

  it('goes back to the last value saved when the latest save fails', async () => {
    const waiting = heldAnswers()
    held({ name: 'Manos', target: 100, currentValue: 3 })
    renderGoals()
    await typeValue('Manos', '3', '10')
    await userEvent.keyboard('{Enter}')
    await typeValue('Manos', '10', '20')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(waiting).toHaveLength(1))
    waiting[0](Response.json({ ...stored[0], currentValue: 10 }))
    await waitFor(() => expect(waiting).toHaveLength(2))
    waiting[1](new Response('', { status: 500 }))

    expect(await control('Manos', '10')).toBeTruthy()
    expect((await within(await card('Manos')).findByRole('alert')).textContent).toBe("The change wasn't saved. Try again.")
  })

  it('sends the saves of one Goal one after the other, so the last one written is the last one typed', async () => {
    const waiting = heldAnswers()
    held({ name: 'Manos', target: 100, currentValue: 3 })
    renderGoals()
    await typeValue('Manos', '3', '10')
    await userEvent.keyboard('{Enter}')
    await typeValue('Manos', '10', '20')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(waiting).toHaveLength(1))

    expect(changes()).toHaveLength(1)

    waiting[0](Response.json({ ...stored[0], currentValue: 10 }))
    await waitFor(() => expect(changes()).toHaveLength(2))
    waiting[1](Response.json({ ...stored[0], currentValue: 20 }))
    expect(await control('Manos', '20')).toBeTruthy()
  })
})

const openEdit = async (name: string) => userEvent.click(await screen.findByRole('button', { name: `Edit “${name}”` }))
const save = () => userEvent.click(within(dialog('Edit goal')).getByRole('button', { name: 'Save' }))
const editField = (label: string | RegExp) => within(dialog('Edit goal')).getByLabelText<HTMLInputElement>(label)
const retype = async (label: string | RegExp, text: string) => {
  await userEvent.clear(editField(label))
  await userEvent.type(editField(label), text)
}
const patches = () => calls.filter(({ method }) => method === 'PATCH')
const deletes = () => calls.filter(({ method }) => method === 'DELETE')
const valueControl = (name: string, value: string) => screen.findByRole('button', { name: `Current value of “${name}”: ${value}. Change` })

/** Writes a new Current Value on a Goal's card. */
async function changeValueTo(name: string, value: string, text: string) {
  await userEvent.click(await valueControl(name, value))
  const typed = screen.getByRole('textbox', { name: `Current value of “${name}”` })
  await userEvent.clear(typed)
  await userEvent.type(typed, `${text}{Enter}`)
}

/** Answers each change only when the test says so. */
function answersHeldBack() {
  const waiting: ((reply: Response) => void)[] = []
  patchReply = () => new Promise((resolve) => waiting.push(resolve))
  return waiting
}

describe('GoalsPage · editing a Goal', () => {
  it('opens the dialog from the card holding the fields of the Goal, and never its Current Value', async () => {
    held({ name: 'Manos', description: 'Solo NL50', target: 1234.5, currentValue: 320, startDate: '2026-11-01', deadline: '2026-12-31' })
    renderGoals()

    await openEdit('Manos')

    expect(editField('Name').value).toBe('Manos')
    expect(editField(/^Description/).value).toBe('Solo NL50')
    expect(editField('Target').value).toBe('1,234.5')
    expect(editField('Start date').value).toBe('2026-11-01')
    expect(editField('Deadline').value).toBe('2026-12-31')
    expect(within(dialog('Edit goal')).queryByLabelText(/Current value/)).toBeNull()
    expect(within(dialog('Edit goal')).queryByDisplayValue('320')).toBeNull()
  })

  it('does not open from the Current Value, which has a control of its own', async () => {
    held({ name: 'Manos', currentValue: 320 })
    renderGoals()

    await userEvent.click(await valueControl('Manos', '320'))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('writes the Target the way the UI language does, and saves it unchanged', async () => {
    held({ name: 'Manos', target: 12000.5 })
    renderGoals('es')

    await userEvent.click(await screen.findByRole('button', { name: 'Editar «Manos»' }))
    const form = within(screen.getByRole('dialog', { name: 'Editar objetivo' }))
    expect(form.getByLabelText<HTMLInputElement>('Meta').value).toBe('12.000,5')
    await userEvent.click(form.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0].body).toMatchObject({ target: 12000.5 })
  })

  it('saves the fields, and the card follows without reloading', async () => {
    held({ name: 'Manos', description: 'Antes', target: 100, currentValue: 50, deadline: '2026-12-31' })
    renderGoals()
    await openEdit('Manos')

    await retype('Name', 'Otras manos')
    await retype(/^Description/, 'Después')
    await retype('Target', '200')
    await retype('Start date', '2026-11-02')
    await retype('Deadline', '2026-11-19')
    await save()

    const goal = within(await card('Otras manos'))
    expect(goal.getByText('Después')).toBeTruthy()
    expect(goal.getByText('/ 200')).toBeTruthy()
    expect(goal.getByText('25%')).toBeTruthy()
    expect(goal.getByText('12 days left')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(patches()).toHaveLength(1)
    expect(patches()[0]).toMatchObject({ path: '/goals/g1' })
    expect(patches()[0].body).toEqual({
      name: 'Otras manos',
      description: 'Después',
      target: 200,
      startDate: '2026-11-02',
      deadline: '2026-11-19',
    })
  })

  it('makes the Goal Achieved when the Target goes below the Current Value', async () => {
    held({ name: 'Manos', target: 1000, currentValue: 320, deadline: '2026-12-31' })
    renderGoals()
    await openEdit('Manos')

    await retype('Target', '100')
    await save()

    await waitFor(async () => expect(within(await card('Manos')).getByText('Achieved')).toBeTruthy())
    const goal = await card('Manos')
    expect(within(goal).getByText('320%')).toBeTruthy()
    expect(goal.textContent).not.toMatch(/\bdays?\b/)
  })

  it('returns an Expired Goal to In Progress when its Deadline moves forward, and to its place in the list', async () => {
    held({ name: 'Abierto', deadline: '2026-11-15' })
    held({ name: 'Vencido', deadline: '2026-11-04' })
    renderGoals()
    await card('Vencido')
    const shown = () => screen.getAllByRole('article').map((goal) => within(goal).getByRole('heading').textContent)
    expect(shown()).toEqual(['Abierto', 'Vencido'])
    await openEdit('Vencido')

    await retype('Deadline', '2026-11-10')
    await save()

    await waitFor(async () => expect(within(await card('Vencido')).getByText('In progress')).toBeTruthy())
    expect(within(await card('Vencido')).getByText('3 days left')).toBeTruthy()
    expect(shown()).toEqual(['Vencido', 'Abierto'])
  })

  it.each([
    ['Achieved', { target: 10, currentValue: 10 }],
    ['Expired', { deadline: '2026-11-04' }],
    ['Not Started', { startDate: '2026-11-12', deadline: '2026-11-30' }],
  ])('edits a Goal that is %s', async (_, standing) => {
    held({ name: 'Una meta', ...standing })
    renderGoals()
    await openEdit('Una meta')

    await retype('Name', 'Otra meta')
    await save()

    expect(await card('Otra meta')).toBeTruthy()
  })

  it('refuses invalid fields in place under the rules of creating, keeping what was typed and sending nothing', async () => {
    held({ name: 'Manos' })
    renderGoals()
    await openEdit('Manos')

    await userEvent.clear(editField('Name'))
    await retype('Target', '0')
    await retype('Deadline', '2026-10-31')
    await save()

    expect(within(dialog('Edit goal')).getByText('Write a name.')).toBeTruthy()
    expect(within(dialog('Edit goal')).getByText('Write a number above 0.')).toBeTruthy()
    expect(within(dialog('Edit goal')).getByText('It is before the start date.')).toBeTruthy()
    expect(editField('Target').value).toBe('0')
    expect(patches()).toHaveLength(0)
  })

  it("shows the server's refusal beside its field, keeping the dialog open", async () => {
    patchReply = () => refusal(400, 'goal-deadline-before-start')
    held({ name: 'Manos' })
    renderGoals()
    await openEdit('Manos')

    await retype('Name', 'Otro')
    await save()

    expect(await within(dialog('Edit goal')).findByText('It is before the start date.')).toBeTruthy()
    expect(editField('Name').value).toBe('Otro')
  })

  it('says so inside the dialog when it can not be saved', async () => {
    patchReply = () => new Response('', { status: 500 })
    held({ name: 'Manos' })
    renderGoals()
    await openEdit('Manos')

    await save()

    expect((await within(dialog('Edit goal')).findByRole('alert')).textContent).toBe("We couldn't reach the server. Try again.")
  })

  it('discards what was typed when cancelled', async () => {
    held({ name: 'Manos' })
    renderGoals()
    await openEdit('Manos')

    await retype('Name', 'Otro')
    await userEvent.click(within(dialog('Edit goal')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(patches()).toHaveLength(0)
    await openEdit('Manos')
    expect(editField('Name').value).toBe('Manos')
  })

  it('does not close another dialog when a save cancelled on the way comes through', async () => {
    const waiting = answersHeldBack()
    held({ name: 'Manos' })
    held({ name: 'Spots' })
    renderGoals()
    await openEdit('Manos')
    await save()
    await waitFor(() => expect(waiting).toHaveLength(1))
    await userEvent.click(within(dialog('Edit goal')).getByRole('button', { name: 'Cancel' }))
    await openEdit('Spots')

    waiting[0](Response.json({ ...stored[0], name: 'Otras' }))

    await card('Otras')
    expect(editField('Name').value).toBe('Spots')
  })

  it('waits for a pending save of the Current Value, and then keeps that value', async () => {
    const waiting = answersHeldBack()
    held({ name: 'Manos', target: 100, currentValue: 3 })
    renderGoals()
    await changeValueTo('Manos', '3', '10')
    await waitFor(() => expect(waiting).toHaveLength(1))
    await openEdit('Manos')

    await retype('Name', 'Otras')
    await save()

    expect(patches()).toHaveLength(1)
    waiting[0](Response.json({ ...stored[0], currentValue: 10 }))
    await waitFor(() => expect(patches()).toHaveLength(2))
    expect(patches()[1].body).not.toHaveProperty('currentValue')
    waiting[1](Response.json({ ...stored[0], name: 'Otras', currentValue: 10 }))

    expect(await valueControl('Otras', '10')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('still reports a save of the Current Value that fails with an edit behind it, and the value goes back', async () => {
    const waiting = answersHeldBack()
    held({ name: 'Manos', target: 100, currentValue: 3 })
    renderGoals()
    await changeValueTo('Manos', '3', '10')
    await waitFor(() => expect(waiting).toHaveLength(1))
    await openEdit('Manos')

    await retype('Name', 'Otras')
    await save()
    waiting[0](new Response('', { status: 500 }))
    await waitFor(() => expect(patches()).toHaveLength(2))
    waiting[1](Response.json({ ...stored[0], name: 'Otras' }))

    expect(await valueControl('Otras', '3')).toBeTruthy()
    expect((await within(await card('Otras')).findByRole('alert')).textContent).toBe("The change wasn't saved. Try again.")
  })
})

describe('GoalsPage · deleting a Goal', () => {
  const askToDelete = () => userEvent.click(within(dialog('Edit goal')).getByRole('button', { name: 'Delete' }))
  const confirmation = () => dialog('Delete this goal?')
  const confirm = () => userEvent.click(within(confirmation()).getByRole('button', { name: 'Delete goal' }))

  it('is not offered when creating', async () => {
    renderGoals()
    await openDialog()

    expect(within(dialog()).queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('asks first, in the place of the dialog, and says there is no undo', async () => {
    held({ name: 'Manos' })
    renderGoals()
    await openEdit('Manos')

    await askToDelete()

    expect(within(confirmation()).getByText('“Manos” disappears from your list.')).toBeTruthy()
    expect(within(confirmation()).getByText("It can't be undone.")).toBeTruthy()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(deletes()).toHaveLength(0)
  })

  it('asks in Spanish with the words of the board', async () => {
    held({ name: 'Manos' })
    renderGoals('es')
    await userEvent.click(await screen.findByRole('button', { name: 'Editar «Manos»' }))

    await userEvent.click(within(screen.getByRole('dialog', { name: 'Editar objetivo' })).getByRole('button', { name: 'Borrar' }))

    const asking = within(screen.getByRole('dialog', { name: '¿Borrar este objetivo?' }))
    expect(asking.getByText('«Manos» desaparece de tu lista.')).toBeTruthy()
    expect(asking.getByText('No se puede deshacer.')).toBeTruthy()
    expect(asking.getByRole('button', { name: 'Cancelar' })).toBeTruthy()
    expect(asking.getByRole('button', { name: 'Borrar objetivo' })).toBeTruthy()
  })

  it('deletes it on confirming, and returns to the list', async () => {
    held({ name: 'Manos' })
    held({ name: 'Se queda' })
    renderGoals()
    await openEdit('Manos')

    await askToDelete()
    await confirm()

    await waitFor(() => expect(screen.queryByRole('article', { name: 'Manos' })).toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('article', { name: 'Se queda' })).toBeTruthy()
    expect(deletes()).toEqual([expect.objectContaining({ path: '/goals/g1' })])
  })

  it('leaves the empty state when the last one goes', async () => {
    held({ name: 'Manos' })
    renderGoals()
    await openEdit('Manos')

    await askToDelete()
    await confirm()

    expect(await screen.findByText(/You have no goals yet/)).toBeTruthy()
  })

  it('deletes nothing when the confirmation is cancelled, and goes back to the dialog as it was', async () => {
    held({ name: 'Manos' })
    renderGoals()
    await openEdit('Manos')
    await retype('Name', 'A medias')

    await askToDelete()
    await userEvent.click(within(confirmation()).getByRole('button', { name: 'Cancel' }))

    expect(deletes()).toHaveLength(0)
    expect(editField('Name').value).toBe('A medias')
    expect(screen.getByRole('article', { name: 'Manos' })).toBeTruthy()
  })

  it('says so and keeps the Goal when it can not be deleted', async () => {
    deleteReply = () => new Response('', { status: 500 })
    held({ name: 'Manos' })
    renderGoals()
    await openEdit('Manos')

    await askToDelete()
    await confirm()

    expect((await within(dialog('Edit goal')).findByRole('alert')).textContent).toBe("The goal couldn't be deleted. Try again.")
    expect(screen.getByRole('article', { name: 'Manos' })).toBeTruthy()
  })

  it('takes away a Goal that was already gone', async () => {
    deleteReply = () => refusal(404, 'goal-not-found')
    held({ name: 'Manos' })
    renderGoals()
    await openEdit('Manos')

    await askToDelete()
    await confirm()

    await waitFor(() => expect(screen.queryByRole('article', { name: 'Manos' })).toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('waits for a pending save of the Current Value', async () => {
    const waiting = answersHeldBack()
    held({ name: 'Manos', target: 100, currentValue: 3 })
    renderGoals()
    await changeValueTo('Manos', '3', '10')
    await waitFor(() => expect(waiting).toHaveLength(1))
    await openEdit('Manos')

    await askToDelete()
    await confirm()

    expect(deletes()).toHaveLength(0)
    waiting[0](Response.json({ ...stored[0], currentValue: 10 }))
    await waitFor(() => expect(deletes()).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Manos' })).toBeNull())
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
