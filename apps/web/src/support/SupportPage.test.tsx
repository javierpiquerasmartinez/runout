import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext, type SessionContextValue } from '../identity/context'
import { Routes } from '../routes/Routes'
import { fakeApi, refusal } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'
import { SUPPORT_POLL_MS, type AccountTicket, type AccountTicketSummary } from './support'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

function renderAt(path: string, session: SessionContextValue = fakeSession()) {
  window.history.replaceState(null, '', path)
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <Routes />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

function summary(id: string, subject: string, extra: Partial<AccountTicketSummary> = {}): AccountTicketSummary {
  return {
    id,
    subject,
    status: 'open',
    createdAt: '2026-11-18T10:02:00.000Z',
    lastMessage: { from: 'account', writtenAt: '2026-11-18T10:02:00.000Z' },
    unread: false,
    ...extra,
  }
}

function ticket(extra: Partial<AccountTicket> = {}): AccountTicket {
  return {
    id: 't1',
    subject: 'A PokerStars hand has the wrong hero',
    status: 'open',
    openedBy: 'account',
    createdAt: '2026-11-18T10:02:00.000Z',
    messages: [{ id: 'm1', from: 'account', text: 'The hero is another player.', writtenAt: '2026-11-18T10:02:00.000Z', unread: false }],
    ...extra,
  }
}

const impersonating = fakeSession({
  impersonation: { administrator: { displayName: 'Admin', email: 'admin@x.com' }, endsAt: '2099-01-01T00:00:00Z' },
})

describe('Support · the list of Tickets', () => {
  it('lists the Account’s Tickets with their subject, status and who wrote last', async () => {
    fakeApi({
      'GET /support/tickets': () =>
        Response.json({
          tickets: [
            summary('t1', 'My 2023 import stopped halfway', { lastMessage: { from: 'runout', writtenAt: '2026-11-19T09:30:00.000Z' } }),
            summary('t2', 'Can I export my ranges?', { status: 'closed' }),
          ],
        }),
    })

    renderAt('/support')

    const rows = within(await screen.findByRole('table')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('link', { name: 'My 2023 import stopped halfway' }).getAttribute('href')).toBe('/support/t1')
    expect(within(rows[0]).getByText('Open')).toBeTruthy()
    expect(within(rows[0]).getByText('Runout')).toBeTruthy()
    expect(within(rows[1]).getByText('Closed')).toBeTruthy()
    expect(within(rows[1]).getByText('You')).toBeTruthy()
  })

  it('says so when there are none', async () => {
    fakeApi({ 'GET /support/tickets': () => Response.json({ tickets: [] }) })

    renderAt('/support')

    expect(await screen.findByText('You haven’t opened any tickets yet.')).toBeTruthy()
  })
})

describe('Support · unread answers', () => {
  it('marks the Tickets with an answer unread', async () => {
    fakeApi({
      'GET /support/tickets': () =>
        Response.json({
          tickets: [
            summary('t1', 'My 2023 import stopped halfway', { unread: true, lastMessage: { from: 'runout', writtenAt: '2026-11-19T09:30:00.000Z' } }),
            summary('t2', 'Can I export my ranges?'),
          ],
        }),
    })

    renderAt('/support')

    const [unread, read] = within(await screen.findByRole('table')).getAllByRole('row').slice(1)
    expect(within(unread).getByRole('img', { name: 'Unread answer' })).toBeTruthy()
    expect(within(unread).getByText('New answer')).toBeTruthy()
    expect(within(read).queryByRole('img', { name: 'Unread answer' })).toBeNull()
    expect(within(read).queryByText('New answer')).toBeNull()
  })

  it('reads the list again every so often, so new answers turn up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let unread = false
    fakeApi({ 'GET /support/tickets': () => Response.json({ tickets: [summary('t1', 'My 2023 import stopped halfway', { unread })] }) })
    renderAt('/support')
    expect(await screen.findByRole('table')).toBeTruthy()
    expect(screen.queryByText('New answer')).toBeNull()

    unread = true
    await act(() => vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS))

    expect(await screen.findByText('New answer')).toBeTruthy()
  })

  it('sets the unread messages apart in the thread, and keeps them so while it is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const thread = (unread: boolean) =>
      ticket({
        messages: [
          ...ticket().messages,
          { id: 'm2', from: 'runout', text: 'What time was it?', writtenAt: '2026-11-18T12:15:00.000Z', unread },
        ],
      })
    // The first read is the Account's reading it: the next says it was read.
    let read = thread(true)
    fakeApi({
      'GET /support/tickets/t1': () => {
        const answer = Response.json(read)
        read = thread(false)
        return answer
      },
    })
    renderAt('/support/t1')

    const divider = await screen.findByRole('separator', { name: 'New messages' })
    const articles = screen.getAllByRole('article')
    expect(articles[0].compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(divider.compareDocumentPosition(articles[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(() => vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS))
    expect(screen.getByRole('separator', { name: 'New messages' })).toBeTruthy()
  })

  it('draws no divider when nothing was unread', async () => {
    fakeApi({ 'GET /support/tickets/t1': () => Response.json(ticket()) })

    renderAt('/support/t1')

    expect(await screen.findAllByRole('article')).toHaveLength(1)
    expect(screen.queryByRole('separator', { name: 'New messages' })).toBeNull()
  })
})

describe('Support · opening a Ticket', () => {
  it('needs a subject and a message, then opens the Ticket and goes to it', async () => {
    const calls = fakeApi({
      'GET /support/tickets': () => Response.json({ tickets: [] }),
      'POST /support/tickets': () => Response.json(ticket(), { status: 201 }),
      'GET /support/tickets/t1': () => Response.json(ticket()),
    })
    renderAt('/support')

    await userEvent.click(await screen.findByRole('button', { name: 'New ticket' }))
    const dialog = screen.getByRole('dialog', { name: 'New ticket' })
    const send = within(dialog).getByRole('button', { name: /^Send/ })
    expect(send.getAttribute('aria-disabled')).toBe('true')
    await userEvent.type(within(dialog).getByLabelText('Subject'), 'A PokerStars hand has the wrong hero')
    expect(send.getAttribute('aria-disabled')).toBe('true')
    await userEvent.type(within(dialog).getByLabelText('Message'), 'The hero is another player.')
    expect(within(dialog).getByText('27 / 4,000')).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('heading', { name: 'A PokerStars hand has the wrong hero' })).toBeTruthy()
    expect(window.location.pathname).toBe('/support/t1')
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      subject: 'A PokerStars hand has the wrong hero',
      message: 'The hero is another player.',
    })
  })

  it('says why the server refused it, keeping what was typed', async () => {
    fakeApi({
      'GET /support/tickets': () => Response.json({ tickets: [] }),
      'POST /support/tickets': () => refusal(400, 'invalid-support-message'),
    })
    renderAt('/support')

    await userEvent.click(await screen.findByRole('button', { name: 'New ticket' }))
    const dialog = screen.getByRole('dialog', { name: 'New ticket' })
    await userEvent.type(within(dialog).getByLabelText('Subject'), 'Hello')
    await userEvent.type(within(dialog).getByLabelText('Message'), 'Hi')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }))

    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect((within(dialog).getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Hi')
  })
})

