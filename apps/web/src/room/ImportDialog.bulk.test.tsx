import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { ImportDialog } from './ImportDialog'
import type { ImportDestination, ImportPreview } from './importBatch'
import { fakeSession } from '../test/fakeSession'

const MB = 1024 * 1024
const GB = 1024 * MB

function many(id: string, count: number): ImportPreview {
  const hand = {
    hero: 'Marta88',
    heroNamed: true,
    playedAt: '2026-09-18T12:34:30.000Z',
    stake: { limit: 'no-limit' as const, smallBlind: 5, bigBlind: 10, currency: 'EUR' },
    board: [],
    overview: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river' as const, showdown: true },
  }
  return { id, format: 'pokerstars', tried: ['pokerstars'], hands: Array.from({ length: count }, () => hand), discarded: [] }
}

const previews: Record<string, ImportPreview> = {
  'big.txt': many('p-big', 1240),
  'bigger.txt': many('p-bigger', 761),
}

interface Sent {
  method: string
  url: string
  body: unknown
}

/**
 * The API and the storage the browser uploads to, faked behind `fetch`.
 * `uploaded` holds each file's parts already in storage, by file index;
 * `putting` and `completing` decide when storage and the API answer.
 */
let sent: Sent[]
let uploaded: Record<number, { partNumber: number; etag: string }[]>
let putting: (url: string) => Promise<Response>
let completing: () => Promise<Response>
let started: { name: string; size: number }[] | null

