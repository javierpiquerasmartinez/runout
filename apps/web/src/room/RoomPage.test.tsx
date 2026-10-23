import { render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext, type SessionContextValue } from '../identity/context'
import { fakeGoogleIdentity } from '../test/fakeGoogle'
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
  vi.unstubAllEnvs()
})

/** The Room's door, as someone arriving from a link finds it. */
function renderDoor(session: SessionContextValue) {
  const confirmDisplayName = vi.fn()
  render(<Door session={session} confirmDisplayName={confirmDisplayName} />)
  return confirmDisplayName
}

/** The door around a session that changes as the real one does: signing in makes this browser an Account. */
function Door({ session, confirmDisplayName }: { session: SessionContextValue; confirmDisplayName: () => void }) {
  const [current, setCurrent] = useState(session)
  const signIn = vi.fn(async () => setCurrent(fakeSession()))
  return (
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={{ ...current, signIn }}>
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
    </I18nProvider>
  )
}

async function enterWithoutAccountAs(name: string) {
  const field = await screen.findByLabelText('Your name in this room')
  await userEvent.clear(field)
  await userEvent.type(field, name)
  await userEvent.click(screen.getByRole('button', { name: 'Enter without an account' }))
}

describe('RoomPage · the door, without an identity for this Room', () => {
  it("shows the Room's name and the two ways in", async () => {
    const google = fakeGoogleIdentity()
    renderDoor(fakeVisitor())

    expect(await screen.findByRole('heading', { name: 'Martes NL50' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeTruthy()
    expect(google.renderButton).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ text: 'continue_with' }))
    expect(screen.getByRole('button', { name: 'Enter without an account' })).toBeTruthy()
  })

  it("goes in under the Account's Display Name once signed in with Google there", async () => {
    fakeGoogleIdentity()
    const confirm = renderDoor(fakeVisitor())

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    await waitFor(() => expect(confirm).toHaveBeenCalledWith('Javier'))
  })

  it('issues an identity for this Room only once a visitor chooses their name', async () => {
    const session = fakeVisitor()
    const confirm = renderDoor(session)

    await enterWithoutAccountAs('Marta')

    expect(session.joinAnonymously).toHaveBeenCalledWith('RNT4K9PX', 'Marta')
    expect(confirm).toHaveBeenCalledWith('Marta')
  })

  it('asks for a name before entering without an account', async () => {
    const session = fakeVisitor()
    const confirm = renderDoor(session)

    await userEvent.click(await screen.findByRole('button', { name: 'Enter without an account' }))

    expect(await screen.findByText('Enter a name of 1 to 40 characters.')).toBeTruthy()
    expect(session.joinAnonymously).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('offers the same two ways to an anonymous identity of another Room', async () => {
    const session = fakeSession({ account: null, room: { code: 'RNT7H2QD' }, displayName: 'Marta' })
    renderDoor(session)

    await enterWithoutAccountAs('Marta')

    expect(session.joinAnonymously).toHaveBeenCalledWith('RNT4K9PX', 'Marta')
  })

  it('says why when the Room refuses the identity', async () => {
    const { ApiError } = await import('../backend/api')
    const session = fakeVisitor({
      joinAnonymously: vi.fn(async () => {
        throw new ApiError(404, 'room-not-found')
      }),
    })
    const confirm = renderDoor(session)

    await enterWithoutAccountAs('Marta')

    expect(await screen.findByText('There is no open room with that code.')).toBeTruthy()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('never calls entering without an account entering as a guest', async () => {
    fakeGoogleIdentity()
    renderDoor(fakeVisitor())

    await screen.findByRole('heading', { name: 'Martes NL50' })
    expect(screen.queryByText(/guest|invited/i)).toBeNull()
  })
})

describe('RoomPage · the door, with an identity for this Room', () => {
  it.each([
    ['an Account', fakeSession(), 'Javier'],
    ['the anonymous identity of this Room', fakeSession({ account: null, room: { code: 'RNT4K9PX' }, displayName: 'Marta' }), 'Marta'],
  ])('lets %s straight in under its Display Name', async (_, session, name) => {
    const confirm = renderDoor(session)

    await waitFor(() => expect(confirm).toHaveBeenCalledWith(name))
    expect(screen.queryByRole('button', { name: 'Enter without an account' })).toBeNull()
  })
})