describe('Support · a Ticket’s thread', () => {
  it('shows the thread in order, the Administrators signed Runout, and writes in it', async () => {
    const answered = ticket({
      messages: [
        ...ticket().messages,
        { id: 'm2', from: 'runout', text: 'What time was it?', writtenAt: '2026-11-18T12:15:00.000Z', unread: false },
      ],
    })
    const written = ticket({
      messages: [...answered.messages, { id: 'm3', from: 'account', text: 'At 22:41.', writtenAt: '2026-11-18T12:40:00.000Z', unread: false }],
    })
    const calls = fakeApi({
      'GET /support/tickets/t1': () => Response.json(answered),
      'POST /support/tickets/t1/messages': () => Response.json(written, { status: 201 }),
    })
    renderAt('/support/t1')

    const articles = await screen.findAllByRole('article')
    expect(articles.map((article) => within(article).getByRole('heading').textContent)).toEqual(['You', 'Runout'])
    expect(within(articles[1]).getByText('What time was it?')).toBeTruthy()
    expect(screen.getByText('Opened by you on Nov 18, 2026')).toBeTruthy()

    await userEvent.type(screen.getByLabelText('Reply'), 'At 22:41.')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
    expect((screen.getByLabelText('Reply') as HTMLTextAreaElement).value).toBe('')
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ text: 'At 22:41.' })
  })

  it('shows a new message within a short while, with no reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let current = ticket()
    fakeApi({ 'GET /support/tickets/t1': () => Response.json(current) })
    renderAt('/support/t1')
    expect(await screen.findAllByRole('article')).toHaveLength(1)

    current = ticket({
      messages: [...current.messages, { id: 'm2', from: 'runout', text: 'Looking into it.', writtenAt: '2026-11-18T12:15:00.000Z', unread: false }],
    })
    await act(() => vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS))

    expect(await screen.findByText('Looking into it.')).toBeTruthy()
  })

  it('says so when the Ticket isn’t there', async () => {
    fakeApi({ 'GET /support/tickets/t9': () => refusal(404, 'support-ticket-not-found') })

    renderAt('/support/t9')

    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})

