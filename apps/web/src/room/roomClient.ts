import type { RejectionReason } from '../backend/api'

/*
 * The Room client: server messages in, the view the Room screen draws out.
 * Message shapes mirror the server's gateway; the two apps share no code (ADR 0001).
 *
 * Everything here is a pure function of what has arrived so far. Opening the
 * socket, heartbeats and reconnection are the connection manager's (see
 * `roomConnection.ts`); this side only ever reads what it is handed.
 */

export type Role = 'master' | 'guest'

export interface Participant {
  identityId: string
  displayName: string
  role: Role
}

export interface RoomSummary {
  code: string
  name: string
}

export interface Author {
  identityId: string
  displayName: string
}

/** A Queue row as every Participant sees it. Mirrors the server's shape. */
export interface QueueEntry {
  id: string
  handId: string
  position: number
  author: Author
  /** With `siteHandId`, which real-world hand this is: two entries sharing both are it from two seats. */
  site: 'pokerstars' | 'ggpoker' | 'winamax'
  siteHandId: string
  playedAt: string
  stake: {
    limit: 'no-limit' | 'pot-limit' | 'fixed-limit'
    smallBlind: number
    bigBlind: number
    currency: string
  }
  summary: {
    positions: string[]
    finalPot: number
    finalStreet: 'preflop' | 'flop' | 'turn' | 'river'
    showdown: boolean
  }
}

/** The Room's shared replay state. The Hand itself is fetched by id. */
export interface Playback {
  handId: string
  /** 0 is the Initial State; n is the table after Action n. */
  actionIndex: number
}

/** The Master role moving, and why: handed over, or passed on after a drop. */
export interface MasterChange {
  masterId: string
  reason: 'handover' | 'failover'
}

/** How well a Participant is keeping up, as the server reads their heartbeats. */
export type Presence = 'connected' | 'unstable' | 'away'

/** One Participant's side of the Room, as the server last heard it. */
export interface ParticipantPresence {
  identityId: string
  presence: Presence
  /** The round trip they last measured, in ms; null before their first heartbeat. */
  latencyMs: number | null
  /** Whether they have applied the Room's current revision. */
  inSync: boolean
}

export interface RoomSnapshot {
  room: RoomSummary
  /** The identity id of this browser's Participant. */
  you: string
  participants: Participant[]
  queue: QueueEntry[]
  /** Null while no Hand is loaded. */
  playback: Playback | null
  /** The revision this snapshot is at; every later change carries a higher one. */
  revision: number
  presence: ParticipantPresence[]
}

/** Whether what is on screen is the Room as it stands right now. */
export type SyncState = 'synced' | 'recovering' | 'offline'

export interface RoomSync {
  state: SyncState
  /** The round trip to the server in ms; null until the first heartbeat is answered. */
  latencyMs: number | null
  /** Reconnections that have failed in a row; from `RELOAD_AFTER_FAILURES` a reload is offered. */
  failedAttempts: number
  /** True while what is held is not to be trusted and a full snapshot is owed. */
  awaitingSnapshot: boolean
  /**
   * The highest revision that has gone past on the wire, applied or dropped.
   * A snapshot that comes back older than this was already out of date when
   * it was drawn, and another is asked for.
   */
  seenRevision: number
}

/** How many reconnections have to fail before a reload is worth offering. */
export const RELOAD_AFTER_FAILURES = 3

export type { RejectionReason }

/**
 * One change to the Room's shared state. Each arrives at the revision it
 * produced, and applying the same one twice leaves the Room exactly as it was:
 * a snapshot may already hold a change that is still on its way.
 */
export type RoomChange =
  | { type: 'participantJoined'; participant: Participant }
  | { type: 'participantLeft'; identityId: string }
  | { type: 'participantKicked'; identityId: string }
  | { type: 'roomClosed' }
  | ({ type: 'masterChanged' } & MasterChange)
  | { type: 'entriesAdded'; entries: QueueEntry[] }
  | { type: 'authorChanged'; handId: string; author: Author }
  | { type: 'entriesReordered'; order: string[] }
  | { type: 'entryRemoved'; id: string }
  | { type: 'entryRestored'; entry: QueueEntry }
  | { type: 'playbackChanged'; playback: Playback }

export type RoomEvent =
  | { type: 'snapshot'; snapshot: RoomSnapshot }
  /** The Room's presence, which carries no revision: each report replaces the last. */
  | { type: 'presence'; participants: ParticipantPresence[] }
  | { type: 'latency'; latencyMs: number }
  /** The socket is open again; the Room as it stands is on its way. */
  | { type: 'connecting' }
  | { type: 'disconnected' }
  | { type: 'reconnectFailed' }
  | { type: 'rejected'; command: string; reason: RejectionReason }
  | (RoomChange & { revision: number })

