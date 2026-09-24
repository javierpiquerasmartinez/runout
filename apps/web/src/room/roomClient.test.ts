import { describe, expect, it } from 'vitest'
import {
  RELOAD_AFTER_FAILURES,
  initialRoomView,
  parseServerMessage,
  reduceRoom,
  type Note,
  type QueueEntry,
  type RoomChange,
  type RoomEvent,
  type RoomView,
} from './roomClient'

const javier = { identityId: 'id-javier', displayName: 'Javier', role: 'master', screenNames: [] as string[] } as const
const marta = { identityId: 'id-marta', displayName: 'Marta', role: 'guest', screenNames: [] as string[] } as const
const alberto = { identityId: 'id-alberto', displayName: 'Alberto', role: 'guest', screenNames: [] as string[] } as const

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

const note: Note = {
  id: 'note-1',
  seq: 1,
  handId: 'hand-1',
  writer: { identityId: 'id-marta', displayName: 'Marta' },
  body: 'El jam de CO en el turn es forzado.',
  writtenAt: '2026-09-18T13:00:00.000Z',
  editedAt: null,
}

const snapshot: RoomEvent = {
  type: 'snapshot',
  snapshot: {
    room: { code: 'RNT4K9PX', name: 'Martes NL50' },
    you: 'id-marta',
    participants: [javier, marta],
    queue: [],
    playback: null,
    notes: [],
    marks: [],
    revision: 4,
    presence: [],
  },
}

const changeTypes = new Set<string>([
  'participantJoined',
  'participantLeft',
  'participantKicked',
  'participantRenamed',
  'participantChanged',
  'roomClosed',
  'masterChanged',
  'entriesAdded',
  'authorChanged',
  'entriesReordered',
  'entryRemoved',
  'entryRestored',
  'playbackChanged',
  'noteWritten',
  'noteEdited',
  'noteRemoved',
  'noteRestored',
])

/**
 * Applies events in order. A change without a revision of its own is given the
 * next one, as the server would; a change that states one is left alone, so a
 * test can arrange a gap, a duplicate or a change that arrives out of order.
 */
function apply(...events: (RoomEvent | RoomChange)[]): RoomView {
  let revision = 0
  let view = initialRoomView
  for (const event of events) {
    if (event.type === 'snapshot') revision = event.snapshot.revision
    const numbered = changeTypes.has(event.type) && !('revision' in event) ? { ...event, revision: ++revision } : event
    if ('revision' in numbered && typeof numbered.revision === 'number') revision = Math.max(revision, numbered.revision)
    view = reduceRoom(view, numbered as RoomEvent)
  }
  return view
}

const inRoom = (view: RoomView) => (view.phase === 'in-room' ? view : null)

