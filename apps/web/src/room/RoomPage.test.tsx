import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext, type SessionContextValue } from '../identity/context'
import { fakeSession, fakeVisitor } from '../test/fakeSession'
import { HeldRoomContext } from './heldRoomContext'
import { initialRoomView } from './roomClient'
import { RoomPage } from './RoomPage'
import type { RoomCommands } from './useRoom'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ code: 'RNT4K9PX', name: 'Martes NL50' })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The Room's door, as someone arriving from a link finds it. */
function renderDoor(session: SessionContextValue) {
  const confirmDisplayName = vi.fn()
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <HeldRoomContext
          value={{
            code: 'RNT4K9PX',
            view: initialRoomView,
            commands: {} as RoomCommands,
            displayName: null,
            confirmDisplayName,
          }}
        >
          <RoomPage code="RNT4K9PX" />
        </HeldRoomContext>
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return confirmDisplayName
}

async function enterAs(name: string) {
  const field = await screen.findByLabelText('Your name in the room')
  await userEvent.clear(field)
  await userEvent.type(field, name)
  await userEvent.click(screen.getByRole('button', { name: 'Enter the room' }))
}

describe('RoomPage · joining without an Account', () => {
  it('issues an identity for this Room to a visitor once they choose their name', async () => {
    const session = fakeVisitor()
    const confirm = renderDoor(session)

    await enterAs('Marta')

    expect(session.joinAnonymously).toHaveBeenCalledWith('RNT4K9PX', 'Marta')
    expect(confirm).toHaveBeenCalledWith('Marta')
  })

  it('issues a new one to an anonymous identity of another Room', async () => {
    const session = fakeSession({ account: null, room: { code: 'RNT7H2QD' } })
    renderDoor(session)

    await enterAs('Marta')

    expect(session.joinAnonymously).toHaveBeenCalledWith('RNT4K9PX', 'Marta')
  })

  it('lets an Account, or the anonymous identity of this Room, in as it is', async () => {
    const account = fakeSession()
    const confirm = renderDoor(account)
    await enterAs('Javier')

    expect(account.joinAnonymously).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith('Javier')
  })

  it('says why when the Room refuses the identity', async () => {
    const { ApiError } = await import('../backend/api')
    const session = fakeVisitor({
      joinAnonymously: vi.fn(async () => {
        throw new ApiError(404, 'room-not-found')
      }),
    })
    const confirm = renderDoor(session)

    await enterAs('Marta')

    expect(await screen.findByText('There is no open room with that code.')).toBeTruthy()
    expect(confirm).not.toHaveBeenCalled()
  })
})
