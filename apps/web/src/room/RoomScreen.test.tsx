import type { ReactElement } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { HeldRoomContext } from './heldRoomContext'
import { forgetHands } from './hand'
import { RoomScreen } from './RoomScreen'
import type { Note, Participant, QueueEntry, RoomView } from './roomClient'
import type { RoomCommands } from './useRoom'
import type { Identity } from '../identity/identity'
import { fakeGoogleIdentity } from '../test/fakeGoogle'
import { fakeSession } from '../test/fakeSession'
import splitPot from './fixtures/split-pot.json'

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
  overview: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river', showdown: true },
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
    // Live, as every Room was before Free Review: most of these tests are about the shared Playback.
    state: 'live',
    playback: null,
    own: null,
    notes: [],
    marks: [],
    inLibrary: [],
    revision: 1,
    presence: [],
    sync: { state: 'synced', latencyMs: 42, failedAttempts: 0, awaitingSnapshot: false, seenRevision: 1 },
    masterChange: null,
    liveStarted: null,
    ...view,
  }
}

function screenOf(view: InRoom, commands: RoomCommands, identity: Partial<Identity> = {}) {
  const session = fakeSession({ id: view.you, ...identity })
  return (
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <RoomScreen view={view} commands={commands} />
      </SessionContext.Provider>
    </I18nProvider>
  )
}

let showAgain: ((ui: ReactElement) => void) | undefined

function renderRoom(view: InRoom, identity: Partial<Identity> = {}) {
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
    rejoinAs: vi.fn(),
    startLive: vi.fn(),
    endLive: vi.fn(),
  } satisfies RoomCommands
  showAgain = render(screenOf(view, commands, identity)).rerender
  return commands
}

/** The same screen again with a new view, as a Room event would leave it. */
function rerenderRoom(view: InRoom, commands: RoomCommands) {
  showAgain?.(screenOf(view, commands))
}

function peopleTrigger() {
  return screen.getByRole('button', { name: /in the room/ })
}

function peoplePanel() {
  return screen.queryByRole('group', { name: 'In the room' })
}

/** Who is in the Room, as a mouse reveals it from the header. */
async function showPeople() {
  await userEvent.hover(peopleTrigger())
}