describe('reduceRoom', () => {
  it('is joining until the snapshot arrives', () => {
    expect(initialRoomView).toEqual({ phase: 'joining', failedAttempts: 0 })
  })

  it('lands on the Room from its snapshot, in sync at its revision', () => {
    expect(apply(snapshot)).toEqual({
      phase: 'in-room',
      room: { code: 'RNT4K9PX', name: 'Martes NL50' },
      you: 'id-marta',
      participants: [javier, marta],
      queue: [],
      playback: null,
      notes: [],
      marks: [],
      revision: 4,
      presence: [],
      sync: { state: 'synced', latencyMs: null, failedAttempts: 0, awaitingSnapshot: false, seenRevision: 4 },
      masterChange: null,
    })
  })

  it('lands a late Participant on the loaded Hand at its current Action', () => {
    const view = apply({
      type: 'snapshot',
      snapshot: { ...snapshot.snapshot, queue: [firstHand], playback: { handId: 'hand-1', actionIndex: 4, hideOpponentNames: false } },
    })
    expect(inRoom(view)?.playback).toEqual({ handId: 'hand-1', actionIndex: 4, hideOpponentNames: false })
  })

  it('follows the Playback the Master sets', () => {
    const view = apply(
      snapshot,
      { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 0, hideOpponentNames: false } },
      { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 3, hideOpponentNames: false } },
    )
    expect(inRoom(view)?.playback).toEqual({ handId: 'hand-1', actionIndex: 3, hideOpponentNames: false })
    expect(inRoom(view)?.revision).toBe(6)
  })

  it('ignores Playback that arrives before the snapshot', () => {
    expect(apply({ type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 0, hideOpponentNames: false } })).toEqual(initialRoomView)
  })

  it('keeps the Room as it is when a Playback command is refused', () => {
    const before = apply(snapshot)
    expect(reduceRoom(before, { type: 'rejected', command: 'playback.goTo', reason: 'not-master' })).toBe(before)
  })

  it('lands with the Queue the snapshot carries', () => {
    const view = apply({ type: 'snapshot', snapshot: { ...snapshot.snapshot, queue: [firstHand] } })
    expect(inRoom(view)?.queue).toEqual([firstHand])
  })

  it('appends imported Hands at the end of the Queue', () => {
    const view = apply(
      { type: 'snapshot', snapshot: { ...snapshot.snapshot, queue: [firstHand] } },
      { type: 'entriesAdded', entries: [secondHand], notes: [] },
    )
    expect(inRoom(view)?.queue).toEqual([firstHand, secondHand])
  })

  it('ignores imported Hands that arrive before the snapshot', () => {
    expect(apply({ type: 'entriesAdded', entries: [firstHand], notes: [] })).toEqual(initialRoomView)
  })

  it('puts the Queue in the order the Master gives, resyncing position', () => {
    const view = apply(
      snapshot,
      { type: 'entriesAdded', entries: [firstHand, secondHand], notes: [] },
      { type: 'entriesReordered', order: ['entry-2', 'entry-1'] },
    )

    expect(inRoom(view)?.queue).toEqual([
      { ...secondHand, position: 1 },
      { ...firstHand, position: 2 },
    ])
  })

  it('removes a Queue Entry the Master removes', () => {
    const view = apply(
      snapshot,
      { type: 'entriesAdded', entries: [firstHand, secondHand], notes: [] },
      { type: 'entryRemoved', id: 'entry-1' },
    )

    expect(inRoom(view)?.queue).toEqual([secondHand])
  })

  it('puts a restored Queue Entry back at its position', () => {
    const view = apply(
      snapshot,
      { type: 'entriesAdded', entries: [firstHand, secondHand], notes: [] },
      { type: 'entryRemoved', id: 'entry-1' },
      { type: 'entryRestored', entry: firstHand, notes: [] },
    )

    expect(inRoom(view)?.queue).toEqual([firstHand, secondHand])
  })

  it('gives a Hand in the Queue the Author the Master reassigned it to', () => {
    const view = apply(
      snapshot,
      { type: 'entriesAdded', entries: [firstHand, secondHand], notes: [] },
      { type: 'authorChanged', handId: 'hand-2', author: { identityId: 'id-marta', displayName: 'Marta' } },
    )

    expect(inRoom(view)?.queue.map((entry) => entry.author.identityId)).toEqual(['id-javier', 'id-marta'])
  })

  it('adds a Participant who joins, at the end of the list', () => {
    const view = apply(snapshot, { type: 'participantJoined', participant: alberto })
    expect(inRoom(view)?.participants).toEqual([javier, marta, alberto])
  })

  it('does not list a Participant twice', () => {
    const renamed = { ...marta, displayName: 'Marta R.' }
    const view = apply(snapshot, { type: 'participantJoined', participant: renamed })
    expect(inRoom(view)?.participants).toEqual([javier, renamed])
  })

  it('shows a Participant’s new Display Name everywhere it appears: the list, the Queue and the Notes', () => {
    const view = apply(
      snapshot,
      { type: 'entriesAdded', entries: [firstHand, { ...secondHand, author: note.writer }], notes: [note] },
      { type: 'participantRenamed', identityId: 'id-marta', displayName: 'Marta G.' },
    )

    expect(inRoom(view)?.participants).toEqual([javier, { ...marta, displayName: 'Marta G.' }])
    expect(inRoom(view)?.queue.map((entry) => entry.author.displayName)).toEqual(['Javier', 'Marta G.'])
    expect(inRoom(view)?.notes.map((each) => each.writer.displayName)).toEqual(['Marta G.'])
  })

  it('reads a rename from the wire', () => {
    expect(
      parseServerMessage(
        JSON.stringify({
          event: 'room.participantRenamed',
          data: { identityId: 'id-marta', displayName: 'Marta G.' },
          revision: 5,
        }),
      ),
    ).toEqual({ type: 'participantRenamed', identityId: 'id-marta', displayName: 'Marta G.', revision: 5 })
  })

  it('takes a Participant’s new Screen Names', () => {
    const renamed = { ...marta, screenNames: ['Marta_PS'] }
    const view = apply(snapshot, { type: 'participantChanged', participant: renamed })
    expect(inRoom(view)?.participants).toEqual([javier, renamed])
  })

  it('does not bring back a Participant who has already left when their Screen Names change', () => {
    const view = apply(snapshot, { type: 'participantChanged', participant: { ...alberto, screenNames: ['A'] } })
    expect(inRoom(view)?.participants).toEqual([javier, marta])
  })

  it('follows Hide Opponent Names as the Master switches it', () => {
    const view = apply(
      snapshot,
      { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 3, hideOpponentNames: false } },
      { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 3, hideOpponentNames: true } },
    )
    expect(inRoom(view)?.playback).toEqual({ handId: 'hand-1', actionIndex: 3, hideOpponentNames: true })
  })

  it('moves the Master role to the Participant it was handed to', () => {
    const view = apply(snapshot, { type: 'masterChanged', masterId: 'id-marta', reason: 'handover' })

    expect(inRoom(view)?.participants).toEqual([
      { ...javier, role: 'guest' },
      { ...marta, role: 'master' },
    ])
    expect(inRoom(view)?.masterChange).toEqual({ masterId: 'id-marta', reason: 'handover' })
  })

  it('moves the role when it passes on its own, with the Master already gone', () => {
    const view = apply(
      snapshot,
      { type: 'participantLeft', identityId: 'id-javier' },
      { type: 'masterChanged', masterId: 'id-marta', reason: 'failover' },
    )

    expect(inRoom(view)?.participants).toEqual([{ ...marta, role: 'master' }])
    expect(inRoom(view)?.masterChange).toEqual({ masterId: 'id-marta', reason: 'failover' })
  })

  it('ignores a handover that arrives before the snapshot', () => {
    expect(apply({ type: 'masterChanged', masterId: 'id-marta', reason: 'handover' })).toEqual(initialRoomView)
  })

  it('removes a Participant who leaves', () => {
    const view = apply(snapshot, { type: 'participantLeft', identityId: 'id-javier' })
    expect(inRoom(view)?.participants).toEqual([marta])
  })

  it('ignores Room events that arrive before the snapshot', () => {
    expect(apply({ type: 'participantJoined', participant: alberto })).toEqual(initialRoomView)
  })

  it('shows why joining was refused', () => {
    expect(apply({ type: 'rejected', command: 'room.join', reason: 'room-not-found' })).toEqual({
      phase: 'rejected',
      reason: 'room-not-found',
    })
  })

  it('takes a kicked Participant out of the list for everyone else', () => {
    const view = apply(snapshot, { type: 'participantKicked', identityId: javier.identityId })
    expect(view).toMatchObject({ phase: 'in-room', participants: [marta] })
  })

  it('ends the Room for the Participant who was kicked', () => {
    expect(apply(snapshot, { type: 'participantKicked', identityId: 'id-marta' })).toEqual({
      phase: 'kicked',
      room: { code: 'RNT4K9PX', name: 'Martes NL50' },
    })
  })

  it('shows a closed Room as closed, not as a blank screen', () => {
    expect(apply(snapshot, { type: 'roomClosed' })).toEqual({
      phase: 'closed',
      room: { code: 'RNT4K9PX', name: 'Martes NL50' },
    })
  })

  it('keeps a Room that is over on screen when the connection then drops', () => {
    const closed = apply(snapshot, { type: 'roomClosed' }, { type: 'disconnected' })
    expect(closed).toEqual({ phase: 'closed', room: { code: 'RNT4K9PX', name: 'Martes NL50' } })
    const kicked = apply(snapshot, { type: 'participantKicked', identityId: 'id-marta' }, { type: 'disconnected' })
    expect(kicked).toEqual({ phase: 'kicked', room: { code: 'RNT4K9PX', name: 'Martes NL50' } })
  })
})

