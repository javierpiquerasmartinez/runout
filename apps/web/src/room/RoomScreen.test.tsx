import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
    connected: true,
    masterChange: null,
    ...view,
  }
}

function renderRoom(view: InRoom) {
  const commands = {
    handOverMaster: vi.fn(),
    loadHand: vi.fn(),
    goToAction: vi.fn(),
    reassignAuthor: vi.fn(),
    reorderQueue: vi.fn(),
    removeQueueEntry: vi.fn(),
    undoQueueRemoval: vi.fn(),
  } satisfies RoomCommands
  const session = {
    token: 'token',
    identity: { id: view.you, displayName: 'Javier', screenNames: [] },
    rememberDisplayName: () => {},
    rememberScreenNames: () => {},
  }
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <RoomScreen view={view} commands={commands} />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return commands
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