describe('RoomScreen · the Master role', () => {
  it('lets the Master hand the role to another Participant, never to themselves', async () => {
    const commands = renderRoom(roomView())
    await showPeople()

    expect(screen.queryByRole('button', { name: 'Hand the Master role to Javier' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Hand the Master role to Marta' }))

    expect(commands.handOverMaster).toHaveBeenCalledWith('id-marta')
  })

  it('offers a Guest no way to take the role', async () => {
    renderRoom(roomView({ you: 'id-marta' }))
    await showPeople()

    expect(screen.queryByRole('button', { name: /Hand the Master role/ })).toBeNull()
    expect(screen.getByText('Waiting for the Master to load a hand.')).toBeTruthy()
  })

  it('announces a handover to the Room, and who controls it now', async () => {
    renderRoom(
      roomView({
        you: 'id-marta',
        participants: [{ ...javier, role: 'guest', screenNames: [] }, { ...marta, role: 'master' }],
        masterChange: { masterId: 'id-marta', reason: 'handover' },
      }),
    )
    await showPeople()

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

describe('RoomScreen · who is in the Room', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  /** Testing Library only drains its queue under fake timers if it finds Jest's global. */
  function userOnAFakeClock() {
    vi.useFakeTimers()
    vi.stubGlobal('jest', { advanceTimersByTime: vi.advanceTimersByTime })
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  }

  it('no longer lists the Participants in the side panel', () => {
    renderRoom(roomView())

    expect(screen.queryByRole('heading', { name: 'In the room' })).toBeNull()
    expect(peoplePanel()).toBeNull()
    expect(screen.queryByText('Master · 0 hands')).toBeNull()
  })

  it('shows every Participant when the pointer rests on the avatars', async () => {
    renderRoom(roomView({ presence: [{ identityId: 'id-marta', presence: 'away', latencyMs: 400, inSync: false }] }))

    await showPeople()

    const panel = within(peoplePanel()!)
    expect(panel.getByText('Javier')).toBeTruthy()
    expect(panel.getByText('Master · 0 hands')).toBeTruthy()
    expect(panel.getByText('Marta')).toBeTruthy()
    expect(panel.getByText('Guest · 0 hands')).toBeTruthy()
    expect(panel.getByTitle('No signal for over 30 s')).toBeTruthy()
    expect(peopleTrigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('takes no notice of a mouse click on the avatars', async () => {
    const user = userEvent.setup()
    renderRoom(roomView())

    await user.hover(peopleTrigger())
    await user.click(peopleTrigger())
    expect(peoplePanel()).not.toBeNull()

    await user.click(peopleTrigger())
    expect(peoplePanel()).not.toBeNull()
  })

  it('closes 150 ms after the pointer leaves, unless it comes back', async () => {
    const user = userOnAFakeClock()
    renderRoom(roomView())

    await user.hover(peopleTrigger())
    await user.unhover(peopleTrigger())
    act(() => vi.advanceTimersByTime(100))
    await user.hover(peoplePanel()!)
    act(() => vi.advanceTimersByTime(1000))
    expect(peoplePanel()).not.toBeNull()

    await user.unhover(peoplePanel()!)
    act(() => vi.advanceTimersByTime(140))
    expect(peoplePanel()).not.toBeNull()
    act(() => vi.advanceTimersByTime(20))
    expect(peoplePanel()).toBeNull()
  })

  it('still closes when the pointer leaves after the Master used a button in it', async () => {
    const user = userOnAFakeClock()
    renderRoom(roomView())

    await user.hover(peopleTrigger())
    const handOver = screen.getByRole('button', { name: 'Hand the Master role to Marta' })
    await user.click(handOver)
    await user.unhover(handOver)
    act(() => vi.advanceTimersByTime(200))

    expect(peoplePanel()).toBeNull()
  })

  it('opens from the keyboard, stays open while focus is inside and closes on Escape', async () => {
    const user = userEvent.setup()
    renderRoom(roomView())

    act(() => peopleTrigger().focus())
    expect(peoplePanel()).not.toBeNull()

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hand the Master role to Marta' }))
    expect(peoplePanel()).not.toBeNull()

    await user.keyboard('{Escape}')
    expect(peoplePanel()).toBeNull()
    expect(document.activeElement).toBe(peopleTrigger())

    await user.keyboard('{Enter}')
    expect(peoplePanel()).not.toBeNull()
  })

  it('closes when keyboard focus moves on past it', async () => {
    const user = userEvent.setup()
    renderRoom(roomView({ participants: [javier] }))

    act(() => peopleTrigger().focus())
    await user.tab()

    expect(document.activeElement).not.toBe(peopleTrigger())
    expect(peoplePanel()).toBeNull()
  })

  it('keeps Escape working when the Master hands over the role from the keyboard and their buttons vanish', async () => {
    const user = userEvent.setup()
    const commands = renderRoom(roomView())
    act(() => peopleTrigger().focus())
    act(() => screen.getByRole('button', { name: 'Hand the Master role to Marta' }).focus())

    rerenderRoom(
      roomView({ participants: [{ ...javier, role: 'guest', screenNames: [] }, { ...marta, role: 'master' }] }),
      commands,
    )

    expect(screen.queryByRole('button', { name: 'Hand the Master role to Marta' })).toBeNull()
    expect(document.activeElement).toBe(peopleTrigger())
    expect(peoplePanel()).not.toBeNull()

    await user.keyboard('{Escape}')
    expect(peoplePanel()).toBeNull()
    expect(document.activeElement).toBe(peopleTrigger())
  })

  it('keeps Escape working when the Participant on the focused row leaves', async () => {
    const user = userEvent.setup()
    const commands = renderRoom(roomView())
    act(() => peopleTrigger().focus())
    act(() => screen.getByRole('button', { name: 'Remove Marta' }).focus())

    rerenderRoom(roomView({ participants: [javier] }), commands)

    expect(document.activeElement).toBe(peopleTrigger())
    await user.keyboard('{Escape}')
    expect(peoplePanel()).toBeNull()
  })

  it('opens and closes with a tap on a touch screen', async () => {
    const user = userEvent.setup()
    renderRoom(roomView())
    const tap = () => user.pointer([{ keys: '[TouchA]', target: peopleTrigger() }])

    await tap()
    expect(peoplePanel()).not.toBeNull()

    await tap()
    expect(peoplePanel()).toBeNull()
  })

  it('gets out of the way before asking to confirm a removal', async () => {
    renderRoom(roomView())
    await showPeople()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Marta' }))

    expect(screen.getByRole('heading', { name: 'Remove Marta?' })).toBeTruthy()
    expect(peoplePanel()).toBeNull()
  })

  it('shows a change of Master for six seconds with the panel closed, in a region that stays', () => {
    vi.useFakeTimers()
    renderRoom(
      roomView({
        you: 'id-javier',
        participants: [{ ...javier, role: 'guest', screenNames: [] }, { ...marta, role: 'master' }],
        masterChange: { masterId: 'id-marta', reason: 'handover' },
      }),
    )
    const region = screen.getAllByRole('status').find((status) => status.textContent === 'Marta is now the Master')!
    expect(peoplePanel()).toBeNull()

    act(() => vi.advanceTimersByTime(5900))
    expect(region.textContent).toBe('Marta is now the Master')

    act(() => vi.advanceTimersByTime(200))
    expect(region.textContent).toBe('')
    expect(region.isConnected).toBe(true)
  })

  it('shows a change of Master with the panel open too', async () => {
    renderRoom(
      roomView({
        you: 'id-marta',
        participants: [{ ...javier, role: 'guest', screenNames: [] }, { ...marta, role: 'master' }],
        masterChange: { masterId: 'id-marta', reason: 'handover' },
      }),
    )

    await showPeople()

    expect(peoplePanel()).not.toBeNull()
    expect(screen.getAllByRole('status').map((region) => region.textContent)).toContain('You control the Room now')
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
    await showPeople()

    expect(screen.queryByRole('button', { name: 'Remove Javier' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Marta' }))

    expect(screen.getByRole('heading', { name: 'Remove Marta?' })).toBeTruthy()
    expect(commands.kick).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(commands.kick).toHaveBeenCalledWith('id-marta')
  })

  it('leaves the Room untouched when the Master cancels the removal', async () => {
    const commands = renderRoom(roomView())
    await showPeople()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Marta' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(commands.kick).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Remove Marta?' })).toBeNull()
  })

  it('offers a Guest no way to remove anyone', async () => {
    renderRoom(roomView({ you: 'id-marta' }))
    await showPeople()

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

  it('warns how many Hands in nobody’s Library closing will lose', async () => {
    const asked: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url)
        return Response.json({ count: 2 })
      }),
    )
    try {
      renderRoom(roomView())

      await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
      await userEvent.click(screen.getByRole('button', { name: 'Close the room' }))

      expect(
        await screen.findByText("2 hands in the queue are in nobody's library: they will be lost with their notes."),
      ).toBeTruthy()
      expect(asked).toEqual(['/api/rooms/RNT4K9PX/room-hands'])
    } finally {
      vi.unstubAllGlobals()
    }
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
  it('tells the Master how each Participant is following the Room', async () => {
    renderRoom(
      roomView({
        presence: [
          { identityId: 'id-javier', presence: 'connected', latencyMs: 12, inSync: true },
          { identityId: 'id-marta', presence: 'away', latencyMs: 400, inSync: false },
        ],
      }),
    )
    await showPeople()

    expect(screen.getByTitle('Connected')).toBeTruthy()
    expect(screen.getByTitle('No signal for over 30 s')).toBeTruthy()
  })

  it('flags a Participant who is connected but has not caught up', async () => {
    renderRoom(
      roomView({
        presence: [{ identityId: 'id-marta', presence: 'unstable', latencyMs: 900, inSync: false }],
      }),
    )
    await showPeople()

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

describe('RoomScreen \u00b7 Free Review', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(splitPot)),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    forgetHands()
  })

  /** A Room in Free Review, with Marta on the first Hand of two. */
  function freeReview(view: Partial<InRoom> = {}): InRoom {
    return roomView({
      state: 'free-review',
      you: 'id-marta',
      queue: [firstHand, secondHand],
      own: { handId: 'hand-1', actionIndex: 0, hideOpponentNames: false },
      ...view,
    })
  }

  it('lets a Guest open any Hand of the Queue on their own', async () => {
    const commands = renderRoom(freeReview())

    const queue = screen.getByRole('complementary', { name: 'Hand queue' })
    await userEvent.click(within(queue).getAllByRole('button', { name: /BTN/ })[1])

    expect(commands.loadHand).toHaveBeenCalledWith('hand-2')
  })

  it('shows a Guest their own table, with controls that are theirs to use', async () => {
    const commands = renderRoom(freeReview())

    const next = await screen.findByRole('button', { name: 'Next action' })
    expect(next.getAttribute('aria-disabled')).toBeNull()
    await userEvent.click(next)
    expect(commands.goToAction).toHaveBeenCalledWith(1)
    expect(screen.getByRole('switch', { name: 'Hide opponent names' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('shows no Sync indicator, since nothing is shared', async () => {
    renderRoom(freeReview())

    await screen.findByRole('button', { name: 'Next action' })
    expect(screen.queryByText(/following|in sync/i)).toBeNull()
    expect(screen.getByText('FREE REVIEW')).toBeTruthy()
  })

  it('offers the Master, and only the Master, to start Live', async () => {
    const commands = renderRoom(freeReview({ you: 'id-javier' }))

    await userEvent.click(screen.getByRole('button', { name: 'Start live' }))
    expect(commands.startLive).toHaveBeenCalled()
  })

  it('offers a Guest no way to start Live', () => {
    renderRoom(freeReview())

    expect(screen.queryByRole('button', { name: 'Start live' })).toBeNull()
  })
})

describe('RoomScreen \u00b7 Live', () => {
  it('shows everyone that the Room is Live, and who leads it', () => {
    renderRoom(roomView({ you: 'id-marta' }))

    expect(screen.getByRole('region', { name: 'Live' }).textContent).toContain('Javier')
    expect(screen.queryByRole('button', { name: 'End live' })).toBeNull()
  })

  it('lets the Master end Live', async () => {
    const commands = renderRoom(roomView())

    await userEvent.click(screen.getByRole('button', { name: 'End live' }))
    expect(commands.endLive).toHaveBeenCalled()
  })

  it('says when the Master has just started Live', () => {
    renderRoom(roomView({ you: 'id-marta', liveStarted: 2 }))

    expect(screen.getByText('Javier started live: you are following them.')).toBeTruthy()
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

    const notes = screen.getByRole('tabpanel', { name: /^Notes/ })
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

  it("shows a Guest the edit and delete controls of someone else's Note locked, with the reason", () => {
    const pablo: Participant = { identityId: 'id-pablo', displayName: 'Pablo', role: 'guest', screenNames: [] }
    renderRoom(roomWithLoadedHand({ you: 'id-pablo', participants: [javier, marta, pablo], notes: [martasNote] }))

    const edit = screen.getByRole('button', { name: /^Edit Marta\u2019s note/ })
    expect(edit.getAttribute('aria-disabled')).toBe('true')
    expect(edit.getAttribute('title')).toBe('Only whoever wrote a note, or the Master, can edit or delete it.')
    expect(screen.getByRole('button', { name: /^Delete Marta\u2019s note/ }).getAttribute('aria-disabled')).toBe('true')
  })

  it('lets a Guest rewrite, delete and restore their own Note', async () => {
    const commands = renderRoom(roomWithLoadedHand({ you: 'id-marta', notes: [martasNote] }))

    await userEvent.click(screen.getByRole('button', { name: 'Edit Marta\u2019s note' }))
    const field = screen.getByLabelText('Edit Marta\u2019s note')
    await userEvent.clear(field)
    await userEvent.type(field, 'Forced jam.')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(commands.editNote).toHaveBeenCalledWith('note-1', 'Forced jam.')

    await userEvent.click(screen.getByRole('button', { name: 'Delete Marta\u2019s note' }))
    expect(commands.removeNote).toHaveBeenCalledWith('note-1')
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(commands.undoNoteRemoval).toHaveBeenCalledWith('note-1')
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

    const when = screen.getByRole('tabpanel', { name: /^Notes/ }).querySelector('.room-notes__when')
    expect(when?.textContent).toContain('edited')
    expect(when?.getAttribute('title')).toContain('18')
  })
})

describe('RoomScreen · the side panel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(splitPot)),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    forgetHands()
  })

  function tab(name: string | RegExp) {
    return screen.getByRole('tab', { name })
  }
  function isSelected(name: string | RegExp) {
    return tab(name).getAttribute('aria-selected') === 'true'
  }
  function shownPanel() {
    return within(screen.getByRole('tabpanel'))
  }
  function onHand(handId: string, actionIndex = 0) {
    return { handId, actionIndex, hideOpponentNames: false }
  }

  it('opens on Notes, with the Details one click away', async () => {
    renderRoom(roomWithLoadedHand({ notes: [martasNote] }))

    expect(isSelected(/^Notes/)).toBe(true)
    expect(isSelected('Details')).toBe(false)
    expect(shownPanel().getByText('The turn jam is forced.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Current hand' })).toBeNull()

    await userEvent.click(tab('Details'))

    expect(isSelected('Details')).toBe(true)
    expect(shownPanel().getByRole('heading', { name: 'Current hand' })).toBeTruthy()
    expect(shownPanel().queryByText('The turn jam is forced.')).toBeNull()
  })

  it('gives the Notes no title of their own', () => {
    renderRoom(roomWithLoadedHand({ notes: [martasNote] }))

    expect(shownPanel().queryByRole('heading')).toBeNull()
  })

  it('keeps the chosen tab when the Hand changes', async () => {
    const view = roomWithLoadedHand({ queue: [firstHand, secondHand] })
    const commands = renderRoom(view)
    await userEvent.click(tab('Details'))

    rerenderRoom({ ...view, playback: onHand('hand-2') }, commands)

    expect(isSelected('Details')).toBe(true)
  })

  it('counts the Notes on the Hand, and goes up while the Details are showing', async () => {
    const elsewhere: Note = { ...martasNote, id: 'note-2', seq: 2, handId: 'hand-2' }
    const view = roomWithLoadedHand({ notes: [martasNote, elsewhere] })
    const commands = renderRoom(view)
    expect(isSelected('Notes 1')).toBe(true)

    await userEvent.click(tab('Details'))
    rerenderRoom({ ...view, notes: [martasNote, elsewhere, { ...martasNote, id: 'note-3', seq: 3 }] }, commands)

    expect(tab('Notes 2')).toBeTruthy()
  })

  it('shows no count on a Hand with no Notes', () => {
    renderRoom(roomWithLoadedHand())

    expect(tab('Notes')).toBeTruthy()
  })

  it('takes the Participant to the field to write from either tab with the Note button', async () => {
    renderRoom(roomWithLoadedHand())
    const button = await screen.findByRole('button', { name: 'Note' })
    await userEvent.click(tab('Details'))

    await userEvent.click(button)

    expect(isSelected('Notes')).toBe(true)
    expect(document.activeElement).toBe(screen.getByLabelText('Save a note about this hand'))

    await userEvent.click(tab('Details'))
    await userEvent.click(tab('Notes'))
    await userEvent.click(button)

    expect(document.activeElement).toBe(screen.getByLabelText('Save a note about this hand'))
  })

  it('keeps a half-written Note across a change of tab', async () => {
    renderRoom(roomWithLoadedHand())
    await userEvent.type(screen.getByLabelText('Save a note about this hand'), 'BB can call')

    await userEvent.click(tab('Details'))
    await userEvent.click(tab('Notes'))

    expect((screen.getByLabelText('Save a note about this hand') as HTMLTextAreaElement).value).toBe('BB can call')
  })

  it('keeps a Note being edited across a change of tab', async () => {
    renderRoom(roomWithLoadedHand({ notes: [martasNote] }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Marta’s note' }))
    await userEvent.type(screen.getByLabelText('Edit Marta’s note'), ' Always.')

    await userEvent.click(tab('Details'))
    await userEvent.click(tab(/^Notes/))

    expect((screen.getByLabelText('Edit Marta’s note') as HTMLTextAreaElement).value).toBe(
      'The turn jam is forced. Always.',
    )
  })

  it('keeps the undo of a deleted Note across a change of tab', async () => {
    const commands = renderRoom(roomWithLoadedHand({ notes: [martasNote] }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete Marta’s note' }))

    await userEvent.click(tab('Details'))
    await userEvent.click(tab(/^Notes/))
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(commands.undoNoteRemoval).toHaveBeenCalledWith('note-1')
  })

  it('shows the Payout in the Details at the end of the Hand, without changing the tab', async () => {
    const view = roomWithLoadedHand()
    const commands = renderRoom(view)
    await screen.findByRole('button', { name: 'Note' })

    rerenderRoom({ ...view, playback: onHand('hand-1', splitPot.timeline.states.length - 1) }, commands)

    expect(await screen.findByRole('heading', { name: 'Pot distribution', hidden: true })).toBeTruthy()
    expect(isSelected('Notes')).toBe(true)

    await userEvent.click(tab('Details'))

    expect(shownPanel().getByRole('heading', { name: 'Pot distribution' })).toBeTruthy()
  })

  it('says so on both tabs when no Hand is loaded, with no field to write', async () => {
    renderRoom(roomView({ you: 'id-marta' }))

    expect(shownPanel().getByText('No hand has been loaded yet.')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()

    await userEvent.click(tab('Details'))

    expect(shownPanel().getByText('No hand has been loaded yet.')).toBeTruthy()
  })

  it('keeps the notice to someone without an Account above the tabs', () => {
    fakeGoogleIdentity()
    renderRoom(roomView({ you: 'id-marta' }), { account: null, room: { code: 'RNT4K9PX' } })

    const notice = screen.getByRole('region', { name: 'Without an account' })
    expect(notice.compareDocumentPosition(screen.getByRole('tablist'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('works from the keyboard', async () => {
    renderRoom(roomWithLoadedHand())

    tab('Details').focus()
    await userEvent.keyboard('{Enter}')
    expect(isSelected('Details')).toBe(true)

    tab('Notes').focus()
    await userEvent.keyboard(' ')
    expect(isSelected('Notes')).toBe(true)
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

describe('RoomScreen · copying the Hand', () => {
  const summary = 'PokerStars · NL10 (€0.05/€0.10) · 6-max · 09/18/2026'
  const history = "PokerStars Hand #262120750636: Hold'em No Limit (€0.05/€0.10 EUR) - 2026/09/18 14:34:30 CET"
  let writeText: ReturnType<typeof vi.fn>
  let asked: { url: string; authorization: string | undefined }[]
  let refused: boolean
  /** The Hands the server has, by id; any other is not found. */
  let hands: Record<string, object>

  beforeEach(() => {
    asked = []
    refused = false
    hands = {}
    writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        asked.push({ url, authorization: new Headers(init.headers).get('Authorization') ?? undefined })
        if (!url.includes('/copy')) {
          const hand = hands[url.replace('/api/hands/', '')]
          return hand ? Response.json(hand) : Response.json({ reason: 'hand-not-found' }, { status: 404 })
        }
        if (refused) return Response.json({ reason: 'hand-not-found' }, { status: 404 })
        const text = url.includes('as=history') ? history : summary
        return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const copyRequests = () => asked.filter(({ url }) => url.includes('/copy'))

  it.each([
    ['the Master', 'id-javier'],
    ['a Guest', 'id-marta'],
  ])('lets %s copy the whole Hand as its Summary in one click, and says so', async (_, you) => {
    renderRoom(roomWithLoadedHand({ you }))

    await userEvent.click(screen.getByRole('button', { name: 'Copy hand' }))

    expect(await screen.findByRole('button', { name: 'Hand copied · Summary' })).toBeTruthy()
    expect(screen.getAllByRole('status').map((region) => region.textContent)).toContain('Hand copied · Summary')
    expect(writeText).toHaveBeenCalledWith(summary)
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(copyRequests()).toEqual([
      {
        url: `/api/hands/hand-1/copy?as=summary&language=en&timeZone=${encodeURIComponent(timeZone)}`,
        authorization: 'Bearer token',
      },
    ])
  })

  it('offers the Summary and the Original in the menu beside it', async () => {
    renderRoom(roomWithLoadedHand({ you: 'id-marta' }))

    await userEvent.click(screen.getByRole('button', { name: 'Choose what to copy' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Summary', 'Original'])
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Summary' }))

    expect(await screen.findByRole('button', { name: 'Hand copied · Summary' })).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(writeText).toHaveBeenCalledWith(summary)
  })

  it('copies the Original, the Hand History as it came in, and says so', async () => {
    hands['hand-kept'] = { ...splitPot, id: 'hand-kept', hasHistory: true }
    renderRoom(
      roomWithLoadedHand({
        you: 'id-marta',
        queue: [{ ...firstHand, handId: 'hand-kept' }],
        playback: { handId: 'hand-kept', actionIndex: 0, hideOpponentNames: false },
      }),
    )
    await screen.findByText('Action 0 of 17')

    await userEvent.click(screen.getByRole('button', { name: 'Choose what to copy' }))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Original' }))

    expect(await screen.findByRole('button', { name: 'Hand copied · Original' })).toBeTruthy()
    expect(screen.getAllByRole('status').map((region) => region.textContent)).toContain('Hand copied · Original')
    expect(writeText).toHaveBeenCalledWith(history)
    expect(copyRequests().map(({ url }) => new URL(url, 'http://localhost').searchParams.get('as'))).toEqual([
      'history',
    ])
  })

  it('locks the Original, saying why, for a Hand Runout kept no text of', async () => {
    hands['hand-old'] = { ...splitPot, id: 'hand-old', hasHistory: false }
    renderRoom(
      roomWithLoadedHand({
        you: 'id-marta',
        queue: [{ ...firstHand, handId: 'hand-old' }],
        playback: { handId: 'hand-old', actionIndex: 0, hideOpponentNames: false },
      }),
    )
    await screen.findByText('Action 0 of 17')

    await userEvent.click(screen.getByRole('button', { name: 'Choose what to copy' }))
    const original = within(screen.getByRole('menu')).getByRole('menuitem', {
      name: 'Original. Import the hand again to get the original',
    })
    expect(original.getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(original)

    expect(copyRequests()).toEqual([])
    expect(writeText).not.toHaveBeenCalled()
  })

  it('opens the menu from the keyboard, and closes it back onto its arrow', async () => {
    renderRoom(roomWithLoadedHand({ you: 'id-marta' }))
    const arrow = screen.getByRole('button', { name: 'Choose what to copy' })

    arrow.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Summary' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(arrow)
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('button', { name: 'Hand copied · Summary' })).toBeTruthy()
  })

  it('copies the same whatever the Playback shows and whether names are hidden', async () => {
    renderRoom(
      roomWithLoadedHand({ you: 'id-marta', playback: { handId: 'hand-1', actionIndex: 7, hideOpponentNames: true } }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Copy hand' }))

    expect(await screen.findByRole('button', { name: 'Hand copied · Summary' })).toBeTruthy()
    expect(copyRequests().map(({ url }) => new URL(url, 'http://localhost').pathname)).toEqual([
      '/api/hands/hand-1/copy',
    ])
    expect(writeText).toHaveBeenCalledWith(summary)
  })

  it('says so when the Hand could not be copied', async () => {
    refused = true
    renderRoom(roomWithLoadedHand({ you: 'id-marta' }))

    await userEvent.click(screen.getByRole('button', { name: 'Copy hand' }))

    expect(await screen.findByRole('button', { name: 'Couldn’t copy the hand' })).toBeTruthy()
    expect(screen.getAllByRole('status').map((region) => region.textContent)).toContain('Couldn’t copy the hand')
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('RoomScreen \u00b7 Note counts in the Queue', () => {
  it('shows how many Notes each Queue Entry has, and nothing on one with none', () => {
    const another: Note = { ...martasNote, id: 'note-2', seq: 2, body: 'Fold the river.' }
    renderRoom(roomView({ queue: [firstHand, secondHand], notes: [martasNote, another] }))

    const [first, second] = within(screen.getByRole('complementary', { name: 'Hand queue' })).getAllByRole('listitem')
    expect(within(first).getByText('2 notes')).toBeTruthy()
    expect(within(second).queryByText(/note/)).toBeNull()
  })
})

describe('RoomScreen \u00b7 Hands in your Library', () => {
  it('says on each Queue Entry whether its Hand is in the viewer\u2019s Library', () => {
    renderRoom(roomView({ queue: [firstHand, secondHand], inLibrary: ['hand-2'] }))

    const [first, second] = within(screen.getByRole('complementary', { name: 'Hand queue' })).getAllByRole('listitem')
    expect(within(first).queryByText('In your library')).toBeNull()
    expect(within(second).getByText('In your library')).toBeTruthy()
  })
})

describe('RoomScreen · without an Account', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('tells an anonymous Participant that what they do is lost when the Room closes, and offers to sign in', async () => {
    fakeGoogleIdentity()
    renderRoom(roomView({ you: 'id-marta' }), { account: null, room: { code: 'RNT4K9PX' } })

    const notice = screen.getByRole('region', { name: 'Without an account' })
    expect(notice.textContent).toContain('what you do in this room is lost when it closes')
    expect(await within(notice).findByRole('button', { name: 'Sign in with Google' })).toBeTruthy()
  })

  it('signs them in as an Account that takes their place in this Room', async () => {
    fakeGoogleIdentity('id-token-from-google')
    const view = roomView({ you: 'id-marta' })
    const session = fakeSession({ id: 'id-marta', account: null, room: { code: 'RNT4K9PX' } })
    render(
      <I18nProvider initialLocale="en">
        <SessionContext.Provider value={session}>
          <HeldRoomContext
            value={{ code: 'RNT4K9PX', view, commands: {} as RoomCommands, displayName: 'Marta', confirmDisplayName: vi.fn() }}
          >
            <RoomScreen view={view} commands={{} as RoomCommands} />
          </HeldRoomContext>
        </SessionContext.Provider>
      </I18nProvider>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    expect(session.signIn).toHaveBeenCalledWith('id-token-from-google', true)
  })

  it('says nothing of the kind to an Account', () => {
    renderRoom(roomView())

    expect(screen.queryByRole('region', { name: 'Without an account' })).toBeNull()
  })
})