describe('reduceRoom, staying in sync', () => {
  it('counts a revision for every change, one after another', () => {
    const view = apply(snapshot, { type: 'participantJoined', participant: alberto }, { type: 'entryRemoved', id: 'x' })
    expect(inRoom(view)?.revision).toBe(6)
  })

  it('leaves the Room exactly as it was when a change arrives twice', () => {
    const before = apply(snapshot, { type: 'entriesAdded', entries: [firstHand], revision: 5, notes: [] })
    const after = reduceRoom(before, { type: 'entriesAdded', entries: [firstHand], revision: 5, notes: [] })

    expect(after).toBe(before)
    expect(inRoom(after)?.queue).toEqual([firstHand])
  })

  it('drops a change older than where the Room already stands', () => {
    const before = apply(snapshot, { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 3, hideOpponentNames: false } })
    const after = reduceRoom(before, {
      type: 'playbackChanged',
      playback: { handId: 'hand-1', actionIndex: 1, hideOpponentNames: false },
      revision: 4,
    })
    expect(after).toBe(before)
  })

  it('stops trusting what it holds the moment a revision is missing', () => {
    const view = apply(snapshot, { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 9, hideOpponentNames: false }, revision: 7 })

    expect(inRoom(view)?.sync).toMatchObject({ state: 'recovering', awaitingSnapshot: true })
    // Nothing of the change is taken: the Room is not half of one state and half of another.
    expect(inRoom(view)?.playback).toBeNull()
    expect(inRoom(view)?.revision).toBe(4)
  })

  it('holds everything back while a snapshot is owed', () => {
    const recovering = apply(snapshot, { type: 'entryRemoved', id: 'entry-1', revision: 9 })
    const after = reduceRoom(recovering, { type: 'participantJoined', participant: alberto, revision: 10 })

    expect(inRoom(after)?.participants).toEqual([javier, marta])
    expect(inRoom(after)?.revision).toBe(4)
    expect(inRoom(after)?.sync).toMatchObject({ state: 'recovering', awaitingSnapshot: true })
  })

  it('takes the end of the Room even with a snapshot owed, rather than waiting for one', () => {
    const recovering = apply(snapshot, { type: 'entryRemoved', id: 'entry-1', revision: 9 })

    // A Room nobody is in any more can no longer answer the resync, so a
    // closure that waited for one would leave the screen recovering forever.
    expect(reduceRoom(recovering, { type: 'roomClosed', revision: 11 })).toEqual({
      phase: 'closed',
      room: { code: 'RNT4K9PX', name: 'Martes NL50' },
    })
    expect(reduceRoom(recovering, { type: 'participantKicked', identityId: 'id-marta', revision: 11 })).toEqual({
      phase: 'kicked',
      room: { code: 'RNT4K9PX', name: 'Martes NL50' },
    })
  })

  it('still waits for the snapshot when it is someone else who was removed', () => {
    const recovering = apply(snapshot, { type: 'entryRemoved', id: 'entry-1', revision: 9 })
    const after = reduceRoom(recovering, { type: 'participantKicked', identityId: 'id-javier', revision: 11 })

    expect(inRoom(after)?.participants).toEqual([javier, marta])
    expect(inRoom(after)?.sync.awaitingSnapshot).toBe(true)
  })

  it('does not call itself caught up on a snapshot the Room has already moved past', () => {
    // A change goes by while the snapshot is being drawn: it is dropped, and
    // the snapshot that lands was drawn before it.
    const view = apply(
      snapshot,
      { type: 'entryRemoved', id: 'entry-1', revision: 9 },
      { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 2, hideOpponentNames: false }, revision: 10 },
      { type: 'snapshot', snapshot: { ...snapshot.snapshot, revision: 8 } },
    )

    expect(inRoom(view)?.revision).toBe(8)
    expect(inRoom(view)?.sync).toMatchObject({ state: 'recovering', awaitingSnapshot: true, seenRevision: 10 })
  })

  it('is caught up once the snapshot is level with everything that went past', () => {
    const view = apply(
      snapshot,
      { type: 'entryRemoved', id: 'entry-1', revision: 9 },
      { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 2, hideOpponentNames: false }, revision: 10 },
      { type: 'snapshot', snapshot: { ...snapshot.snapshot, revision: 10 } },
    )

    expect(inRoom(view)?.sync).toMatchObject({ state: 'synced', awaitingSnapshot: false, seenRevision: 10 })
  })

  it('jumps straight to the Room as it stands when the snapshot comes back', () => {
    const view = apply(
      snapshot,
      { type: 'playbackChanged', playback: { handId: 'hand-1', actionIndex: 9, hideOpponentNames: false }, revision: 7 },
      {
        type: 'snapshot',
        snapshot: { ...snapshot.snapshot, revision: 12, playback: { handId: 'hand-2', actionIndex: 2, hideOpponentNames: false } },
      },
    )

    expect(inRoom(view)?.sync).toMatchObject({ state: 'synced', awaitingSnapshot: false })
    expect(inRoom(view)?.revision).toBe(12)
    expect(inRoom(view)?.playback).toEqual({ handId: 'hand-2', actionIndex: 2, hideOpponentNames: false })
  })

  it('keeps the Room on screen, frozen, when the connection drops', () => {
    const view = apply(snapshot, { type: 'disconnected' })
    expect(view).toMatchObject({ phase: 'in-room', participants: [javier, marta] })
    expect(inRoom(view)?.sync).toMatchObject({ state: 'offline', awaitingSnapshot: true })
  })

  it('is recovering, not offline, from the moment the socket is back', () => {
    const view = apply(snapshot, { type: 'disconnected' }, { type: 'connecting' })
    expect(inRoom(view)?.sync).toMatchObject({ state: 'recovering', awaitingSnapshot: true })
  })

  it('is back in sync once the reconnection is answered with a snapshot', () => {
    const view = apply(
      snapshot,
      { type: 'disconnected' },
      { type: 'reconnectFailed' },
      { type: 'connecting' },
      { type: 'snapshot', snapshot: { ...snapshot.snapshot, revision: 20 } },
    )
    expect(inRoom(view)?.sync).toEqual({
      state: 'synced',
      latencyMs: null,
      failedAttempts: 0,
      awaitingSnapshot: false,
      seenRevision: 20,
    })
  })

  it('counts the reconnections that fail, so a reload can be offered', () => {
    const view = apply(snapshot, ...Array.from({ length: RELOAD_AFTER_FAILURES }, () => ({ type: 'reconnectFailed' }) as const))
    expect(inRoom(view)?.sync).toMatchObject({ state: 'offline', failedAttempts: RELOAD_AFTER_FAILURES })
  })

  it('gives up on a Room it never got into after three tries', () => {
    const failing = { type: 'reconnectFailed' } as const
    expect(apply(failing, failing)).toEqual({ phase: 'joining', failedAttempts: 2 })
    expect(apply(failing, failing, failing)).toEqual({ phase: 'disconnected' })
  })

  it('keeps the round trip it measured across a recovery', () => {
    const view = apply(
      snapshot,
      { type: 'latency', latencyMs: 42 },
      { type: 'disconnected' },
      { type: 'snapshot', snapshot: { ...snapshot.snapshot, revision: 30 } },
    )
    expect(inRoom(view)?.sync.latencyMs).toBe(42)
  })

  it('takes the presence of the Room whenever it is reported, revision or not', () => {
    const presence = [{ identityId: 'id-javier', presence: 'unstable' as const, latencyMs: 120, inSync: false }]
    const view = apply(snapshot, { type: 'presence', participants: presence })
    expect(inRoom(view)?.presence).toEqual(presence)
    expect(inRoom(view)?.revision).toBe(4)
  })
})

