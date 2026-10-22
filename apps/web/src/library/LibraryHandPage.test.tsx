import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import splitPot from '../room/fixtures/split-pot.json'
import { fakeSession } from '../test/fakeSession'
import { LibraryHandPage } from './LibraryHandPage'

const note = {
  id: 'n1',
  seq: 1,
  handId: 'split-pot',
  writer: { identityId: 'id-marta', displayName: 'Marta' },
  body: 'Con 62 BB el jam de CO es forzado.',
  writtenAt: '2026-09-18T12:40:00.000Z',
  editedAt: null,
}

let notFound: boolean
/** Every call that changed a Note, as method, path and body. */
let changes: [string, string, unknown][]
let refusal: string | null

beforeEach(() => {
  notFound = false
  refusal = null
  changes = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const path = new URL(url, 'http://localhost').pathname.replace(/^\/api/, '')
      if (notFound) return Response.json({ reason: 'hand-not-found' }, { status: 404 })
      if (method !== 'GET') {
        const body = init.body ? JSON.parse(String(init.body)) : undefined
        changes.push([method, path, body])
        if (refusal) return Response.json({ reason: refusal }, { status: 409 })
        if (method === 'POST' && path.endsWith('/notes'))
          return Response.json({ ...note, id: 'n2', seq: 2, writer: { identityId: 'me', displayName: 'Javier' }, body: body.body }, { status: 201 })
        if (method === 'PATCH') return Response.json({ ...note, body: body.body, editedAt: '2026-09-18T13:00:00.000Z' })
        if (method === 'DELETE') return Response.json({ id: note.id })
        if (path.endsWith('/restore')) return Response.json(note, { status: 201 })
      }
      if (url.endsWith('/notes')) return Response.json({ notes: [note], marked: false })
      return Response.json(splitPot)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderHand(handId = 'split-pot') {
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={fakeSession()}>
        <LibraryHandPage handId={handId} />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

describe('LibraryHandPage', () => {
  it('replays the Hand Action by Action, on its own', async () => {
    renderHand()

    expect(await screen.findByText('Action 0 of 17')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Next action' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next action' }))

    expect(screen.getByText('Action 2 of 17')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Previous action' }))
    expect(screen.getByText('Action 1 of 17')).toBeTruthy()
  })

  it('shows the Hand’s Notes, with who wrote them', async () => {
    renderHand()

    const notes = await screen.findByRole('region', { name: 'Notes' })
    expect(await within(notes).findByText('Con 62 BB el jam de CO es forzado.')).toBeTruthy()
    expect(within(notes).getByText('Marta')).toBeTruthy()
  })

  it('writes a Note on the Hand', async () => {
    renderHand()
    const notes = await screen.findByRole('region', { name: 'Notes' })
    await within(notes).findByText('Marta')

    await userEvent.type(within(notes).getByRole('textbox', { name: 'Add a note about this hand' }), '  El turn es clave. ')
    await userEvent.click(within(notes).getByRole('button', { name: 'Save note' }))

    expect(await within(notes).findByText('El turn es clave.')).toBeTruthy()
    expect(changes).toEqual([['POST', '/library/hands/split-pot/notes', { body: 'El turn es clave.' }]])
    expect((within(notes).getByRole('textbox', { name: 'Add a note about this hand' }) as HTMLTextAreaElement).value).toBe('')
  })

  it('rewrites anyone’s Note in place', async () => {
    renderHand()
    const notes = await screen.findByRole('region', { name: 'Notes' })

    await userEvent.click(await within(notes).findByRole('button', { name: 'Edit Marta’s note' }))
    const field = within(notes).getByRole('textbox', { name: 'Edit Marta’s note' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Jam forzado.')
    await userEvent.click(within(notes).getByRole('button', { name: 'Save' }))

    expect(await within(notes).findByText('Jam forzado.')).toBeTruthy()
    expect(within(notes).getByText(/edited/)).toBeTruthy()
    expect(changes).toEqual([['PATCH', '/library/notes/n1', { body: 'Jam forzado.' }]])
  })

  it('deletes anyone’s Note, and brings it back on undo', async () => {
    renderHand()
    const notes = await screen.findByRole('region', { name: 'Notes' })

    await userEvent.click(await within(notes).findByRole('button', { name: 'Delete Marta’s note' }))

    expect(await within(notes).findByText('Note deleted')).toBeTruthy()
    expect(within(notes).queryByText('Con 62 BB el jam de CO es forzado.')).toBeNull()
    await userEvent.click(within(notes).getByRole('button', { name: 'Undo' }))

    expect(await within(notes).findByText('Con 62 BB el jam de CO es forzado.')).toBeTruthy()
    expect(within(notes).queryByText('Note deleted')).toBeNull()
    expect(changes).toEqual([
      ['DELETE', '/library/notes/n1', undefined],
      ['POST', '/library/notes/n1/restore', undefined],
    ])
  })

  it('says why when a change is refused', async () => {
    renderHand()
    const notes = await screen.findByRole('region', { name: 'Notes' })
    await within(notes).findByText('Marta')
    refusal = 'undo-expired'

    await userEvent.click(within(notes).getByRole('button', { name: 'Delete Marta’s note' }))

    expect(await within(notes).findByRole('alert')).toBeTruthy()
    expect(within(notes).getByText('Con 62 BB el jam de CO es forzado.')).toBeTruthy()
  })

  it('keeps a refused rewrite open, with its wording', async () => {
    renderHand()
    const notes = await screen.findByRole('region', { name: 'Notes' })
    refusal = 'note-not-found'

    await userEvent.click(await within(notes).findByRole('button', { name: 'Edit Marta’s note' }))
    const field = within(notes).getByRole('textbox', { name: 'Edit Marta’s note' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Jam forzado.')
    await userEvent.click(within(notes).getByRole('button', { name: 'Save' }))

    expect(await within(notes).findByText('That note no longer exists.')).toBeTruthy()
    expect((within(notes).getByRole('textbox', { name: 'Edit Marta’s note' }) as HTMLTextAreaElement).value).toBe('Jam forzado.')
  })

  it('says so when the Hand is not one this Account may see', async () => {
    notFound = true
    // Another id: a Hand once fetched is kept for the page's life.
    renderHand('gone')

    expect(await screen.findByText("That hand doesn't exist or you can't see it.")).toBeTruthy()
  })
})
