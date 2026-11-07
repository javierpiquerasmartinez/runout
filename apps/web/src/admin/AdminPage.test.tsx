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
      invitation('4', 'dani@x.com', 'cancelled'),
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
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ email: 'eva@x.com', language: 'en' })
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

  beforeEach(() => {
    calls = fakeApi({
      'GET /admin/totals': () => Response.json(totals),
      'GET /admin/accounts': (call) => {
        const search = new URLSearchParams(call.search).get('search')
        const accounts = [
          account('ana', 'ana@x.com', { counts: { ...counts, libraryHands: 320, notes: 4 } }),
          account('bea', 'bea@x.com', {
            suspension: { at: '2026-11-03T10:00:00Z', by: administrator },
            signInMethods: ['google', 'password'],
          }),
        ].filter((each) => !search || each.email.includes(search))
        return Response.json({ total: accounts.length, page: 1, pageSize: 50, accounts })
      },
      'POST /admin/accounts/ana/suspension': () => new Response(null, { status: 204 }),
      'DELETE /admin/accounts/bea/suspension': () => new Response(null, { status: 204 }),
    })
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

  it('starts an Impersonation after a confirmation', async () => {
    renderTab('accounts')
    const [, ana] = await screen.findAllByRole('row')

    await userEvent.click(within(ana).getByRole('button', { name: 'Impersonate' }))
    expect(session.impersonate).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Impersonate' }))

    await waitFor(() => expect(session.impersonate).toHaveBeenCalledWith('ana'))
  })
})

describe('the Rooms tab', () => {
  let calls: ApiCall[]

  beforeEach(() => {
    const room = (code: string, name: string, status: string) => ({
      code,
      name,
      status,
      state: 'free-review',
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
        const rooms = [room('RNT4K9PX', 'Martes NL50', 'open'), room('ABCD2345', 'Viernes', 'closed')].filter(
          (each) => status === 'all' || each.status === status,
        )
        return Response.json({ total: rooms.length, page: 1, pageSize: 50, rooms })
      },
      'POST /admin/rooms/RNT4K9PX/close': () => new Response(null, { status: 204 }),
    })
  })

  it('lists the open Rooms, the stalest first, and every Room on request', async () => {
    renderTab('rooms')

    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(rows[1].textContent).toMatch(/Martes NL50.*RNT4-K9PX.*Javier.*Open.*3.*12/)
    expect(calls[0].search).toContain('status=open')
    expect(calls[0].search).toContain('sort=lastActivityAt&direction=asc')

    await userEvent.click(screen.getByRole('radio', { name: 'All' }))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3))
    expect(within(screen.getAllByRole('row')[2]).queryByRole('button', { name: 'Close room' })).toBeNull()
  })

  it('closes an open Room after a confirmation', async () => {
    renderTab('rooms')
    const [, martes] = await screen.findAllByRole('row')

    await userEvent.click(within(martes).getByRole('button', { name: 'Close room' }))
    expect(within(screen.getByRole('dialog')).getByText(/“Martes NL50” will close for everyone/)).toBeTruthy()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close room' }))

    await waitFor(() => expect(calls.some((call) => call.path === '/admin/rooms/RNT4K9PX/close')).toBe(true))
  })
})