describe('reduceRoom · Notes and Marks', () => {
  it('lands with the Notes and this person\u2019s own Marks the snapshot carries', () => {
    const view = apply({ type: 'snapshot', snapshot: { ...snapshot.snapshot, notes: [note], marks: ['hand-1'] } })
    expect(inRoom(view)?.notes).toEqual([note])
    expect(inRoom(view)?.marks).toEqual(['hand-1'])
  })

  it('takes in the Notes a Hand already carries as it joins the Queue', () => {
    const view = apply(snapshot, { type: 'entriesAdded', entries: [firstHand], notes: [note] })
    expect(inRoom(view)?.notes).toEqual([note])
    expect(inRoom(view)?.queue).toEqual([firstHand])
  })

  it('brings a restored Queue Entry\u2019s Notes back with it, without doubling one it kept', () => {
    const view = apply(
      { type: 'snapshot', snapshot: { ...snapshot.snapshot, queue: [firstHand], notes: [note] } },
      { type: 'entryRestored', entry: secondHand, notes: [note] },
    )
    expect(inRoom(view)?.notes).toEqual([note])
  })

  it('adds a Note as it is written, once even if the change arrives twice', () => {
    const view = apply(snapshot, { type: 'noteWritten', note, revision: 5 }, { type: 'noteWritten', note, revision: 5 })
    expect(inRoom(view)?.notes).toEqual([note])
  })

  it('replaces a Note the Master has rewritten, in its place', () => {
    const second: Note = { ...note, id: 'note-2', seq: 2, body: 'Yo pagaria con AQ.' }
    const edited: Note = { ...note, body: 'Jam forzado.', editedAt: '2026-09-18T13:05:00.000Z' }
    const view = apply(
      snapshot,
      { type: 'noteWritten', note },
      { type: 'noteWritten', note: second },
      { type: 'noteEdited', note: edited },
    )
    expect(inRoom(view)?.notes).toEqual([edited, second])
  })

  it('takes a deleted Note away, and puts a restored one back in its place', () => {
    const second: Note = { ...note, id: 'note-2', seq: 2, body: 'Yo pagaria con AQ.' }
    const deleted = apply(
      snapshot,
      { type: 'noteWritten', note },
      { type: 'noteWritten', note: second },
      { type: 'noteRemoved', id: 'note-1' },
    )
    expect(inRoom(deleted)?.notes).toEqual([second])

    const restored = reduceRoom(deleted, { type: 'noteRestored', note, revision: 8 })
    expect(inRoom(restored)?.notes).toEqual([note, second])
  })

  it('takes a Mark on and off for its own person, without touching the revision', () => {
    const marked = apply(snapshot, { type: 'markChanged', handId: 'hand-1', marked: true })
    expect(inRoom(marked)?.marks).toEqual(['hand-1'])
    expect(inRoom(marked)?.revision).toBe(4)

    const unmarked = reduceRoom(marked, { type: 'markChanged', handId: 'hand-1', marked: false })
    expect(inRoom(unmarked)?.marks).toEqual([])
  })
})

