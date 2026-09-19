import { describe, expect, it } from 'vitest'
import {
  initialRoomView,
  parseServerMessage,
  reduceRoom,
  type QueueEntry,
  type RoomEvent,
  type RoomView,
} from './roomClient'

const javier = { identityId: 'id-javier', displayName: 'Javier', role: 'master' } as const
const marta = { identityId: 'id-marta', displayName: 'Marta', role: 'guest' } as const
const alberto = { identityId: 'id-alberto', displayName: 'Alberto', role: 'guest' } as const

const firstHand: QueueEntry = {
  id: 'entry-1',
  handId: 'hand-1',
  position: 1,
  author: { identityId: 'id-javier', displayName: 'Javier' },
  playedAt: '2026-09-18T12:34:30.000Z',
  stake: { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
  summary: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river', showdown: true },
}
const secondHand: QueueEntry = { ...firstHand, id: 'entry-2', handId: 'hand-2', position: 2 }

const snapshot: RoomEvent = {
  type: 'snapshot',
  snapshot: {
    room: { code: 'RNT4K9PX', name: 'Martes NL50' },
    you: 'id-marta',
    participants: [javier, marta],
    queue: [],
    playback: null,
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
      queue: [],
      playback: null,
      connected: true,
    })
  })

  it('lands a late Participant on the loaded Hand at its current Action', () => {
    const view = apply({
      type: 'snapshot',
      snapshot: { ...snapshot.snapshot, queue: [firstHand], playback: { handId: 'hand-1', actionIndex: 4 } },
    })
    expect(view.phase === 'in-room' && view.playback).toEqual({ handId: 'hand-1', actionIndex: 4 })
  })

  it('follows the Playback the Master sets', () => {
    const view = apply(
      snapshot,
      { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 0 } },
      { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 3 } },
    )
    expect(view.phase === 'in-room' && view.playback).toEqual({ handId: 'hand-1', actionIndex: 3 })
  })

  it('ignores Playback that arrives before the snapshot', () => {
    expect(apply({ type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 0 } })).toEqual({
      phase: 'joining',
    })
  })

  it('keeps the Room as it is when a Playback command is refused', () => {
    const before = apply(snapshot)
    expect(reduceRoom(before, { type: 'rejected', command: 'playback.goTo', reason: 'not-master' })).toBe(before)
  })

  it('lands with the Queue the snapshot carries', () => {
    const view = apply({
      type: 'snapshot',
      snapshot: { ...snapshot.snapshot, queue: [firstHand] },
    })
    expect(view.phase === 'in-room' && view.queue).toEqual([firstHand])
  })

  it('appends imported Hands at the end of the Queue', () => {
    const view = apply(
      { type: 'snapshot', snapshot: { ...snapshot.snapshot, queue: [firstHand] } },
      { type: 'entriesAdded', entries: [secondHand] },
    )
    expect(view.phase === 'in-room' && view.queue).toEqual([firstHand, secondHand])
  })

  it('ignores imported Hands that arrive before the snapshot', () => {
    expect(apply({ type: 'entriesAdded', entries: [firstHand] })).toEqual({ phase: 'joining' })
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
    expect(
      parseServerMessage(JSON.stringify({ event: 'queue.entriesAdded', data: { entries: [firstHand] } })),
    ).toEqual({ type: 'entriesAdded', entries: [firstHand] })
    expect(
      parseServerMessage(JSON.stringify({ event: 'playback.changed', data: { handId: 'hand-1', actionIndex: 2 } })),
    ).toEqual({ type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 2 } })
  })

  it('ignores anything that is not a Room event', () => {
    expect(parseServerMessage(JSON.stringify({ event: 'pong', data: { sentAt: 1 } }))).toBeNull()
    expect(parseServerMessage('not json')).toBeNull()
  })
})
