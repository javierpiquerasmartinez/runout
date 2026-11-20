import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { Routes } from '../routes/Routes'
import { SUPPORT_POLL_MS, type PanelTicket, type PanelTicketSummary } from '../support/support'
import { fakeApi } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const me = { id: 'me', displayName: 'Javier', email: 'javier@example.com' }
const tester = { id: 'tb', displayName: 'Tester B', email: 'tester-b@example.com' }
const ana = { id: 'ana', displayName: 'Ana', email: 'ana@example.com' }

function renderAt(path: string) {
  window.history.replaceState(null, '', path)
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={fakeSession({ administrator: true })}>
        <Routes />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

function summary(id: string, subject: string, extra: Partial<PanelTicketSummary> = {}): PanelTicketSummary {
  return {
    id,
    account: ana,
    subject,
    status: 'open',
    waitingFor: 'administrators',
    createdAt: '2026-11-18T10:02:00.000Z',
    openedBy: null,
    lastMessage: { from: 'account', writer: ana, writtenAt: '2026-11-18T10:02:00.000Z' },
    ...extra,
  }
}

function ticket(extra: Partial<PanelTicket> = {}): PanelTicket {
  return {
    id: 't1',
    account: ana,
    subject: 'My 2023 import stopped halfway',
    status: 'open',
    waitingFor: 'administrators',
    createdAt: '2026-11-18T10:02:00.000Z',
    openedBy: null,
    messages: [
      { id: 'm1', from: 'account', writer: ana, text: 'It stopped halfway.', writtenAt: '2026-11-18T10:02:00.000Z' },
      { id: 'm2', from: 'administrator', writer: tester, text: 'Press Retry.', writtenAt: '2026-11-18T12:15:00.000Z' },
      { id: 'm3', from: 'account', writer: ana, text: 'It failed again.', writtenAt: '2026-11-18T12:40:00.000Z' },
    ],
    ...extra,
  }
}

describe('The panel · Support tab', () => {
  it('lists every Ticket with its Account, marking those waiting for an answer', async () => {
    fakeApi({
      'GET /admin/support/tickets': () =>
        Response.json({
          total: 2,
          page: 1,
          pageSize: 50,
          waiting: 1,
          tickets: [
            summary('t1', 'Winamax hands miss the final pot'),
            summary('t2', 'Can I change my email?', {
              waitingFor: 'account',
              lastMessage: { from: 'administrator', writer: tester, writtenAt: '2026-11-18T12:15:00.000Z' },
            }),
          ],
        }),
    })

    renderAt('/admin/support')

    expect((await screen.findByRole('link', { name: 'Support' })).getAttribute('aria-current')).toBe('page')
    expect(await screen.findByText('Waiting for an answer: 1')).toBeTruthy()
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('ana@example.com')).toBeTruthy()
    expect(within(rows[0]).getByRole('link', { name: 'Winamax hands miss the final pot' }).getAttribute('href')).toBe('/admin/support/t1')
    expect(within(rows[0]).getByText('Waiting for an answer')).toBeTruthy()
    expect(within(rows[1]).queryByText('Waiting for an answer')).toBeNull()
    expect(within(rows[1]).getByText('Tester B')).toBeTruthy()
  })

  it('opens a thread showing which Administrator wrote each message, and writes in it', async () => {
    const answered = ticket({
      waitingFor: 'account',
      messages: [...ticket().messages, { id: 'm4', from: 'administrator', writer: me, text: 'What time?', writtenAt: '2026-11-19T09:30:00.000Z' }],
    })
    const calls = fakeApi({
      'GET /admin/support/tickets/t1': () => Response.json(ticket()),
      'POST /admin/support/tickets/t1/messages': () => Response.json(answered, { status: 201 }),
    })

    renderAt('/admin/support/t1')

    expect(await screen.findByRole('heading', { name: 'My 2023 import stopped halfway' })).toBeTruthy()
    const articles = screen.getAllByRole('article')
    expect(articles.map((article) => within(article).getByRole('heading').textContent)).toEqual(['Ana', 'Tester B', 'Ana'])
    expect(within(articles[1]).getByText('as Runout')).toBeTruthy()
    expect(screen.getByText('Waiting for an answer')).toBeTruthy()
    expect(screen.getByText('Ana will see it signed Runout.')).toBeTruthy()

    await userEvent.type(screen.getByLabelText('Reply'), 'What time?')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4))
    expect(within(screen.getAllByRole('article')[3]).getByText('as Runout · you')).toBeTruthy()
    expect(screen.getByText('Waiting for the account')).toBeTruthy()
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ text: 'What time?' })
  })

  it('shows a new message in an open thread within a short while', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let current = ticket()
    fakeApi({ 'GET /admin/support/tickets/t1': () => Response.json(current) })
    renderAt('/admin/support/t1')
    expect(await screen.findAllByRole('article')).toHaveLength(3)

    current = ticket({
      messages: [...current.messages, { id: 'm4', from: 'account', writer: ana, text: 'Any news?', writtenAt: '2026-11-19T09:30:00.000Z' }],
    })
    await act(() => vi.advanceTimersByTimeAsync(SUPPORT_POLL_MS))

    expect(await screen.findByText('Any news?')).toBeTruthy()
  })
})