describe('parseServerMessage', () => {
  const changed = (event: string, data: unknown, revision = 3) =>
    parseServerMessage(JSON.stringify({ event, data, revision }))

  it('reads a change of the Room at the revision it carries', () => {
    expect(changed('room.participantLeft', { identityId: 'x' })).toEqual({
      type: 'participantLeft',
      identityId: 'x',
      revision: 3,
    })
    expect(changed('room.participantKicked', { identityId: 'x' })).toEqual({
      type: 'participantKicked',
      identityId: 'x',
      revision: 3,
    })
    expect(changed('room.closed', {})).toEqual({ type: 'roomClosed', revision: 3 })
    expect(changed('queue.entriesAdded', { entries: [firstHand], notes: [note] })).toEqual({
      type: 'entriesAdded',
      entries: [firstHand],
      notes: [note],
      revision: 3,
    })
    expect(changed('playback.changed', { handId: 'hand-1', actionIndex: 2, hideOpponentNames: false })).toEqual({
      type: 'playbackChanged',
      playback: { handId: 'hand-1', actionIndex: 2, hideOpponentNames: false },
      revision: 3,
    })
    expect(changed('playback.changed', { handId: 'hand-1', actionIndex: 2, hideOpponentNames: true })).toMatchObject({
      playback: { hideOpponentNames: true },
    })
    expect(changed('room.participantChanged', { participant: { ...marta, screenNames: ['Marta_PS'] } })).toEqual({
      type: 'participantChanged',
      participant: { ...marta, screenNames: ['Marta_PS'] },
      revision: 3,
    })
    expect(
      changed('queue.authorChanged', { handId: 'hand-1', author: { identityId: 'id-marta', displayName: 'Marta' } }),
    ).toEqual({
      type: 'authorChanged',
      handId: 'hand-1',
      author: { identityId: 'id-marta', displayName: 'Marta' },
      revision: 3,
    })
    expect(changed('queue.reordered', { order: ['entry-2', 'entry-1'] })).toEqual({
      type: 'entriesReordered',
      order: ['entry-2', 'entry-1'],
      revision: 3,
    })
    expect(changed('queue.entryRemoved', { id: 'entry-1' })).toEqual({ type: 'entryRemoved', id: 'entry-1', revision: 3 })
    expect(changed('queue.entryRestored', { entry: firstHand, notes: [note] })).toEqual({
      type: 'entryRestored',
      entry: firstHand,
      notes: [note],
      revision: 3,
    })
    expect(changed('room.masterChanged', { masterId: 'id-marta', reason: 'failover' })).toEqual({
      type: 'masterChanged',
      masterId: 'id-marta',
      reason: 'failover',
      revision: 3,
    })
    expect(changed('notes.written', { note })).toEqual({ type: 'noteWritten', note, revision: 3 })
    expect(changed('notes.edited', { note })).toEqual({ type: 'noteEdited', note, revision: 3 })
    expect(changed('notes.removed', { id: 'note-1' })).toEqual({ type: 'noteRemoved', id: 'note-1', revision: 3 })
    expect(changed('notes.restored', { note })).toEqual({ type: 'noteRestored', note, revision: 3 })
  })

  it('reads a Mark, which is this person\u2019s alone and carries no revision', () => {
    expect(parseServerMessage(JSON.stringify({ event: 'hand.markChanged', data: { handId: 'hand-1', marked: true } }))).toEqual(
      { type: 'markChanged', handId: 'hand-1', marked: true },
    )
  })

  it('reads a snapshot, a presence report and a refusal, none of which carry one', () => {
    expect(parseServerMessage(JSON.stringify({ event: 'room.snapshot', data: snapshot.snapshot }))).toEqual(snapshot)
    expect(
      parseServerMessage(JSON.stringify({ event: 'room.presence', data: { participants: [] } })),
    ).toEqual({ type: 'presence', participants: [] })
    expect(
      parseServerMessage(JSON.stringify({ event: 'rejected', data: { command: 'room.join', reason: 'room-not-found' } })),
    ).toEqual({ type: 'rejected', command: 'room.join', reason: 'room-not-found' })
  })

  it('drops a change with no revision, which could not be put in its place', () => {
    expect(parseServerMessage(JSON.stringify({ event: 'room.closed', data: {} }))).toBeNull()
  })

  it('ignores anything that is not a Room event', () => {
    expect(parseServerMessage(JSON.stringify({ event: 'pong', data: { sentAt: 1 } }))).toBeNull()
    expect(parseServerMessage('not json')).toBeNull()
  })
})
