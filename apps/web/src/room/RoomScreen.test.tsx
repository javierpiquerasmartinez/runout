import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { RoomScreen } from './RoomScreen'
import type { Note, Participant, QueueEntry, RoomView } from './roomClient'
import type { RoomCommands } from './useRoom'

type InRoom = Extract<RoomView, { phase: 'in-room' }>

const javier: Participant = { identityId: 'id-javier', displayName: 'Javier', role: 'master', screenNames: [] }
const marta: Participant = { identityId: 'id-marta', displayName: 'Marta', role: 'guest', screenNames: [] }

const firstHand: QueueEntry = {
  id: 'entry-1',
  handId: 'hand-1',
  position: 1,
  author: { identityId: 'id-javier', displayName: 'Javier' },
  site: 'pokerstars',
  siteHandId: '262120750636',
  playedAt: '2026-09-18T12:34:30.000Z',
  stake: { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
  summary: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river', showdown: true },
}

const secondHand: QueueEntry = { ...firstHand, id: 'entry-2', handId: 'hand-2', position: 2 }

const martasNote: Note = {
  id: 'note-1',
  seq: 1,
  handId: 'hand-1',
  writer: { identityId: 'id-marta', displayName: 'Marta' },
  body: 'The turn jam is forced.',
  writtenAt: '2026-09-18T13:00:00.000Z',
  editedAt: null,
}

/** A Room with the first Hand loaded, which is what the Notes panel hangs off. */
function roomWithLoadedHand(view: Partial<InRoom> = {}): InRoom {
  return roomView({ queue: [firstHand], playback: { handId: 'hand-1', actionIndex: 0, hideOpponentNames: false }, ...view })
}

function roomView(view: Partial<InRoom> = {}): InRoom {
  return {
    phase: 'in-room',
    room: { code: 'RNT4K9PX', name: 'Martes NL50' },
    you: 'id-javier',
    participants: [javier, marta],
    queue: [],
    playback: null,
    notes: [],
    marks: [],
    revision: 1,
    presence: [],
    sync: { state: 'synced', latencyMs: 42, failedAttempts: 0, awaitingSnapshot: false, seenRevision: 1 },
    masterChange: null,
    ...view,
  }
}

function screenOf(view: InRoom, commands: RoomCommands) {
  const session = {
    token: 'token',
    identity: { id: view.you, displayName: 'Javier', screenNames: [] },
    rememberDisplayName: () => {},
    rememberScreenNames: () => {},
  }
  return (
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <RoomScreen view={view} commands={commands} />
      </SessionContext.Provider>
    </I18nProvider>
  )
}

let showAgain: ((ui: ReactElement) => void) | undefined

function renderRoom(view: InRoom) {
  const commands = {
    handOverMaster: vi.fn(),
    kick: vi.fn(),
    closeRoom: vi.fn(),
    loadHand: vi.fn(),
    goToAction: vi.fn(),
    hideOpponentNames: vi.fn(),
    reassignAuthor: vi.fn(),
    reorderQueue: vi.fn(),
    removeQueueEntry: vi.fn(),
    undoQueueRemoval: vi.fn(),
    writeNote: vi.fn(),
    editNote: vi.fn(),
    removeNote: vi.fn(),
    undoNoteRemoval: vi.fn(),
    setMark: vi.fn(),
  } satisfies RoomCommands
  showAgain = render(screenOf(view, commands)).rerender
  return commands
}

/** The same screen again with a new view, as a Room event would leave it. */
function rerenderRoom(view: InRoom, commands: RoomCommands) {
  showAgain?.(screenOf(view, commands))
}

describe('RoomScreen · the Master role', () => {
  it('lets the Master hand the role to another Participant, never to themselves', async () => {
    const commands = renderRoom(roomView())

    expect(screen.queryByRole('button', { name: 'Hand the Master role to Javier' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Hand the Master role to Marta' }))

    expect(commands.handOverMaster).toHaveBeenCalledWith('id-marta')
  })

  it('offers a Guest no way to take the role', () => {
    renderRoom(roomView({ you: 'id-marta' }))

    expect(screen.queryByRole('button', { name: /Hand the Master role/ })).toBeNull()
    expect(screen.getByText('Waiting for the Master to load a hand.')).toBeTruthy()
  })

  it('announces a handover to the Room, and who controls it now', () => {
    renderRoom(
      roomView({
        you: 'id-marta',
        participants: [{ ...javier, role: 'guest', screenNames: [] }, { ...marta, role: 'master' }],
        masterChange: { masterId: 'id-marta', reason: 'handover' },
      }),
    )

    expect(screen.getAllByRole('status').map((region) => region.textContent)).toContain('You control the Room now')
    expect(screen.getByRole('button', { name: 'Hand the Master role to Javier' })).toBeTruthy()
  })

  it('says the Master dropped when the role passes on its own', () => {
    renderRoom(
      roomView({
        you: 'id-javier',
        participants: [{ ...javier, role: 'guest', screenNames: [] }, { ...marta, role: 'master' }],
        masterChange: { masterId: 'id-marta', reason: 'failover' },
      }),
    )

    expect(
      screen.getAllByRole('status').map((region) => region.textContent),
    ).toContain('The Master lost connection. Marta is now the Master')
  })
})

describe('RoomScreen · the end of a Room', () => {
  const originalPath = window.location.pathname

  beforeEach(() => {
    window.history.pushState(null, '', '/room/RNT4K9PX')
  })

  afterEach(() => {
    window.history.pushState(null, '', originalPath)
  })

  it('asks the Master to confirm before removing someone, and never offers it on their own row', async () => {
    const commands = renderRoom(roomView())

    expect(screen.queryByRole('button', { name: 'Remove Javier' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Marta' }))

    expect(screen.getByRole('heading', { name: 'Remove Marta?' })).toBeTruthy()
    expect(commands.kick).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(commands.kick).toHaveBeenCalledWith('id-marta')
  })

  it('leaves the Room untouched when the Master cancels the removal', async () => {
    const commands = renderRoom(roomView())

    await userEvent.click(screen.getByRole('button', { name: 'Remove Marta' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(commands.kick).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Remove Marta?' })).toBeNull()
  })

  it('offers a Guest no way to remove anyone', () => {
    renderRoom(roomView({ you: 'id-marta' }))

    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })

  it('makes the Master choose between handing the role over and closing the Room', async () => {
    const view = roomView()
    const commands = renderRoom(view)

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))

    expect(screen.getByRole('heading', { name: 'You are the Master of this room' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Marta' }))
    expect(commands.handOverMaster).toHaveBeenCalledWith('id-marta')
    // Still in the Room: the role has not moved yet, so neither has the Master.
    expect(window.location.pathname).toBe('/room/RNT4K9PX')

    rerenderRoom(
      { ...view, participants: [{ ...javier, role: 'guest', screenNames: [] }, { ...marta, role: 'master' }] },
      commands,
    )
    expect(window.location.pathname).toBe('/')
  })

  it('keeps a Master whose handover was refused where they are', async () => {
    const view = roomView()
    const commands = renderRoom(view)

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    await userEvent.click(screen.getByRole('button', { name: 'Marta' }))
    // The Room says nothing back: the role never moved, so neither does the Master.
    rerenderRoom(view, commands)

    expect(window.location.pathname).toBe('/room/RNT4K9PX')
  })

  it('warns that a closed Room never reopens before closing it', async () => {
    const commands = renderRoom(roomView())

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close the room' }))

    expect(screen.getByRole('heading', { name: 'Close the room?' })).toBeTruthy()
    expect(commands.closeRoom).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Close the room' }))
    expect(commands.closeRoom).toHaveBeenCalled()
  })

  it('tells a Master alone in the Room there is nobody to hand the role to', async () => {
    renderRoom(roomView({ participants: [javier] }))

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))

    expect(screen.getByText('Nobody else is connected to hand control to.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close the room' })).toBeTruthy()
  })

  it('lets a Guest walk out without asking anything', async () => {
    const commands = renderRoom(roomView({ you: 'id-marta' }))

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))

    expect(window.location.pathname).toBe('/')
    expect(commands.closeRoom).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('RoomScreen · staying in sync', () => {
  it('tells the Master how each Participant is following the Room', () => {
    renderRoom(
      roomView({
        presence: [
          { identityId: 'id-javier', presence: 'connected', latencyMs: 12, inSync: true },
          { identityId: 'id-marta', presence: 'away', latencyMs: 400, inSync: false },
        ],
      }),
    )

    expect(screen.getByTitle('Connected')).toBeTruthy()
    expect(screen.getByTitle('No signal for over 30 s')).toBeTruthy()
  })

  it('flags a Participant who is connected but has not caught up', () => {
    renderRoom(
      roomView({
        presence: [{ identityId: 'id-marta', presence: 'unstable', latencyMs: 900, inSync: false }],
      }),
    )

    expect(screen.getByTitle('Unstable connection · Has not received the latest Action yet')).toBeTruthy()
  })

  it('marks the Room live while it is recovering, and offline only when it is', () => {
    const commands = renderRoom(
      roomView({ sync: { state: 'recovering', latencyMs: 42, failedAttempts: 0, awaitingSnapshot: true, seenRevision: 2 } }),
    )
    expect(screen.getByText('LIVE')).toBeTruthy()

    rerenderRoom(
      roomView({ sync: { state: 'offline', latencyMs: 42, failedAttempts: 1, awaitingSnapshot: true, seenRevision: 2 } }),
      commands,
    )

    expect(screen.getByText('OFFLINE')).toBeTruthy()
  })
})

describe('RoomScreen \u00b7 Notes', () => {
  it('lets any Participant write a Note on the loaded Hand', async () => {
    const commands = renderRoom(roomWithLoadedHand({ you: 'id-marta' }))

    await userEvent.type(screen.getByLabelText('Add a note about this hand'), 'BB can call with AQ.')
    await userEvent.click(screen.getByRole('button', { name: 'Post note' }))

    expect(commands.writeNote).toHaveBeenCalledWith('hand-1', 'BB can call with AQ.')
    expect((screen.getByLabelText('Add a note about this hand') as HTMLTextAreaElement).value).toBe('')
  })

  it('writes nothing when the Note is blank', async () => {
    const commands = renderRoom(roomWithLoadedHand())

    await userEvent.type(screen.getByLabelText('Save a note about this hand'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }))

    expect(commands.writeNote).not.toHaveBeenCalled()
  })

  it('shows every Note on the loaded Hand, with its writer, and no others', () => {
    const elsewhere: Note = { ...martasNote, id: 'note-2', seq: 2, handId: 'hand-2', body: 'Another hand.' }
    renderRoom(roomWithLoadedHand({ notes: [martasNote, elsewhere] }))

    const notes = screen.getByRole('region', { name: 'Hand notes' })
    expect(within(notes).getByText('The turn jam is forced.')).toBeTruthy()
    expect(within(notes).getByText('Marta')).toBeTruthy()
    expect(within(notes).queryByText('Another hand.')).toBeNull()
  })

  it('never moves Playback while a Note is being written', async () => {
    const commands = renderRoom(roomWithLoadedHand())

    await userEvent.type(screen.getByLabelText('Save a note about this hand'), 'k{ArrowRight}')

    expect(commands.goToAction).not.toHaveBeenCalled()
    expect(commands.loadHand).not.toHaveBeenCalled()
  })

  it('shows a Guest the edit and delete controls locked, with the reason', () => {
    renderRoom(roomWithLoadedHand({ you: 'id-marta', notes: [martasNote] }))

    const edit = screen.getByRole('button', { name: /^Edit Marta\u2019s note/ })
    expect(edit.getAttribute('aria-disabled')).toBe('true')
    expect(edit.getAttribute('title')).toBe('Only the Master can edit or delete a note.')
    expect(screen.getByRole('button', { name: /^Delete Marta\u2019s note/ }).getAttribute('aria-disabled')).toBe('true')
  })

  it('lets the Master rewrite a Note', async () => {
    const commands = renderRoom(roomWithLoadedHand({ notes: [martasNote] }))

    await userEvent.click(screen.getByRole('button', { name: 'Edit Marta\u2019s note' }))
    const field = screen.getByLabelText('Edit Marta\u2019s note')
    await userEvent.clear(field)
    await userEvent.type(field, 'Forced jam.')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(commands.editNote).toHaveBeenCalledWith('note-1', 'Forced jam.')
  })

  it('offers the Master ten seconds to undo a deletion', async () => {
    const commands = renderRoom(roomWithLoadedHand({ notes: [martasNote] }))

    await userEvent.click(screen.getByRole('button', { name: 'Delete Marta\u2019s note' }))
    expect(commands.removeNote).toHaveBeenCalledWith('note-1')

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(commands.undoNoteRemoval).toHaveBeenCalledWith('note-1')
  })

  it('drops the undo of a removal when the Master moves on to another Hand', async () => {
    const view = roomWithLoadedHand({ queue: [firstHand, secondHand], notes: [martasNote] })
    const commands = renderRoom(view)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Marta\u2019s note' }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()

    // The Master loads the next Hand: an undo of a Note nobody can see is no offer.
    rerenderRoom({ ...view, playback: { handId: 'hand-2', actionIndex: 0, hideOpponentNames: false } }, commands)

    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('dates a Note by when it was written, and says when it was rewritten since', () => {
    const edited: Note = { ...martasNote, editedAt: '2026-09-18T13:30:00.000Z' }
    renderRoom(roomWithLoadedHand({ notes: [edited] }))

    const when = screen.getByRole('region', { name: 'Hand notes' }).querySelector('.room-notes__when')
    expect(when?.textContent).toContain('edited')
    expect(when?.getAttribute('title')).toContain('18')
  })
})

describe('RoomScreen \u00b7 Marks', () => {
  it('lets a Participant Mark the loaded Hand for themselves, and take it off', async () => {
    const view = roomWithLoadedHand({ you: 'id-marta' })
    const commands = renderRoom(view)

    await userEvent.click(screen.getByRole('button', { name: 'Mark' }))
    expect(commands.setMark).toHaveBeenCalledWith('hand-1', true)

    rerenderRoom({ ...view, marks: ['hand-1'] }, commands)
    await userEvent.click(screen.getByRole('button', { name: 'Marked' }))
    expect(commands.setMark).toHaveBeenCalledWith('hand-1', false)
  })
})
