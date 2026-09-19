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

export interface RoomSnapshot {
  room: RoomSummary
  /** The identity id of this browser's Participant. */
  you: string
  participants: Participant[]
  queue: unknown[]
}

export type { RejectionReason }

export type RoomEvent =
  | { type: 'snapshot'; snapshot: RoomSnapshot }
  | { type: 'participantJoined'; participant: Participant }
  | { type: 'participantLeft'; identityId: string }
  | { type: 'rejected'; command: string; reason: RejectionReason }
  | { type: 'disconnected' }

export type RoomView =
  | { phase: 'joining' }
  | { phase: 'rejected'; reason: RejectionReason }
  | { phase: 'disconnected' }
  | {
      phase: 'in-room'
      room: RoomSummary
      you: string
      participants: Participant[]
      /** False once the connection drops: the view is kept but is no longer live. */
      connected: boolean
    }

export const initialRoomView: RoomView = { phase: 'joining' }

export function reduceRoom(view: RoomView, event: RoomEvent): RoomView {
  switch (event.type) {
    case 'snapshot': {
      const { room, you, participants } = event.snapshot
      return { phase: 'in-room', room, you, participants, connected: true }
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
    case 'rejected':
      return event.command === 'room.join' ? { phase: 'rejected', reason: event.reason } : view
    case 'disconnected':
      return view.phase === 'in-room' ? { ...view, connected: false } : { phase: 'disconnected' }
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
    case 'rejected':
      return { type: 'rejected', command: String(data.command), reason: data.reason as RejectionReason }
    default:
      return null
  }
}