export type RoomView =
  | { phase: 'joining'; failedAttempts: number }
  | { phase: 'rejected'; reason: RejectionReason }
  | { phase: 'disconnected' }
  /** The Master removed you; this Room is over for you and never takes you back. */
  | { phase: 'kicked'; room: RoomSummary }
  /** The session ended, for everyone. A closed Room never reopens. */
  | { phase: 'closed'; room: RoomSummary }
  | {
      phase: 'in-room'
      room: RoomSummary
      you: string
      participants: Participant[]
      queue: QueueEntry[]
      playback: Playback | null
      /** The revision of the last change applied: where this view stands. */
      revision: number
      presence: ParticipantPresence[]
      sync: RoomSync
      /** The last move of the Master role, to announce. Null until one happens. */
      masterChange: MasterChange | null
    }

type InRoom = Extract<RoomView, { phase: 'in-room' }>

export const initialRoomView: RoomView = { phase: 'joining', failedAttempts: 0 }

export function reduceRoom(view: RoomView, event: RoomEvent): RoomView {
  switch (event.type) {
    case 'snapshot': {
      // Whatever was held is dropped: this is the Room as it stands.
      const { room, you, participants, queue, playback, revision, presence } = event.snapshot
      const held = view.phase === 'in-room' ? view : null
      const seenRevision = Math.max(held?.sync.seenRevision ?? 0, revision)
      // Changes can go past while a snapshot is being drawn. One that lands
      // behind them is still better than what was held, and is taken — but it
      // is not the Room as it stands, so another is owed.
      const stale = revision < seenRevision
      return {
        phase: 'in-room',
        room,
        you,
        participants,
        queue,
        playback,
        revision,
        presence,
        sync: {
          state: stale ? 'recovering' : 'synced',
          latencyMs: held?.sync.latencyMs ?? null,
          // Getting an answer at all means the connection is back.
          failedAttempts: 0,
          awaitingSnapshot: stale,
          seenRevision,
        },
        // A recovery is not news: an announcement being read stays on screen.
        masterChange: held?.masterChange ?? null,
      }
    }
    case 'presence':
      if (view.phase !== 'in-room') return view
      return { ...view, presence: event.participants }
    case 'latency':
      if (view.phase !== 'in-room') return view
      return { ...view, sync: { ...view.sync, latencyMs: event.latencyMs } }
    case 'connecting':
      if (view.phase !== 'in-room') return view
      // Back on the wire, but nothing that happened while away has been heard.
      return recovering(view)
    case 'disconnected':
      if (view.phase !== 'in-room') return view
      return { ...view, sync: { ...view.sync, state: 'offline', awaitingSnapshot: true } }
    case 'reconnectFailed': {
      if (view.phase === 'joining') {
        const failedAttempts = view.failedAttempts + 1
        // Never in, and not getting in: only a reload is left to offer.
        return failedAttempts >= RELOAD_AFTER_FAILURES ? { phase: 'disconnected' } : { phase: 'joining', failedAttempts }
      }
      if (view.phase !== 'in-room') return view
      return {
        ...view,
        sync: { ...view.sync, state: 'offline', awaitingSnapshot: true, failedAttempts: view.sync.failedAttempts + 1 },
      }
    }
    case 'rejected':
      return event.command === 'room.join' ? { phase: 'rejected', reason: event.reason } : view
    default:
      return applyChange(view, event)
  }
}

/**
 * A change to the Room's shared state, in its place in the run of revisions:
 * one already held is dropped, and one that leaves a hole means everything
 * held could be wrong, so the Room is asked for afresh.
 */
function applyChange(view: RoomView, change: RoomChange & { revision: number }): RoomView {
  if (view.phase !== 'in-room') return view
  const seen = withSeen(view, change.revision)
  // The end of a Room is the end of it: no snapshot will ever say otherwise,
  // so it lands whatever else is owed, rather than waiting for one that a
  // Room nobody is in any more can no longer answer.
  if (endsTheRoom(change, view.you)) return applied(seen, change)
  if (seen.sync.awaitingSnapshot) return seen
  if (change.revision <= seen.revision) return seen
  if (change.revision > seen.revision + 1) return recovering(seen)
  const next = applied(seen, change)
  return next.phase === 'in-room' ? { ...next, revision: change.revision } : next
}

/** Whether this change is the last word for the Participant reading it. */
function endsTheRoom(change: RoomChange, you: string): boolean {
  return change.type === 'roomClosed' || (change.type === 'participantKicked' && change.identityId === you)
}

/** Records that this revision has gone past, whether or not it was applied. */
function withSeen(view: InRoom, revision: number): InRoom {
  const seenRevision = Math.max(view.sync.seenRevision, revision)
  if (seenRevision === view.sync.seenRevision) return view
  return { ...view, sync: { ...view.sync, seenRevision } }
}

