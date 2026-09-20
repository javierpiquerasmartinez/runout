import { describe, expect, it } from 'vitest'
import {
  HEARTBEAT_EVERY_MS,
  HEARTBEAT_MIN_GAP_MS,
  RECONNECT_BACKOFF_MS,
  RoomConnection,
  type RoomSocket,
  type RoomSocketHandlers,
} from './roomConnection'
import type { RoomEvent, RoomSnapshot } from './roomClient'

const room: RoomSnapshot = {
  room: { code: 'RNT4K9PX', name: 'Martes NL50' },
  you: 'id-marta',
  participants: [],
  queue: [],
  playback: null,
  revision: 7,
  presence: [],
}

interface Sent {
  event: string
  data: any
}

/** A socket a test drives by hand: nothing happens until the test says so. */
class FakeSocket implements RoomSocket {
  readonly sent: Sent[] = []
  closed = false

  readonly url: string
  private readonly handlers: RoomSocketHandlers

  constructor(url: string, handlers: RoomSocketHandlers) {
    this.url = url
    this.handlers = handlers
  }

  send(raw: string): void {
    this.sent.push(JSON.parse(raw) as Sent)
  }

  close(): void {
    this.closed = true
  }

  /** The socket finishes opening. */
  open(): void {
    this.handlers.onOpen()
  }

  receive(message: unknown): void {
    this.handlers.onMessage(JSON.stringify(message))
  }

  /** The socket goes away without being asked to. */
  drop(): void {
    this.closed = true
    this.handlers.onClose()
  }

  of(event: string): Sent[] {
    return this.sent.filter((message) => message.event === event)
  }
}

/** Time only moves when a test moves it, so backoffs and beats are exact. */
class FakeClock {
  private current = 1_000
  private pending: { dueAt: number; run: () => void }[] = []

  now = (): number => this.current

  schedule = (delayMs: number, run: () => void): (() => void) => {
    const entry = { dueAt: this.current + delayMs, run }
    this.pending.push(entry)
    return () => {
      this.pending = this.pending.filter((other) => other !== entry)
    }
  }

  advance(ms: number): void {
    const target = this.current + ms
    for (;;) {
      const next = this.pending.filter((entry) => entry.dueAt <= target).sort((a, b) => a.dueAt - b.dueAt)[0]
      if (!next) break
      this.pending = this.pending.filter((other) => other !== next)
      this.current = next.dueAt
      next.run()
    }
    this.current = target
  }
}

function connect() {
  const clock = new FakeClock()
  const sockets: FakeSocket[] = []
  const events: RoomEvent[] = []
  const connection = new RoomConnection({
    code: 'RNT4K9PX',
    token: 'token-1',
    displayName: 'Marta',
    onEvent: (event) => events.push(event),
    open: (url, handlers) => {
      const socket = new FakeSocket(url, handlers)
      sockets.push(socket)
      return socket
    },
    schedule: clock.schedule,
    now: clock.now,
  })
  const latest = () => sockets[sockets.length - 1]
  /** Opens the socket in hand and answers its join with the Room. */
  const join = (snapshot: RoomSnapshot = room) => {
    latest().open()
    latest().receive({ event: 'room.snapshot', data: snapshot })
  }
  return { clock, sockets, events, connection, latest, join, types: () => events.map((event) => event.type) }
}

describe('RoomConnection', () => {
  it('presents the identity token and joins the Room as soon as the socket opens', () => {
    const { sockets, latest } = connect()

    expect(sockets).toHaveLength(1)
    expect(latest().url).toContain(`token=${encodeURIComponent('token-1')}`)
    latest().open()

    expect(latest().of('room.join')[0].data).toEqual({ code: 'RNT4K9PX', displayName: 'Marta' })
    // Nothing is said about where it stands until the Room has answered.
    expect(latest().of('room.heartbeat')).toEqual([])
  })

  it('beats as soon as it is in, and again every few seconds', () => {
    const { clock, latest, join } = connect()
    join()

    expect(latest().of('room.heartbeat')).toHaveLength(1)
    clock.advance(HEARTBEAT_EVERY_MS)
    clock.advance(HEARTBEAT_EVERY_MS)

    expect(latest().of('room.heartbeat')).toHaveLength(3)
  })

  it('says how far behind the Room it is in every beat', () => {
    const { clock, connection, latest, join } = connect()
    join()

    connection.report(9)
    clock.advance(HEARTBEAT_EVERY_MS * 2)

    expect(latest().of('room.heartbeat').map((beat) => beat.data.revision)).toEqual([7, 9, 9])
  })

  it('beats at once when it catches up, without a beat per Action', () => {
    const { clock, connection, latest, join } = connect()
    join()
    clock.advance(HEARTBEAT_MIN_GAP_MS)

    connection.report(8)
    connection.report(9)
    connection.report(10)

    expect(latest().of('room.heartbeat')).toHaveLength(2)
    clock.advance(HEARTBEAT_MIN_GAP_MS)
    // The ones held back are not lost: the next beat carries where it now stands.
    expect(latest().of('room.heartbeat').at(-1)!.data.revision).toBe(10)
  })

  it('measures the round trip from the clock the server echoes back', () => {
    const { clock, events, latest, join } = connect()
    join()
    const { sentAt } = latest().of('room.heartbeat')[0].data

    clock.advance(40)
    latest().receive({ event: 'room.heartbeatAck', data: { sentAt } })

    expect(events).toContainEqual({ type: 'latency', latencyMs: 40 })
  })

  it('opens a new socket after a drop, and joins the Room again', () => {
    const { clock, sockets, latest, join, types } = connect()
    join()

    latest().drop()
    expect(types()).toEqual(['connecting', 'snapshot', 'disconnected'])
    expect(sockets).toHaveLength(1)

    clock.advance(RECONNECT_BACKOFF_MS[0])
    expect(sockets).toHaveLength(2)
    latest().open()
    expect(latest().of('room.join')).toHaveLength(1)
  })

  it('waits longer before each further try, and counts the ones that fail', () => {
    const { clock, sockets, latest, types } = connect()

    latest().open()
    latest().drop()
    expect(types()).toContain('reconnectFailed')

    clock.advance(RECONNECT_BACKOFF_MS[0])
    latest().open()
    latest().drop()
    // The second wait is longer: the first one has already gone by.
    clock.advance(RECONNECT_BACKOFF_MS[0])
    expect(sockets).toHaveLength(2)
    clock.advance(RECONNECT_BACKOFF_MS[1] - RECONNECT_BACKOFF_MS[0])
    expect(sockets).toHaveLength(3)
  })

  it('asks for the Room as it stands when the reducer is owed a snapshot', () => {
    const { connection, latest, join } = connect()
    join()

    connection.resync()

    expect(latest().of('room.resync')).toHaveLength(1)
  })

  it('walks out of the Room and stops coming back when it is closed', () => {
    const { clock, sockets, connection, latest, join } = connect()
    join()

    connection.close()

    expect(latest().of('room.leave')).toHaveLength(1)
    expect(latest().closed).toBe(true)
    clock.advance(60_000)
    expect(sockets).toHaveLength(1)
  })

  it('never lets a socket it has left behind speak for the Room', () => {
    const { clock, sockets, events, latest, join } = connect()
    join()
    const dropped = sockets[0]
    dropped.drop()
    clock.advance(RECONNECT_BACKOFF_MS[0])
    join({ ...room, revision: 11 })

    dropped.receive({ event: 'room.closed', data: {}, revision: 12 })

    expect(events.filter((event) => event.type === 'roomClosed')).toEqual([])
    expect(latest()).not.toBe(dropped)
  })
})
