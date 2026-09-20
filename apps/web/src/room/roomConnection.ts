import { socketUrl } from '../backend/ping'
import { parseServerMessage, type RoomEvent } from './roomClient'

/*
 * The other half of the Room client: the connection manager. It owns the
 * socket, the heartbeats and getting back in after a drop, and hands the pure
 * reducer (`roomClient.ts`) one event at a time. Nothing here decides what the
 * Room looks like.
 */

/** How often a client says it is still there, and how far behind the Room it is. */
export const HEARTBEAT_EVERY_MS = 5_000
/** The shortest gap between two heartbeats, so stepping fast is not a storm. */
export const HEARTBEAT_MIN_GAP_MS = 250
/** How long each reconnection waits, one step further down after every failure. */
export const RECONNECT_BACKOFF_MS = [500, 1_000, 2_000, 5_000, 10_000]
/** How long to wait before asking for the Room again, when the answer never came. */
export const RESYNC_RETRY_MS = 2_000

/** The socket the manager drives. A real WebSocket is one; a test's fake is another. */
export interface RoomSocket {
  send(message: string): void
  close(): void
}

export interface RoomSocketHandlers {
  onOpen(): void
  onMessage(raw: string): void
  onClose(): void
}

export interface RoomConnectionOptions {
  code: string
  displayName: string
  token: string
  /** Every event the Room produces, in the order it happened. */
  onEvent(event: RoomEvent): void
  /** Opens a socket to `url`. Defaults to a real WebSocket. */
  open?(url: string, handlers: RoomSocketHandlers): RoomSocket
  /** Runs `callback` after `delayMs` and returns a cancel. Defaults to `setTimeout`. */
  schedule?(delayMs: number, callback: () => void): () => void
  now?(): number
}

/**
 * Keeps one Participant on the wire: joins the Room, beats every few seconds,
 * and comes back after a drop without anyone reloading. Every socket it opens
 * asks for the Room as it stands, so a reconnection never leaves a hole.
 */
export class RoomConnection {
  private readonly options: Required<RoomConnectionOptions>
  private socket: RoomSocket | null = null
  private open = false
  /** Whether the socket now in hand has been given the Room; a close before that is a failure. */
  private joined = false
  private stopped = false
  private attempts = 0
  /** Which socket is the one in hand: an older one's events are not this Room's. */
  private generation = 0
  /** The last revision the reducer has applied, as reported in every heartbeat. */
  private revision = 0
  private latencyMs: number | null = null
  private lastBeatAt = Number.NEGATIVE_INFINITY
  private cancelBeat: (() => void) | null = null
  private cancelRetry: (() => void) | null = null

  constructor(options: RoomConnectionOptions) {
    this.options = {
      open: openWebSocket,
      schedule: scheduleWithTimeout,
      now: () => Date.now(),
      ...options,
    }
    this.connect()
  }

  /** Sends a command to the Room. Dropped while the socket is down. */
  send(event: string, data: unknown = {}): void {
    if (this.open) this.socket?.send(JSON.stringify({ event, data }))
  }

  /**
   * Says where the reducer now stands, and tells the Room at once, so the
   * Master sees who is following without waiting for the next beat.
   */
  report(revision: number): void {
    if (revision === this.revision) return
    this.revision = revision
    this.beat()
  }

  /** Asks for the Room as it stands, after a revision nobody saw arrive. */
  resync(): void {
    this.send('room.resync')
  }

  /** Walks out of the Room and stops coming back. */
  close(): void {
    this.stopped = true
    this.generation += 1
    this.cancelBeat?.()
    this.cancelRetry?.()
    if (this.open) this.send('room.leave')
    this.socket?.close()
    this.socket = null
    this.open = false
  }

  private connect(): void {
    this.cancelRetry = null
    this.joined = false
    // Only the socket in hand is listened to, so one closing never speaks for a later one.
    const generation = ++this.generation
    const inHand = () => generation === this.generation && !this.stopped
    const url = `${socketUrl('/ws')}?token=${encodeURIComponent(this.options.token)}`
    this.socket = this.options.open(url, {
      onOpen: () => inHand() && this.opened(),
      onMessage: (raw) => inHand() && this.received(raw),
      onClose: () => inHand() && this.closed(),
    })
  }

  private opened(): void {
    this.open = true
    this.options.onEvent({ type: 'connecting' })
    this.send('room.join', { code: this.options.code, displayName: this.options.displayName })
  }

  private received(raw: string): void {
    const acknowledged = heartbeatAck(raw)
    if (acknowledged !== null) {
      this.latencyMs = Math.max(0, this.options.now() - acknowledged)
      this.options.onEvent({ type: 'latency', latencyMs: this.latencyMs })
      return
    }
    const event = parseServerMessage(raw)
    if (!event) return
    if (event.type === 'snapshot') {
      // In: from here the Room hears where we stand, every few seconds.
      this.joined = true
      this.attempts = 0
      this.revision = event.snapshot.revision
      this.beat()
    }
    this.options.onEvent(event)
  }

  private closed(): void {
    this.open = false
    this.socket = null
    this.cancelBeat?.()
    this.cancelBeat = null
    // A socket that never got the Room is an attempt that failed; one that did is a drop.
    this.options.onEvent({ type: this.joined ? 'disconnected' : 'reconnectFailed' })
    const wait = RECONNECT_BACKOFF_MS[Math.min(this.attempts, RECONNECT_BACKOFF_MS.length - 1)]
    this.attempts += 1
    this.cancelRetry = this.options.schedule(wait, () => !this.stopped && this.connect())
  }

  /** Tells the Room we are here, how far behind we are and what the last round trip was. */
  private beat(): void {
    if (!this.open) return
    const now = this.options.now()
    const since = now - this.lastBeatAt
    this.cancelBeat?.()
    if (since < HEARTBEAT_MIN_GAP_MS) {
      this.cancelBeat = this.options.schedule(HEARTBEAT_MIN_GAP_MS - since, () => this.beat())
      return
    }
    this.lastBeatAt = now
    this.cancelBeat = this.options.schedule(HEARTBEAT_EVERY_MS, () => this.beat())
    this.send('room.heartbeat', { sentAt: now, revision: this.revision, latencyMs: this.latencyMs })
  }
}

/** The client's own clock as echoed back by the server, or null for anything else. */
function heartbeatAck(raw: string): number | null {
  let message: { event?: unknown; data?: { sentAt?: unknown } }
  try {
    message = JSON.parse(raw)
  } catch {
    return null
  }
  const sentAt = message?.event === 'room.heartbeatAck' ? Number(message.data?.sentAt) : Number.NaN
  return Number.isFinite(sentAt) ? sentAt : null
}

function openWebSocket(url: string, handlers: RoomSocketHandlers): RoomSocket {
  const socket = new WebSocket(url)
  socket.addEventListener('open', () => handlers.onOpen())
  socket.addEventListener('message', (message: MessageEvent<string>) => handlers.onMessage(message.data))
  socket.addEventListener('close', () => handlers.onClose())
  return socket
}

function scheduleWithTimeout(delayMs: number, callback: () => void): () => void {
  const timer = setTimeout(callback, delayMs)
  return () => clearTimeout(timer)
}
