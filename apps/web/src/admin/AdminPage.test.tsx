import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext, type SessionContextValue } from '../identity/context'
import { fakeApi, refusal, type ApiCall } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'
import { AdminPage } from './AdminPage'
import type { AdminTab } from './admin'

const administrator = { id: 'admin', displayName: 'Javier', email: 'javier@example.com' }

function invitation(id: string, email: string, status: string, extra: object = {}) {
  return {
    id,
    email,
    language: 'es',
    plan: 'beta',
    status,
    sentBy: administrator,
    sentAt: '2026-11-01T10:00:00Z',
    expiresAt: '2026-11-08T10:00:00Z',
    acceptedAt: null,
    account: null,
    cancelledAt: null,
    ...extra,
  }
}

const MB = 1024 * 1024
const counts = { libraryHands: 0, imports: 0, ranges: 0, libraryTags: 0, labTags: 0, notes: 0, roomsCreated: 0, roomsJoined: 0 }

function account(id: string, email: string, extra: object = {}) {
  return {
    id,
    email,
    displayName: email.split('@')[0],
    createdAt: '2026-11-01T10:00:00Z',
    invitation: null,
    signInMethods: ['password'],
    lastSignedInAt: null,
    lastActiveAt: null,
    administrator: false,
    plan: 'pro',
    planChange: { at: '2026-11-01T10:00:00Z', how: 'migration', administrator: null },
    suspension: null,
    counts,
    impersonations: [],
    ...extra,
  }
}

