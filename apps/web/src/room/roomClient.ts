import type { RejectionReason } from '../backend/api'

/*
 * The Room client: server messages in, the view the Room screen draws out.
 * Message shapes mirror the server's gateway; the two apps share no code (ADR 0001).
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

export interface RoomSnapshot {
  room: RoomSummary
  /** The identity id of this browser's Participant. */
  you: string
  participants: Participant[]
  queue: QueueEntry[]
  /** Null while no Hand is loaded. */
  playback: Playback | null
}

export type { RejectionReason }

export type RoomEvent =
  | { type: 'snapshot'; snapshot: RoomSnapshot }
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
  | { type: 'rejected'; command: string; reason: RejectionReason }
  | { type: 'disconnected' }

export type RoomView =
  | { phase: 'joining' }
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
      /** False once the connection drops: the view is kept but is no longer live. */
      connected: boolean
      /** The last move of the Master role, to announce. Null until one happens. */
      masterChange: MasterChange | null
    }

export const initialRoomView: RoomView = { phase: 'joining' }

export function reduceRoom(view: RoomView, event: RoomEvent): RoomView {
  switch (event.type) {
    case 'snapshot': {
      const { room, you, participants, queue, playback } = event.snapshot
      return { phase: 'in-room', room, you, participants, queue, playback, connected: true, masterChange: null }
    }
    case 'participantJoined':
      if (view.phase !== 'in-room') return view
      return {
        ...view,
        participants: view.participants.some((p) => p.identityId === event.participant.identityId)
          ? view.participants.map((p) => (p.identityId === event.participant.identityId ? event.participant : p))
          : [...view.participants, event.participant],
      }
    case 'participantLeft':
      if (view.phase !== 'in-room') return view
      return { ...view, participants: view.participants.filter((p) => p.identityId !== event.identityId) }
    case 'participantKicked':
      if (view.phase !== 'in-room') return view
      if (event.identityId === view.you) return { phase: 'kicked', room: view.room }
      return { ...view, participants: view.participants.filter((p) => p.identityId !== event.identityId) }
    case 'roomClosed':
      if (view.phase !== 'in-room') return view
      return { phase: 'closed', room: view.room }
    case 'masterChanged': {
      if (view.phase !== 'in-room') return view
      // The role is the only thing that moves: whoever held it becomes a Guest.
      const participants = view.participants.map((p) => ({
        ...p,
        role: p.identityId === event.masterId ? ('master' as const) : ('guest' as const),
      }))
      return { ...view, participants, masterChange: { masterId: event.masterId, reason: event.reason } }
    }
    case 'entriesAdded':
      if (view.phase !== 'in-room') return view
      return { ...view, queue: [...view.queue, ...event.entries] }
    case 'authorChanged':
      if (view.phase !== 'in-room') return view
      return {
        ...view,
        queue: view.queue.map((entry) => (entry.handId === event.handId ? { ...entry, author: event.author } : entry)),
      }
    case 'entriesReordered': {
      if (view.phase !== 'in-room') return view
      const byId = new Map(view.queue.map((entry) => [entry.id, entry]))
      const reordered = event.order
        .map((id) => byId.get(id))
        .filter((entry): entry is QueueEntry => entry !== undefined)
        .map((entry, index) => ({ ...entry, position: index + 1 }))
      return { ...view, queue: reordered }
    }
    case 'entryRemoved':
      if (view.phase !== 'in-room') return view
      return { ...view, queue: view.queue.filter((entry) => entry.id !== event.id) }
    case 'entryRestored': {
      if (view.phase !== 'in-room') return view
      const restored = [...view.queue.filter((entry) => entry.id !== event.entry.id), event.entry]
      restored.sort((a, b) => a.position - b.position)
      return { ...view, queue: restored }
    }
    case 'playbackChanged':
      if (view.phase !== 'in-room') return view
      return { ...view, playback: event.playback }
    case 'rejected':
      return event.command === 'room.join' ? { phase: 'rejected', reason: event.reason } : view
    case 'disconnected':
      if (view.phase === 'in-room') return { ...view, connected: false }
      // A Room that is already over stays as it is: the drop explains nothing.
      return view.phase === 'joining' ? { phase: 'disconnected' } : view
  }
}

/** Turns a raw WebSocket message into a Room event, or null for anything else (e.g. pong). */
export function parseServerMessage(raw: string): RoomEvent | null {
  let message: { event?: unknown; data?: any }
  try {
    message = JSON.parse(raw)
  } catch {
    return null
  }
  const { event, data } = message ?? {}
  if (typeof data !== 'object' || data === null) return null
  switch (event) {
    case 'room.snapshot':
      return { type: 'snapshot', snapshot: data as RoomSnapshot }
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
    case 'rejected':
      return { type: 'rejected', command: String(data.command), reason: data.reason as RejectionReason }
    default:
      return null
  }
}