describe('Support · closing and reopening', () => {
  it('closes an Open Ticket, and then says writing in it opens it again', async () => {
    const calls = fakeApi({
      'GET /support/tickets/t1': () => Response.json(ticket()),
      'POST /support/tickets/t1/close': () => Response.json(ticket({ status: 'closed' })),
    })
    renderAt('/support/t1')
    expect(await screen.findByText('Close it once it’s settled. If you write in it again, it opens again.')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Close ticket' }))

    expect(await screen.findByText('It’s closed. If you write in it again, it opens again.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close ticket' })).toBeNull()
    expect(screen.getAllByText('Closed').length).toBeGreaterThan(0)
    expect(calls.some((call) => call.method === 'POST' && call.path === '/support/tickets/t1/close')).toBe(true)
  })

  it('opens a Closed Ticket again by writing in it', async () => {
    fakeApi({
      'GET /support/tickets/t1': () => Response.json(ticket({ status: 'closed' })),
      'POST /support/tickets/t1/messages': () =>
        Response.json(
          ticket({
            messages: [...ticket().messages, { id: 'm2', from: 'account', text: 'It happens again.', writtenAt: '2026-11-19T09:30:00.000Z', unread: false }],
          }),
          { status: 201 },
        ),
    })
    renderAt('/support/t1')
    await screen.findByText('It’s closed. If you write in it again, it opens again.')

    await userEvent.type(screen.getByLabelText('Reply'), 'It happens again.')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('button', { name: 'Close ticket' })).toBeTruthy()
    expect(screen.queryByText('Closed')).toBeNull()
  })
})

describe('Support · while impersonating', () => {
  it('is locked, and asks nothing of the server', async () => {
    const calls = fakeApi({})

    renderAt('/support', impersonating)

    const newTicket = await screen.findByRole('button', { name: /New ticket/ })
    expect(newTicket.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText("Support isn't available while impersonating someone")).toBeTruthy()
    expect(calls.some((call) => call.path.startsWith('/support'))).toBe(false)
  })

  it('locks a Ticket’s page too', async () => {
    const calls = fakeApi({})

    renderAt('/support/t1', impersonating)

    expect(await screen.findByText("Support isn't available while impersonating someone")).toBeTruthy()
    expect(calls.some((call) => call.path.startsWith('/support'))).toBe(false)
  })
})
