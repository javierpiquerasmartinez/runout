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

beforeEach(() => {
  notFound = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (notFound) return Response.json({ reason: 'hand-not-found' }, { status: 404 })
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

  it('shows the Hand’s Notes, read-only', async () => {
    renderHand()

    const notes = await screen.findByRole('region', { name: 'Notes' })
    expect(await within(notes).findByText('Con 62 BB el jam de CO es forzado.')).toBeTruthy()
    expect(within(notes).getByText('Marta')).toBeTruthy()
    expect(within(notes).queryByRole('textbox')).toBeNull()
  })

  it('says so when the Hand is not one this Account may see', async () => {
    notFound = true
    // Another id: a Hand once fetched is kept for the page's life.
    renderHand('gone')

    expect(await screen.findByText("That hand doesn't exist or you can't see it.")).toBeTruthy()
  })
})
