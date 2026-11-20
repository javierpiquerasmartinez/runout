import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import type { Identity } from '../identity/identity'
import { fakeSession } from '../test/fakeSession'
import { ImportDialog } from './ImportDialog'
import type { ImportDestination, ImportPreview } from './importBatch'

const MB = 1024 * 1024

const preview: ImportPreview = {
  id: 'p-session',
  format: 'pokerstars',
  tried: ['pokerstars'],
  hands: [
    {
      hero: 'Marta88',
      heroNamed: true,
      playedAt: '2026-09-18T12:34:30.000Z',
      stake: { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
      board: [],
      overview: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river', showdown: true },
    },
  ],
  discarded: [],
}

interface Sent {
  method: string
  url: string
  body: unknown
}

let sent: Sent[]
let putting: () => Promise<Response>

beforeEach(() => {
  sent = []
  putting = async () => new Response(null, { status: 500 })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
      sent.push({ method, url, body })
      if (url.startsWith('https://storage.test/')) return putting()
      if (url.endsWith('/imports/previews')) return Response.json(preview, { status: 201 })
      if (url.endsWith('/imports')) {
        return Response.json({ reason: 'library-full', hands: 3, held: 9_999_999, limit: 10_000_000, plan: null }, { status: 409 })
      }
      if (url === '/api/library/bulk-imports' && method === 'POST') {
        return Response.json({ id: 'b-1', status: 'uploading', files: (body as { files: unknown[] }).files }, { status: 201 })
      }
      if (url === '/api/library/bulk-imports/b-1/files/0/parts' && method === 'GET') return Response.json({ parts: [] })
      if (url === '/api/library/bulk-imports/b-1/files/0/parts' && method === 'POST') {
        return Response.json({ parts: [{ partNumber: 1, url: 'https://storage.test/b-1/0/1' }] }, { status: 201 })
      }
      if (url === '/api/support/tickets' && method === 'POST') {
        return Response.json({ id: 't-1', subject: '', status: 'open', openedBy: 'account', createdAt: '', messages: [] }, { status: 201 })
      }
      return Response.json({ reason: 'not-found' }, { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.pushState(null, '', '/')
})

const library: ImportDestination = { kind: 'library' }
const room: ImportDestination = { kind: 'room', code: 'ABCD2345', name: 'Martes NL10' }

function renderDialog(destination: ImportDestination, identity: Partial<Identity> = {}) {
  const onClose = vi.fn()
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={fakeSession(identity)}>
        <ImportDialog destination={destination} onClose={onClose} onImported={vi.fn()} />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return { onClose }
}

function sized(name: string, size: number): File {
  const file = new File(['text'], name, { type: 'text/plain' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

async function choose(...files: File[]) {
  await userEvent.upload(screen.getByLabelText('Choose files'), files)
}

const supportRequests = () => sent.filter((request) => request.url.startsWith('/api/support'))

describe('Reporting a failed ordinary import', () => {
  it('opens a Ticket with the refused import written into its first message, and sends it as edited', async () => {
    renderDialog(library)
    await choose(sized('ggpoker-november.txt', 1.2 * MB))
    await userEvent.click(await screen.findByRole('button', { name: 'Add 1 hand to your library' }))
    await screen.findByRole('alert')

    await userEvent.click(screen.getByRole('button', { name: 'Report a problem' }))

    const report = screen.getByRole('dialog', { name: 'Report a problem' })
    expect(within(report).getByText('We wrote the failure into the message. Add what you were doing before sending it.')).toBeTruthy()
    const subject = within(report).getByLabelText('Subject') as HTMLInputElement
    const message = within(report).getByLabelText('Message') as HTMLTextAreaElement
    expect(subject.value).toBe('My hands could not be imported')
    expect(message.value).toBe(
      'I was importing hands into my library and it failed.\n' +
        'Files: ggpoker-november.txt (1.2 MB)\n' +
        'Reason: Your library cannot hold more than 10 million hands.\n\n',
    )
    expect(supportRequests()).toEqual([])

    await userEvent.clear(subject)
    await userEvent.type(subject, 'Library full')
    await userEvent.type(message, 'I was importing November.')
    await userEvent.click(within(report).getByRole('button', { name: 'Send' }))

    expect(supportRequests()).toEqual([
      {
        method: 'POST',
        url: '/api/support/tickets',
        body: {
          subject: 'Library full',
          message:
            'I was importing hands into my library and it failed.\n' +
            'Files: ggpoker-november.txt (1.2 MB)\n' +
            'Reason: Your library cannot hold more than 10 million hands.\n\n' +
            'I was importing November.',
        },
      },
    ])
    expect(window.location.pathname).toBe('/support/t-1')
  })

  it('reports a file that failed, naming the Room it went into', async () => {
    const { onClose } = renderDialog(room)
    await choose(sized('huge.txt', 21 * MB))
    await screen.findByText('The file is over 20 MB.')

    await userEvent.click(screen.getByRole('button', { name: 'Report a problem' }))

    const report = screen.getByRole('dialog', { name: 'Report a problem' })
    expect((within(report).getByLabelText('Message') as HTMLTextAreaElement).value).toBe(
      'I was importing hands into the room “Martes NL10” (ABCD2345) and it failed.\n' +
        'Files: huge.txt (21 MB)\n' +
        'Reason: The file is over 20 MB.\n\n',
    )

    await userEvent.click(within(report).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Report a problem' })).toBeNull()
    expect(screen.getByRole('dialog', { name: /Import hands/ })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(supportRequests()).toEqual([])
  })

  it('reports an upload that stopped', async () => {
    renderDialog(library)
    await choose(sized('export.txt', 21 * MB))
    await userEvent.click(screen.getByRole('button', { name: 'Upload and import' }))
    await screen.findByRole('alert')

    await userEvent.click(screen.getByRole('button', { name: 'Report a problem' }))

    const report = screen.getByRole('dialog', { name: 'Report a problem' })
    expect((within(report).getByLabelText('Message') as HTMLTextAreaElement).value).toBe(
      'I was importing hands into my library and it failed.\n' +
        'Files: export.txt (21 MB)\n' +
        'Reason: The upload stopped. Try again to continue where it left off.\n\n',
    )
  })

  it('is locked while impersonating', async () => {
    renderDialog(room, {
      impersonation: { administrator: { displayName: 'Admin', email: 'admin@x.com' }, endsAt: '2099-01-01T00:00:00Z' },
    })
    await choose(sized('huge.txt', 21 * MB))

    const shortcut = await screen.findByRole('button', { name: "Report a problem. Support isn't available while impersonating someone" })
    await userEvent.click(shortcut)

    expect(screen.queryByRole('dialog', { name: 'Report a problem' })).toBeNull()
  })

  it('is not offered to an anonymous Participant, who has no Support', async () => {
    renderDialog(room, { account: null, room: { code: 'ABCD2345' } })
    await choose(sized('huge.txt', 21 * MB))
    await screen.findByText('The file is over 20 MB.')
    expect(screen.queryByRole('button', { name: /Report a problem/ })).toBeNull()
  })

  it('is not offered to an Administrator, who answers Support rather than writing to it', async () => {
    renderDialog(room, { administrator: true })
    await choose(sized('huge.txt', 21 * MB))
    await screen.findByText('The file is over 20 MB.')
    expect(screen.queryByRole('button', { name: /Report a problem/ })).toBeNull()
  })
})
