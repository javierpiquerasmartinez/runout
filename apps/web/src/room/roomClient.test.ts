import { describe, expect, it } from 'vitest'
import { initialRoomView, parseServerMessage, reduceRoom, type RoomEvent, type RoomView } from './roomClient'

const javier = { identityId: 'id-javier', displayName: 'Javier', role: 'master' } as const
const marta = { identityId: 'id-marta', displayName: 'Marta', role: 'guest' } as const
const alberto = { identityId: 'id-alberto', displayName: 'Alberto', role: 'guest' } as const

const snapshot: RoomEvent = {
  type: 'snapshot',
  snapshot: {
    room: { code: 'RNT4K9PX', name: 'Martes NL50' },
    you: 'id-marta',
    participants: [javier, marta],
    queue: [],
  },
}

function apply(...events: RoomEvent[]): RoomView {
  return events.reduce(reduceRoom, initialRoomView)
}

describe('reduceRoom', () => {
  it('is joining until the snapshot arrives', () => {
    expect(initialRoomView).toEqual({ phase: 'joining' })
  })

  it('lands on the Room from its snapshot', () => {
    expect(apply(snapshot)).toEqual({
      phase: 'in-room',
      room: { code: 'RNT4K9PX', name: 'Martes NL50' },
      you: 'id-marta',
      participants: [javier, marta],
      connected: true,
    })
  })

  it('adds a Participant who joins, at the end of the list', () => {
    const view = apply(snapshot, { type: 'participantJoined', participant: alberto })
    expect(view.phase === 'in-room' && view.participants).toEqual([javier, marta, alberto])
  })

  it('does not list a Participant twice', () => {
    const renamed = { ...marta, displayName: 'Marta R.' }
    const view = apply(snapshot, { type: 'participantJoined', participant: renamed })
    expect(view.phase === 'in-room' && view.participants).toEqual([javier, renamed])
  })

  it('removes a Participant who leaves', () => {
    const view = apply(snapshot, { type: 'participantLeft', identityId: 'id-javier' })
    expect(view.phase === 'in-room' && view.participants).toEqual([marta])
  })

  it('ignores Room events that arrive before the snapshot', () => {
    expect(apply({ type: 'participantJoined', participant: alberto })).toEqual({ phase: 'joining' })
  })

  it('shows why joining was refused', () => {
    expect(apply({ type: 'rejected', command: 'room.join', reason: 'room-not-found' })).toEqual({
      phase: 'rejected',
      reason: 'room-not-found',
    })
  })

  it('keeps the Room on screen, marked disconnected, when the connection drops', () => {
    const view = apply(snapshot, { type: 'disconnected' })
    expect(view).toMatchObject({ phase: 'in-room', connected: false, participants: [javier, marta] })
  })

  it('reports a drop before joining as disconnected', () => {
    expect(apply({ type: 'disconnected' })).toEqual({ phase: 'disconnected' })
  })
})

describe('parseServerMessage', () => {
  it('reads Room events from the server', () => {
    expect(parseServerMessage(JSON.stringify({ event: 'room.participantLeft', data: { identityId: 'x' } }))).toEqual({
      type: 'participantLeft',
      identityId: 'x',
    })
    expect(
      parseServerMessage(JSON.stringify({ event: 'rejected', data: { command: 'room.join', reason: 'room-not-found' } })),
    ).toEqual({ type: 'rejected', command: 'room.join', reason: 'room-not-found' })
  })

  it('ignores anything that is not a Room event', () => {
    expect(parseServerMessage(JSON.stringify({ event: 'pong', data: { sentAt: 1 } }))).toBeNull()
    expect(parseServerMessage('not json')).toBeNull()
  })
})