beforeEach(() => {
  sent = []
  uploaded = {}
  started = null
  putting = async (url) => new Response(null, { status: 200, headers: { ETag: `"etag-${url.split('/').slice(-2).join('-')}"` } })
  completing = async () => Response.json({ id: 'b-1', status: 'waiting' }, { status: 201 })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
      sent.push({ method, url, body })
      if (url.startsWith('https://storage.test/')) return putting(url)
      if (url === '/api/library/imports/previews') {
        const file = (init.body as FormData).get('file') as File
        return Response.json(previews[file.name], { status: 201 })
      }
      if (url === '/api/library/bulk-imports' && method === 'POST') {
        started = (body as { files: { name: string; size: number }[] }).files
        return Response.json({ id: 'b-1', status: 'uploading', files: started }, { status: 201 })
      }
      const parts = /^\/api\/library\/bulk-imports\/b-1\/files\/(\d+)\/parts$/.exec(url)
      if (parts && method === 'GET') return Response.json({ parts: uploaded[Number(parts[1])] ?? [] })
      if (parts && method === 'POST') {
        const numbers = (body as { parts: number[] }).parts
        return Response.json(
          { parts: numbers.map((partNumber) => ({ partNumber, url: `https://storage.test/b-1/${parts[1]}/${partNumber}` })) },
          { status: 201 },
        )
      }
      if (url === '/api/library/bulk-imports/b-1/complete') return completing()
      return Response.json({ reason: 'not-found' }, { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderDialog(destination: ImportDestination = { kind: 'library' }) {
  const onClose = vi.fn()
  const onImported = vi.fn()
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={fakeSession()}>
        <ImportDialog destination={destination} onClose={onClose} onImported={onImported} />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return { onClose, onImported }
}

/** A file that says it is `size` bytes long, without holding them. */
function sized(name: string, size: number): File {
  const file = new File(['text'], name, { type: 'text/plain' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

async function choose(...files: File[]) {
  await userEvent.upload(screen.getByLabelText('Choose files'), files)
}

/** Drops files on the dialog, which takes whatever kind of file is dropped. */
function drop(...files: File[]) {
  fireEvent.drop(screen.getByText('Drop your tracker files here'), { dataTransfer: { files } })
}

const puts = () => sent.filter((request) => request.method === 'PUT').map((request) => request.url)

describe('ImportDialog, a large import', () => {
  it('takes a selection over 20 MB to a large import without reading it, and says what will happen', async () => {
    renderDialog()

    await choose(sized('export.txt', 21 * MB), sized('more.zip', 1.25 * GB))

    expect(screen.getByRole('status').textContent).toBe('2 files · 1.3 GB')
    expect(screen.getByText(/There is no preview/)).toBeTruthy()
    expect(screen.getByText(/we will email you/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Upload and import' })).toBeTruthy()
    expect(sent).toEqual([])
  })

  it('offers a large import once the files read hold more than 2,000 Hands', async () => {
    renderDialog()

    await choose(sized('big.txt', 4), sized('bigger.txt', 4))
    expect(await screen.findByText('This import has 2,001 hands: it will be a large import, without a preview')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Continue as a large import' }))
    await userEvent.click(screen.getByRole('button', { name: 'Upload and import' }))

    await screen.findByText('You can close now; we will email you')
    expect(started).toEqual([
      { name: 'big.txt', size: 4 },
      { name: 'bigger.txt', size: 4 },
    ])
    expect(sent.filter((request) => request.url === '/api/library/imports')).toEqual([])
  })

  it('still refuses a file over 20 MB into a Room', async () => {
    renderDialog({ kind: 'room', code: 'ABCD2345', name: 'Martes NL10' })

    await choose(sized('export.txt', 21 * MB))

    expect(await screen.findByText('The file is over 20 MB.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Upload and import' })).toBeNull()
  })

  it('refuses files other than .txt and .zip before uploading', async () => {
    renderDialog()

    drop(sized('export.txt', 21 * MB), sized('notes.pdf', 10))
    await userEvent.click(screen.getByRole('button', { name: 'Only .txt and .zip files can be imported' }))

    expect(sent).toEqual([])
  })

  it('refuses files adding up to more than 2.5 GB before uploading', async () => {
    renderDialog()

    await choose(sized('one.zip', 2 * GB), sized('two.zip', 0.5 * GB + 1))
    await userEvent.click(screen.getByRole('button', { name: 'The files add up to more than 2.5 GB' }))

    expect(sent).toEqual([])
  })

  describe('while uploading', () => {
    let answer: Map<string, () => void>

    beforeEach(() => {
      answer = new Map()
      const ok = putting
      putting = (url) => new Promise((resolve) => answer.set(url, () => resolve(ok(url))))
    })

    async function startUploading() {
      const rendered = renderDialog()
      await choose(sized('export.txt', 21 * MB))
      await userEvent.click(screen.getByRole('button', { name: 'Upload and import' }))
      await waitFor(() => expect(answer.size).toBe(3))
      return rendered
    }

    it('uploads each part straight to storage, showing how far it has got', async () => {
      await startUploading()

      expect(screen.getByRole('status').textContent).toBe('Uploading… 0%')
      answer.get('https://storage.test/b-1/0/1')!()

      await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Uploading… 38%'))
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('38')
    })

    it('says the Importer can close once the upload is marked complete, and only then', async () => {
      let complete!: (response: Response) => void
      completing = () => new Promise((resolve) => (complete = resolve))
      const { onClose } = await startUploading()

      for (const send of answer.values()) send()
      await waitFor(() => expect(sent.at(-1)!.url).toBe('/api/library/bulk-imports/b-1/complete'))
      expect(screen.queryByText('You can close now; we will email you')).toBeNull()
      expect(sent.at(-1)!.body).toEqual({
        files: [
          {
            parts: [
              { partNumber: 1, etag: '"etag-0-1"' },
              { partNumber: 2, etag: '"etag-0-2"' },
              { partNumber: 3, etag: '"etag-0-3"' },
            ],
          },
        ],
      })

      complete(Response.json({ id: 'b-1', status: 'waiting' }, { status: 201 }))
      expect(await screen.findByText('You can close now; we will email you')).toBeTruthy()
      await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
      expect(onClose).toHaveBeenCalled()
    })

    it('cannot be closed, and the browser warns before leaving', async () => {
      const { onClose } = await startUploading()

      await userEvent.click(screen.getByRole('button', { name: /^Close/ }))
      await userEvent.click(screen.getByRole('button', { name: /^Cancel/ }))
      fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

      expect(onClose).not.toHaveBeenCalled()
      expect(leaving().defaultPrevented).toBe(true)
    })

    it('keeps the tabs and each file’s remove button in sight, locked', async () => {
      await startUploading()

      for (const name of ['Upload files', 'Paste plain text']) {
        expect(screen.getByRole('tab', { name: new RegExp(`^${name}`) }).getAttribute('aria-disabled')).toBe('true')
      }
      expect(screen.getByRole('tabpanel')).toBeTruthy()
      const remove = screen.getByRole('button', { name: /^Remove export\.txt/ })
      expect(remove.getAttribute('aria-disabled')).toBe('true')
      await userEvent.click(remove)
      await userEvent.click(screen.getByRole('tab', { name: /^Paste plain text/ }))
      expect(screen.getByText('export.txt')).toBeTruthy()
      expect(screen.getByRole('tab', { name: /^Upload files/ }).getAttribute('aria-selected')).toBe('true')
    })

    it('stops warning once uploaded', async () => {
      await startUploading()

      for (const send of answer.values()) send()
      await screen.findByText('You can close now; we will email you')

      expect(leaving().defaultPrevented).toBe(false)
    })
  })

  it('continues an interrupted upload from the parts already in storage', async () => {
    uploaded = { 0: [{ partNumber: 1, etag: '"kept"' }] }
    renderDialog()

    await choose(sized('export.txt', 21 * MB))
    await userEvent.click(screen.getByRole('button', { name: 'Upload and import' }))
    await screen.findByText('You can close now; we will email you')

    expect(puts()).toEqual(['https://storage.test/b-1/0/2', 'https://storage.test/b-1/0/3'])
    expect(sent.at(-1)!.body).toEqual({
      files: [
        {
          parts: [
            { partNumber: 1, etag: '"kept"' },
            { partNumber: 2, etag: '"etag-0-2"' },
            { partNumber: 3, etag: '"etag-0-3"' },
          ],
        },
      ],
    })
  })

  it('says when the upload failed, and tries again from where it stopped', async () => {
    let failing = true
    const ok = putting
    putting = async (url) => (failing && url.endsWith('/2') ? new Response(null, { status: 500 }) : ok(url))
    renderDialog()

    await choose(sized('export.txt', 21 * MB))
    await userEvent.click(screen.getByRole('button', { name: 'Upload and import' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The upload stopped. Try again to continue where it left off.')

    failing = false
    uploaded = { 0: [{ partNumber: 1, etag: '"etag-0-1"' }, { partNumber: 3, etag: '"etag-0-3"' }] }
    sent = []
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await screen.findByText('You can close now; we will email you')
    expect(puts()).toEqual(['https://storage.test/b-1/0/2'])
  })
})

/** Asks to leave the page, as closing or reloading the tab does. */
function leaving(): Event {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}
