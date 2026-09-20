import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { RoomScreen } from './RoomScreen'
import type { Participant, RoomView } from './roomClient'
import type { RoomCommands } from './useRoom'

type InRoom = Extract<RoomView, { phase: 'in-room' }>

const javier: Participant = { identityId: 'id-javier', displayName: 'Javier', role: 'master' }
const marta: Participant = { identityId: 'id-marta', displayName: 'Marta', role: 'guest' }

function roomView(view: Partial<InRoom> = {}): InRoom {
  return {
    phase: 'in-room',
    room: { code: 'RNT4K9PX', name: 'Martes NL50' },
    you: 'id-javier',
    participants: [javier, marta],
    queue: [],
    playback: null,
    revision: 1,
    presence: [],
    sync: { state: 'synced', latencyMs: 42, failedAttempts: 0, awaitingSnapshot: false },
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
    reassignAuthor: vi.fn(),
    reorderQueue: vi.fn(),
    removeQueueEntry: vi.fn(),
    undoQueueRemoval: vi.fn(),
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
        participants: [{ ...javier, role: 'guest' }, { ...marta, role: 'master' }],
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
        participants: [{ ...javier, role: 'guest' }, { ...marta, role: 'master' }],
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
      { ...view, participants: [{ ...javier, role: 'guest' }, { ...marta, role: 'master' }] },
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
      roomView({ sync: { state: 'recovering', latencyMs: 42, failedAttempts: 0, awaitingSnapshot: true } }),
    )
    expect(screen.getByText('LIVE')).toBeTruthy()

    rerenderRoom(
      roomView({ sync: { state: 'offline', latencyMs: 42, failedAttempts: 1, awaitingSnapshot: true } }),
      commands,
    )

    expect(screen.getByText('OFFLINE')).toBeTruthy()
  })
})