const totals = {
  accounts: 12,
  activeLast7Days: 5,
  activeLast30Days: 9,
  suspended: 1,
  pendingInvitations: 2,
  hands: 3456,
  ranges: 40,
  openRooms: 3,
  closedRooms: 17,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

let session: SessionContextValue

beforeEach(() => {
  session = fakeSession({ administrator: true })
})

function renderTab(tab: AdminTab) {
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <AdminPage tab={tab} />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

describe('the Invitations tab', () => {
  let calls: ApiCall[]
  let list: object[]

  beforeEach(() => {
    list = [
      invitation('1', 'ana@x.com', 'pending'),
      invitation('2', 'bea@x.com', 'accepted', {
        acceptedAt: '2026-11-02T10:00:00Z',
        account: { id: 'bea', displayName: 'Bea', email: 'bea@x.com' },
      }),
      invitation('3', 'carla@x.com', 'expired'),
      invitation('4', 'dani@x.com', 'cancelled', { plan: 'pro' }),
    ]
    calls = fakeApi({
      'GET /admin/invitations': () => Response.json(list),
      'POST /admin/invitations': (call) => {
        const { email } = call.body as { email: string }
        if (email === 'ana@x.com') return refusal(409, 'invitation-pending', { invitationId: '1' })
        if (email === 'old@x.com') return refusal(409, 'account-exists', { accountId: 'old', suspended: true })
        return Response.json({ invitation: invitation('5', email, 'pending'), emailSent: true }, { status: 201 })
      },
      'POST /admin/invitations/1/resend': () => Response.json({ invitation: list[0], emailSent: true }),
      'POST /admin/invitations/1/cancel': () => Response.json(list[0]),
      'DELETE /admin/accounts/old/suspension': () => new Response(null, { status: 204 }),
    })
  })

  it('shows the Plan each Invitation offers, after its status', async () => {
    renderTab('invitations')

    const rows = await screen.findAllByRole('row')
    const headers = within(rows[0])
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent)
    expect(headers.slice(0, 3)).toEqual(['Email', 'Status', 'Plan'])
    expect(within(rows[1]).getAllByRole('cell')[2].textContent).toBe('Beta')
    expect(within(rows[4]).getAllByRole('cell')[2].textContent).toBe('Pro')
  })

  it('offers Beta unless another Plan is picked', async () => {
    renderTab('invitations')

    expect((await screen.findByRole('radio', { name: 'Beta' })).getAttribute('aria-checked')).toBe('true')
    await userEvent.type(screen.getByLabelText('Email'), 'eva@x.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    await screen.findByRole('status')
    await userEvent.type(screen.getByLabelText('Email'), 'fran@x.com')
    await userEvent.click(screen.getByRole('radio', { name: 'Pro' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

    await waitFor(() =>
      expect(calls.filter((call) => call.method === 'POST').map((call) => call.body)).toEqual([
        { email: 'eva@x.com', language: 'es', plan: 'beta' },
        { email: 'fran@x.com', language: 'es', plan: 'pro' },
      ]),
    )
  })

  it('lists every Invitation with its status, sender and resulting Account', async () => {
    renderTab('invitations')

    const rows = await screen.findAllByRole('row')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Email'),
      expect.stringMatching(/ana@x\.com.*Pending.*Javier/),
      expect.stringMatching(/bea@x\.com.*Accepted.*Bea/),
      expect.stringMatching(/carla@x\.com.*Expired/),
      expect.stringMatching(/dani@x\.com.*Cancelled/),
    ])
    // Resend for pending and expired ones; cancel only for pending.
    expect(within(rows[1]).getByRole('button', { name: 'Resend' })).toBeTruthy()
    expect(within(rows[1]).getByRole('button', { name: 'Cancel invitation' })).toBeTruthy()
    expect(within(rows[2]).queryByRole('button')).toBeNull()
    expect(within(rows[3]).getByRole('button', { name: 'Resend' })).toBeTruthy()
    expect(within(rows[3]).queryByRole('button', { name: 'Cancel invitation' })).toBeNull()
  })

  it('sends one in the language picked', async () => {
    renderTab('invitations')

    await userEvent.type(await screen.findByLabelText('Email'), 'eva@x.com')
    await userEvent.click(screen.getByRole('radio', { name: 'English' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

    expect((await screen.findByRole('status')).textContent).toBe('Invitation sent to eva@x.com.')
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ email: 'eva@x.com', language: 'en', plan: 'beta' })
  })

  it('points to resend when the email has one pending', async () => {
    renderTab('invitations')

    await userEvent.type(await screen.findByLabelText('Email'), 'ana@x.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/ana@x\.com already has a pending invitation/)
    await userEvent.click(within(alert).getByRole('button', { name: 'Resend' }))
    await waitFor(() => expect(calls.some((call) => call.path === '/admin/invitations/1/resend')).toBe(true))
  })

  it('offers lifting the Suspension of an email whose Account is suspended', async () => {
    renderTab('invitations')

    await userEvent.type(await screen.findByLabelText('Email'), 'old@x.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/old@x\.com already has an account, but it is suspended/)
    await userEvent.click(within(alert).getByRole('button', { name: 'Lift suspension' }))

    expect((await screen.findByRole('status')).textContent).toBe('Suspension lifted: old@x.com can sign in again.')
  })

  it('resends and cancels, each after a confirmation', async () => {
    renderTab('invitations')
    const [, ana] = await screen.findAllByRole('row')

    await userEvent.click(within(ana).getByRole('button', { name: 'Cancel invitation' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('The link sent to ana@x.com will stop working.')).toBeTruthy()
    expect(calls.some((call) => call.path.endsWith('/cancel'))).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel invitation' }))
    await waitFor(() => expect(calls.some((call) => call.path === '/admin/invitations/1/cancel')).toBe(true))

    await userEvent.click(within(ana).getByRole('button', { name: 'Resend' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Resend' }))
    await waitFor(() => expect(calls.some((call) => call.path === '/admin/invitations/1/resend')).toBe(true))
  })
})

describe('the Accounts tab', () => {
  let calls: ApiCall[]

  const accountsAnswers = () => ({
      'GET /admin/totals': () => Response.json(totals),
      'GET /admin/accounts': (call: ApiCall) => {
        const query = new URLSearchParams(call.search)
        const search = query.get('search')
        const plan = query.get('plan')
        const accounts = [
          account('ana', 'ana@x.com', {
            counts: { ...counts, libraryHands: 320, notes: 4 },
            plan: 'beta',
            planChange: { at: '2026-11-07T10:00:00Z', how: 'invitation', administrator },
          }),
          account('bea', 'bea@x.com', {
            suspension: { at: '2026-11-03T10:00:00Z', by: administrator },
            signInMethods: ['google', 'password'],
            planChange: { at: '2026-11-16T10:00:00Z', how: 'administrator', administrator },
          }),
          account('admin', 'javier@example.com', { administrator: true }),
        ]
          .filter((each) => !search || each.email.includes(search))
          .filter((each) => !plan || each.plan === plan)
        return Response.json({
          total: accounts.length,
          page: 1,
          pageSize: 50,
          accounts,
          plans: { beta: { libraryHands: 20_000 }, pro: { libraryHands: 10_000_000 } },
        })
      },
      'PUT /admin/accounts/ana/plan': () => new Response(null, { status: 204 }),
      'POST /admin/accounts/ana/suspension': () => new Response(null, { status: 204 }),
      'DELETE /admin/accounts/bea/suspension': () => new Response(null, { status: 204 }),
  })

  beforeEach(() => {
    calls = fakeApi(accountsAnswers())
  })

  it('shows the totals and each Account with its statistics', async () => {
    renderTab('accounts')

    expect(await screen.findByText('3,456')).toBeTruthy()
    expect(screen.getByText('Active · 7 days').nextSibling?.textContent).toBe('5')
    const [, ana, bea] = screen.getAllByRole('row')
    expect(ana.textContent).toMatch(/ana@x\.com.*320/)
    expect(bea.textContent).toMatch(/Google · Password/)
    expect(within(bea).getByText('Suspended')).toBeTruthy()
  })

  it('shows each Account\'s Plan after its name, with its latest change beside it', async () => {
    renderTab('accounts')
    const [header, ana, bea, admin] = await screen.findAllByRole('row')

    expect(within(header).getAllByRole('columnheader').map((each) => each.textContent).slice(1, 3)).toEqual([
      'Name',
      'Plan',
    ])
    const planOf = (row: HTMLElement) => within(row).getAllByRole('cell')[2].textContent
    expect(planOf(ana)).toBe('BetaInvitation · Nov 7, 2026')
    expect(planOf(bea)).toBe('ProJavier · Nov 16, 2026')
    expect(planOf(admin)).toBe('ProInitial')
  })

  it('filters by Plan beside the search', async () => {
    renderTab('accounts')
    await screen.findAllByRole('row')

    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Plan' })).getByRole('radio', { name: 'Beta' }))

    await waitFor(() => expect(calls.at(-1)?.search).toContain('plan=beta'))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
    await userEvent.click(screen.getByRole('radio', { name: 'All plans' }))
    await waitFor(() => expect(calls.at(-1)?.search).not.toContain('plan='))
  })

  it('offers changing the Plan first, on every Account, the Administrators\' and one\'s own included', async () => {
    renderTab('accounts')
    const [, ana, bea, admin] = await screen.findAllByRole('row')

    for (const row of [ana, bea, admin]) {
      const actions = within(row).getAllByRole('button')
      expect(actions[0].textContent).toBe('Change plan')
    }
    expect(within(admin).getAllByRole('button').map((each) => each.textContent)).toEqual(['Change plan', 'Open ticket'])
  })

  it('offers opening a Ticket last on every Account, locked on a Suspended one', async () => {
    renderTab('accounts')
    const [, ana, bea] = await screen.findAllByRole('row')

    expect(within(ana).getAllByRole('button').at(-1)?.textContent).toBe('Open ticket')
    const locked = within(bea).getAllByRole('button').at(-1)
    expect(locked?.getAttribute('aria-label')).toBe('Open ticket. This account is suspended')
    await userEvent.click(locked!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a Ticket with an Account from a subject and a message, and lands on it in Support', async () => {
    window.history.replaceState(null, '', '/admin/accounts')
    calls = fakeApi({
      ...accountsAnswers(),
      'POST /admin/support/tickets': () => Response.json({ id: 'ticket-1' }, { status: 201 }),
    })
    renderTab('accounts')
    const [, ana] = await screen.findAllByRole('row')

    await userEvent.click(within(ana).getByRole('button', { name: 'Open ticket' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading').textContent).toBe('Open a ticket with ana')
    expect(dialog.textContent).toContain('ana@x.com. They will see it in their Support, signed Runout, and get an email.')
    const send = within(dialog).getByRole('button', { name: /^Open ticket/ })
    expect(send.getAttribute('aria-label')).toBe('Open ticket. Write a subject')
    await userEvent.type(within(dialog).getByLabelText('Subject'), 'Your import')
    expect(send.getAttribute('aria-label')).toBe('Open ticket. Write a message')
    await userEvent.type(within(dialog).getByLabelText('Message'), 'We are looking into it.')
    expect(dialog.textContent).toContain('23 / 4,000')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Open ticket' }))

    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST')).toMatchObject({
        path: '/admin/support/tickets',
        body: { accountId: 'ana', subject: 'Your import', message: 'We are looking into it.' },
      }),
    )
    await waitFor(() => expect(window.location.pathname).toBe('/admin/support/ticket-1'))
  })

  it('says why opening a Ticket was refused, keeping what was written', async () => {
    fakeApi({
      ...accountsAnswers(),
      'POST /admin/support/tickets': () => refusal(403, 'support-account-suspended'),
    })
    renderTab('accounts')
    const [, ana] = await screen.findAllByRole('row')

    await userEvent.click(within(ana).getByRole('button', { name: 'Open ticket' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Subject'), 'Your import')
    await userEvent.type(within(dialog).getByLabelText('Message'), 'Hello')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Open ticket' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe('This account is suspended.')
    expect((within(dialog).getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Hello')
  })

  it('changes the Plan after a confirmation that says what changes', async () => {
    renderTab('accounts')
    const [, ana] = await screen.findAllByRole('row')

    await userEvent.click(within(ana).getByRole('button', { name: 'Change plan' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading').textContent).toBe('Change the plan of ana?')
    expect(dialog.textContent).toContain('It is on Beta now: its library holds up to 20,000 hands.')
    expect(dialog.textContent).toContain(
      'With Pro, the limit becomes 10 million hands from its next import. Its hands do not change.',
    )
    expect(calls.some((call) => call.method === 'PUT')).toBe(false)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Move to Pro' }))

    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PUT')).toMatchObject({
        path: '/admin/accounts/ana/plan',
        body: { plan: 'pro' },
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('sorts by a column, and the other way on a second press', async () => {
    renderTab('accounts')
    await screen.findAllByRole('row')

    await userEvent.click(screen.getByRole('button', { name: 'Hands' }))
    await waitFor(() => expect(calls.at(-1)?.search).toContain('sort=libraryHands&direction=desc'))
    await userEvent.click(screen.getByRole('button', { name: 'Hands' }))
    await waitFor(() => expect(calls.at(-1)?.search).toContain('sort=libraryHands&direction=asc'))
  })

  it('searches by email or name', async () => {
    renderTab('accounts')
    await screen.findAllByRole('row')

    await userEvent.type(screen.getByLabelText('Search by email or name'), 'bea')

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
    expect(screen.getAllByRole('row')[1].textContent).toMatch(/bea@x\.com/)
  })

  it('suspends and lifts, each after a confirmation', async () => {
    renderTab('accounts')
    const [, ana, bea] = await screen.findAllByRole('row')

    await userEvent.click(within(ana).getByRole('button', { name: 'Suspend' }))
    expect(within(screen.getByRole('dialog')).getByText(/ana will be signed out of Runout on every browser/)).toBeTruthy()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' }))
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'POST' && call.path === '/admin/accounts/ana/suspension')).toBe(true),
    )

    await userEvent.click(within(bea).getByRole('button', { name: 'Lift suspension' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lift suspension' }))
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'DELETE' && call.path === '/admin/accounts/bea/suspension')).toBe(true),
    )
  })

  it('starts an Impersonation after a confirmation, and lands on that Account\'s Home', async () => {
    window.history.replaceState(null, '', '/admin/accounts')
    renderTab('accounts')
    const [, ana] = await screen.findAllByRole('row')

    await userEvent.click(within(ana).getByRole('button', { name: 'Impersonate' }))
    expect(session.impersonate).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Impersonate' }))

    await waitFor(() => expect(session.impersonate).toHaveBeenCalledWith('ana'))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })
})

describe('the Rooms tab', () => {
  let calls: ApiCall[]

  beforeEach(() => {
    let juevesState = 'live'
    const room = (code: string, name: string, status: string, state = 'free-review') => ({
      code,
      name,
      status,
      state,
      master: administrator,
      participants: 3,
      queueLength: 12,
      createdAt: '2026-11-01T10:00:00Z',
      lastActivityAt: '2026-11-01T12:00:00Z',
      closedAt: status === 'closed' ? '2026-11-01T13:00:00Z' : null,
    })
    calls = fakeApi({
      'GET /admin/rooms': (call) => {
        const status = new URLSearchParams(call.search).get('status')
        const rooms = [
          room('RNT4K9PX', 'Martes NL50', 'open'),
          room('EFGH6789', 'Jueves', 'open', juevesState),
          room('ABCD2345', 'Viernes', 'closed'),
        ].filter(
          (each) => status === 'all' || each.status === status,
        )
        return Response.json({ total: rooms.length, page: 1, pageSize: 50, rooms })
      },
      'POST /admin/rooms/RNT4K9PX/close': () => new Response(null, { status: 204 }),
      'POST /admin/rooms/EFGH6789/end-live': () => {
        juevesState = 'free-review'
        return new Response(null, { status: 204 })
      },
    })
  })

  it('lists the open Rooms, the stalest first, and every Room on request', async () => {
    renderTab('rooms')

    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(rows[1].textContent).toMatch(/Martes NL50.*RNT4-K9PX.*Javier.*Open.*3.*12/)
    expect(calls[0].search).toContain('status=open')
    expect(calls[0].search).toContain('sort=lastActivityAt&direction=asc')

    await userEvent.click(screen.getByRole('radio', { name: 'All' }))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4))
    expect(within(screen.getAllByRole('row')[3]).queryByRole('button', { name: 'Close room' })).toBeNull()
  })

  it('closes an open Room after a confirmation', async () => {
    renderTab('rooms')
    const [, martes] = await screen.findAllByRole('row')

    await userEvent.click(within(martes).getByRole('button', { name: 'Close room' }))
    expect(within(screen.getByRole('dialog')).getByText(/“Martes NL50” will close for everyone/)).toBeTruthy()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close room' }))

    await waitFor(() => expect(calls.some((call) => call.path === '/admin/rooms/RNT4K9PX/close')).toBe(true))
  })

  it('ends Live in a Live Room after a confirmation, and only there', async () => {
    renderTab('rooms')
    const [, martes, jueves] = await screen.findAllByRole('row')
    expect(within(martes).queryByRole('button', { name: 'End live' })).toBeNull()
    expect(within(jueves).getByText('Live')).toBeTruthy()

    await userEvent.click(within(jueves).getByRole('button', { name: 'End live' }))
    expect(within(screen.getByRole('dialog')).getByText(/“Jueves” goes back to free review/)).toBeTruthy()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End live' }))

    await waitFor(() => expect(within(screen.getAllByRole('row')[2]).getByText('Free review')).toBeTruthy())
    expect(calls.some((call) => call.path === '/admin/rooms/EFGH6789/end-live')).toBe(true)
    expect(within(screen.getAllByRole('row')[2]).queryByRole('button', { name: 'End live' })).toBeNull()
  })
})

describe('the Imports tab', () => {
  let calls: ApiCall[]
  let firstStatus: string
  let thirdStatus: string

  const bulkImport = (id: string, email: string, file: string, status: string, extra: object = {}) => ({
    id,
    account: { id: `account-${id}`, displayName: null, email },
    status,
    stalled: false,
    files: [{ name: file, size: 1000 }],
    total: 1_240_000,
    processed: 412_000,
    imported: 400_000,
    duplicates: 12_000,
    notImported: {},
    reason: null,
    failureCode: null,
    retryable: false,
    createdAt: '2026-11-02T09:12:00Z',
    lastActivityAt: '2026-11-02T10:00:00Z',
    finishedAt: null,
    ...extra,
  })

  beforeEach(() => {
    firstStatus = 'running'
    thirdStatus = 'failed'
    calls = fakeApi({
      'GET /admin/bulk-imports': (call) => {
        const status = new URLSearchParams(call.search).get('status')
        const imports = [
          bulkImport('1', 'jugador3@example.com', 'pt4-2019-2026.zip', firstStatus),
          bulkImport('2', 'jugador7@example.com', 'hm3-2024.zip', 'running', { stalled: true }),
          bulkImport('3', 'jugador2@example.com', 'sesiones-2023.zip', thirdStatus, {
            ...(thirdStatus === 'failed' && { failureCode: '53100', retryable: true }),
            finishedAt: thirdStatus === 'failed' ? '2026-11-02T11:00:00Z' : null,
          }),
          bulkImport('4', 'jugador5@example.com', 'tracker-completo.zip', 'paused'),
          bulkImport('6', 'jugador4@example.com', 'antiguo.zip', 'failed', {
            failureCode: 'ECONNRESET',
            finishedAt: '2026-10-20T11:00:00Z',
          }),
          bulkImport('5', 'jugador1@example.com', 'pt4-export.zip', 'completed', {
            total: 320_156,
            processed: 320_156,
            imported: 318_204,
            duplicates: 1_910,
            notImported: { 'unrecognised-format': 42, 'too-many-seats': 2 },
            finishedAt: '2026-11-02T12:00:00Z',
          }),
        ].filter((each) => status !== 'failed' || each.status === 'failed')
        return Response.json({
          total: imports.length,
          page: 1,
          pageSize: 50,
          imports,
          storage: { used: 412 * MB, threshold: 800 * MB },
        })
      },
      'POST /admin/bulk-imports/1/cancel': () => {
        firstStatus = 'cancelled'
        return new Response(null, { status: 204 })
      },
      'POST /admin/bulk-imports/3/retry': () => {
        thirdStatus = 'running'
        return new Response(null, { status: 204 })
      },
    })
  })

  it('has its tab beside Invitations, Accounts and Rooms', async () => {
    renderTab('imports')

    const nav = screen.getByRole('navigation', { name: 'Administration sections' })
    expect(within(nav).getAllByRole('link').map((tab) => [tab.textContent, tab.getAttribute('href')])).toEqual([
      ['Invitations', '/admin/invitations'],
      ['Accounts', '/admin/accounts'],
      ['Rooms', '/admin/rooms'],
      ['Imports', '/admin/imports'],
      ['Support', '/admin/support'],
    ])
    expect(within(nav).getByRole('link', { name: 'Imports' }).getAttribute('aria-current')).toBe('page')
    await screen.findAllByRole('row')
  })

  it('lists every Account’s imports with Account and files, status, Hands, start, last activity and reason', async () => {
    renderTab('imports')

    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(7)
    expect(rows[0].textContent).toMatch(/Account and file.*Status.*Hands.*Started.*Last activity.*Reason/)
    expect(rows[1].textContent).toMatch(/jugador3@example\.com.*pt4-2019-2026\.zip.*In progress.*412,000 of 1,240,000/)
    expect(rows[2].textContent).toMatch(/jugador7@example\.com.*Stalled.*No progress since/)
    expect(rows[3].textContent).toMatch(/Failed.*53100 after 3 attempts/)
    expect(rows[4].textContent).toMatch(/Paused.*Storage at its limit/)
    expect(rows[6].textContent).toMatch(/Completed.*318,204 hands.*1,910 duplicates · 42 not recognised · More than nine seats: 2/)
    expect(calls[0].search).toContain('status=all')
  })

  it('shows the database size against the threshold at which imports pause', async () => {
    renderTab('imports')

    const gauge = await screen.findByRole('meter', { name: 'Database' })
    expect(gauge.getAttribute('aria-valuenow')).toBe(String(412 * MB))
    expect(gauge.getAttribute('aria-valuemax')).toBe(String(800 * MB))
    expect(screen.getByText('412 MB of 800 MB')).toBeTruthy()
  })

  it('filters by status', async () => {
    renderTab('imports')
    await screen.findAllByRole('row')

    for (const name of ['All', 'In progress', 'Failed', 'Stalled']) {
      expect(screen.getByRole('radio', { name })).toBeTruthy()
    }
    await userEvent.click(screen.getByRole('radio', { name: 'Failed' }))

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3))
    expect(calls.at(-1)?.search).toContain('status=failed')
  })

  it('cancels an unfinished import after a confirmation, and offers it on no ended one', async () => {
    renderTab('imports')
    const rows = await screen.findAllByRole('row')
    expect(within(rows[3]).queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(within(rows[6]).queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(within(rows[2]).getByRole('button', { name: 'Cancel' })).toBeTruthy()

    await userEvent.click(within(rows[1]).getByRole('button', { name: 'Cancel' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/jugador3@example\.com/)).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel import' }))

    await waitFor(() => expect(within(screen.getAllByRole('row')[1]).getByText('Cancelled')).toBeTruthy())
    expect(calls.some((call) => call.path === '/admin/bulk-imports/1/cancel')).toBe(true)
    expect(within(screen.getAllByRole('row')[1]).queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('retries a failed import whose files are still kept, and offers it on no other', async () => {
    renderTab('imports')
    const rows = await screen.findAllByRole('row')
    for (const row of [rows[1], rows[2], rows[4], rows[6]]) {
      expect(within(row).queryByRole('button', { name: 'Retry' })).toBeNull()
    }
    // Failed over 7 days ago: its files are gone.
    expect(rows[5].textContent).toMatch(/Failed.*ECONNRESET after 3 attempts/)
    expect(within(rows[5]).queryByRole('button', { name: 'Retry' })).toBeNull()

    await userEvent.click(within(rows[3]).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(within(screen.getAllByRole('row')[3]).getByText('In progress')).toBeTruthy())
    expect(calls.some((call) => call.path === '/admin/bulk-imports/3/retry' && call.method === 'POST')).toBe(true)
    expect(within(screen.getAllByRole('row')[3]).queryByRole('button', { name: 'Retry' })).toBeNull()
  })
})