/** What is on screen is no longer the Room: a full snapshot is owed. */
function recovering(view: InRoom): InRoom {
  return { ...view, sync: { ...view.sync, state: 'recovering', awaitingSnapshot: true } }
}

function applied(view: InRoom, change: RoomChange): RoomView {
  switch (change.type) {
    case 'participantJoined':
      return {
        ...view,
        participants: view.participants.some((p) => p.identityId === change.participant.identityId)
          ? view.participants.map((p) => (p.identityId === change.participant.identityId ? change.participant : p))
          : [...view.participants, change.participant],
      }
    case 'participantLeft':
      return { ...view, participants: view.participants.filter((p) => p.identityId !== change.identityId) }
    case 'participantKicked':
      if (change.identityId === view.you) return { phase: 'kicked', room: view.room }
      return { ...view, participants: view.participants.filter((p) => p.identityId !== change.identityId) }
    case 'roomClosed':
      return { phase: 'closed', room: view.room }
    case 'masterChanged': {
      // The role is the only thing that moves: whoever held it becomes a Guest.
      const participants = view.participants.map((p) => ({
        ...p,
        role: p.identityId === change.masterId ? ('master' as const) : ('guest' as const),
      }))
      return { ...view, participants, masterChange: { masterId: change.masterId, reason: change.reason } }
    }
    case 'entriesAdded': {
      const held = new Set(view.queue.map((entry) => entry.id))
      return { ...view, queue: [...view.queue, ...change.entries.filter((entry) => !held.has(entry.id))] }
    }
    case 'authorChanged':
      return {
        ...view,
        queue: view.queue.map((entry) => (entry.handId === change.handId ? { ...entry, author: change.author } : entry)),
      }
    case 'entriesReordered': {
      const byId = new Map(view.queue.map((entry) => [entry.id, entry]))
      const reordered = change.order
        .map((id) => byId.get(id))
        .filter((entry): entry is QueueEntry => entry !== undefined)
        .map((entry, index) => ({ ...entry, position: index + 1 }))
      return { ...view, queue: reordered }
    }
    case 'entryRemoved':
      return { ...view, queue: view.queue.filter((entry) => entry.id !== change.id) }
    case 'entryRestored': {
      const restored = [...view.queue.filter((entry) => entry.id !== change.entry.id), change.entry]
      restored.sort((a, b) => a.position - b.position)
      return { ...view, queue: restored }
    }
    case 'playbackChanged':
      return { ...view, playback: change.playback }
  }
}

/** Turns a raw WebSocket message into a Room event, or null for anything else. */
export function parseServerMessage(raw: string): RoomEvent | null {
  let message: { event?: unknown; data?: any; revision?: unknown }
  try {
    message = JSON.parse(raw)
  } catch {
    return null
  }
  const { event, data, revision } = message ?? {}
  if (typeof data !== 'object' || data === null) return null
  switch (event) {
    case 'room.snapshot':
      return { type: 'snapshot', snapshot: data as RoomSnapshot }
    case 'room.presence':
      return { type: 'presence', participants: data.participants as ParticipantPresence[] }
    case 'rejected':
      return { type: 'rejected', command: String(data.command), reason: data.reason as RejectionReason }
    default: {
      const change = parseChange(event, data)
      // A change without its place in the run would be applied out of order.
      if (!change || typeof revision !== 'number') return null
      return { ...change, revision }
    }
  }
}

function parseChange(event: unknown, data: any): RoomChange | null {
  switch (event) {
    case 'room.participantJoined':
      return { type: 'participantJoined', participant: data.participant as Participant }
    case 'room.participantLeft':
      return { type: 'participantLeft', identityId: String(data.identityId) }
    case 'room.participantKicked':
      return { type: 'participantKicked', identityId: String(data.identityId) }
    case 'room.closed':
      return { type: 'roomClosed' }
    case 'room.masterChanged':
      return {
        type: 'masterChanged',
        masterId: String(data.masterId),
        reason: data.reason === 'failover' ? 'failover' : 'handover',
      }
    case 'queue.entriesAdded':
      return { type: 'entriesAdded', entries: data.entries as QueueEntry[] }
    case 'queue.authorChanged':
      return { type: 'authorChanged', handId: String(data.handId), author: data.author as Author }
    case 'queue.reordered':
      return { type: 'entriesReordered', order: (data.order as unknown[]).map(String) }
    case 'queue.entryRemoved':
      return { type: 'entryRemoved', id: String(data.id) }
    case 'queue.entryRestored':
      return { type: 'entryRestored', entry: data.entry as QueueEntry }
    case 'playback.changed':
      return { type: 'playbackChanged', playback: { handId: String(data.handId), actionIndex: Number(data.actionIndex) } }
    default:
      return null
  }
}
