import type { JoiningParticipant } from './rooms.service.js';

export interface Participant {
  identityId: string;
  displayName: string;
  role: 'master' | 'guest';
}

/** How well a Participant is keeping up with the Room, read from their heartbeats. */
export type Presence = 'connected' | 'unstable' | 'away';

/** How long a Participant's heartbeats may be late before they read as unstable. */
export const UNSTABLE_AFTER_MS = 10_000;
/** A silence this long is a disconnection, however the socket looks. */
export const AWAY_AFTER_MS = 30_000;

/** One Participant's side of the Room, as their own connections report it. */
export interface ParticipantPresence {
  identityId: string;
  presence: Presence;
  /** The round trip they last measured, in ms; null before their first heartbeat. */
  latencyMs: number | null;
  /** Whether they have applied the Room's current revision. */
  inSync: boolean;
}

/** What one connection last told us about itself. */
export interface Heartbeat {
  at: Date;
  latencyMs: number | null;
  /** The last revision of the Room this connection has applied. */
  revision: number;
}

interface Present {
  identityId: string;
  displayName: string;
  joinedAt: Date;
  connections: Map<unknown, Heartbeat>;
}

interface LiveRoom {
  masterId: string;
  present: Map<string, Present>;
}

/**
 * Who is in each open Room right now, and how well each of them is following
 * it, held in memory by this one server instance. A Participant is present
 * while at least one of their connections (a browser tab) is in the Room.
 */
export class RoomPresence<Connection> {
  private readonly rooms = new Map<string, LiveRoom>();
  private readonly roomOf = new Map<
    Connection,
    { roomId: string; identityId: string }
  >();

  /** Returns true when this is the Participant's first connection in the Room. */
  enter(
    roomId: string,
    masterId: string,
    participant: JoiningParticipant,
    connection: Connection,
    /** When they arrived: their first heartbeat, until they send one of their own. */
    at: Date,
  ): boolean {
    const room = this.rooms.get(roomId) ?? { masterId, present: new Map() };
    this.rooms.set(roomId, room);
    const present = room.present.get(participant.identityId);
    const arrival: Heartbeat = { at, latencyMs: null, revision: 0 };
    this.roomOf.set(connection, { roomId, identityId: participant.identityId });
    if (present) {
      present.connections.set(connection, arrival);
      present.displayName = participant.displayName;
      return false;
    }
    room.present.set(participant.identityId, {
      ...participant,
      connections: new Map([[connection, arrival]]),
    });
    return true;
  }

  /**
   * Records what a connection reports about itself. Returns false when the
   * connection is in no Room, so a stray heartbeat is simply dropped.
   */
  beat(connection: Connection, heartbeat: Heartbeat): boolean {
    const present = this.presentAt(connection);
    if (!present?.connections.has(connection)) return false;
    present.connections.set(connection, heartbeat);
    return true;
  }

  /**
   * Marks a connection as up to date at `revision`, without a measurement of
   * its own: a snapshot tells us as much as a heartbeat would.
   */
  applied(connection: Connection, revision: number, at: Date): boolean {
    const heartbeat = this.heartbeatOf(connection);
    if (!heartbeat) return false;
    return this.beat(connection, { ...heartbeat, at, revision });
  }

  /**
   * How every Participant present is following the Room, in the order they
   * joined. A Participant is read from their liveliest connection: one dead
   * tab says nothing while another is still beating.
   */
  following(
    roomId: string,
    revision: number,
    now: Date,
  ): ParticipantPresence[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return this.inJoinOrder(room).map((present) => {
      const heartbeat = [...present.connections.values()].sort(
        (a, b) => b.at.getTime() - a.at.getTime(),
      )[0];
      const silence = now.getTime() - heartbeat.at.getTime();
      return {
        identityId: present.identityId,
        presence:
          silence >= AWAY_AFTER_MS
            ? 'away'
            : silence >= UNSTABLE_AFTER_MS
              ? 'unstable'
              : 'connected',
        latencyMs: heartbeat.latencyMs,
        inSync: heartbeat.revision >= revision,
      };
    });
  }

  /**
   * Takes the connection out of its Room. Returns who left when it was their
   * last connection there, or null when they are still present (or were never in).
   */
  exit(connection: Connection): { roomId: string; identityId: string } | null {
    const place = this.roomOf.get(connection);
    if (!place) return null;
    this.roomOf.delete(connection);
    const room = this.rooms.get(place.roomId);
    const present = room?.present.get(place.identityId);
    if (!room || !present) return null;
    present.connections.delete(connection);
    if (present.connections.size > 0) return null;
    room.present.delete(place.identityId);
    if (room.present.size === 0) this.rooms.delete(place.roomId);
    return place;
  }

  /**
   * Takes one Participant out of the Room, whatever they have open. Returns
   * the connections that were theirs, so each can be told why.
   */
  evict(roomId: string, identityId: string): Connection[] {
    const room = this.rooms.get(roomId);
    const present = room?.present.get(identityId);
    if (!room || !present) return [];
    const connections = [...present.connections.keys()] as Connection[];
    for (const connection of connections) this.roomOf.delete(connection);
    room.present.delete(identityId);
    if (room.present.size === 0) this.rooms.delete(roomId);
    return connections;
  }

  /** Empties the Room: it is closed, and nobody is in it any more. */
  clear(roomId: string): Connection[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    const connections = [...room.present.values()].flatMap(
      (present) => [...present.connections.keys()] as Connection[],
    );
    for (const connection of connections) this.roomOf.delete(connection);
    this.rooms.delete(roomId);
    return connections;
  }

  /** Whether anyone at all is connected to the Room right now. */
  isLive(roomId: string): boolean {
    return (this.rooms.get(roomId)?.present.size ?? 0) > 0;
  }

  /** Who holds the Master role of a Room, while anyone is present in it. */
  masterOf(roomId: string): string | null {
    return this.rooms.get(roomId)?.masterId ?? null;
  }

  /** Moves the Master role, so every Participant is reported under its new roles. */
  setMaster(roomId: string, masterId: string): void {
    const room = this.rooms.get(roomId);
    if (room) room.masterId = masterId;
  }

  isInRoom(connection: Connection): boolean {
    return this.roomOf.has(connection);
  }

  /** The Room the connection is in, and whose connection it is. */
  placeOf(
    connection: Connection,
  ): { roomId: string; identityId: string } | null {
    return this.roomOf.get(connection) ?? null;
  }

  /** Present Participants, in the order they first joined. */
  participants(roomId: string): Participant[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return this.inJoinOrder(room).map((present) =>
      this.toParticipant(room, present),
    );
  }

  participant(roomId: string, identityId: string): Participant | null {
    const room = this.rooms.get(roomId);
    const present = room?.present.get(identityId);
    return room && present ? this.toParticipant(room, present) : null;
  }

  /** Every connection in the Room, optionally leaving one Participant's out. */
  connections(roomId: string, exceptIdentityId?: string): Connection[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return [...room.present.values()]
      .filter((present) => present.identityId !== exceptIdentityId)
      .flatMap((present) => [...present.connections.keys()] as Connection[]);
  }

  private heartbeatOf(connection: Connection): Heartbeat | undefined {
    return this.presentAt(connection)?.connections.get(connection);
  }

  private presentAt(connection: Connection): Present | undefined {
    const place = this.roomOf.get(connection);
    return place
      ? this.rooms.get(place.roomId)?.present.get(place.identityId)
      : undefined;
  }

  /** Present Participants, oldest arrival first. */
  private inJoinOrder(room: LiveRoom): Present[] {
    return [...room.present.values()].sort(
      (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
    );
  }

  private toParticipant(room: LiveRoom, present: Present): Participant {
    return {
      identityId: present.identityId,
      displayName: present.displayName,
      role: present.identityId === room.masterId ? 'master' : 'guest',
    };
  }
}

/** How far a latency has to move before the Room is told about it again. */
export const LATENCY_STEP_MS = 10;

/**
 * Whether the Room is worth telling again. Presence is chatter — a heartbeat
 * every few seconds from everyone — so only what a Participant could act on
 * travels: someone arriving or leaving, a presence or a sync state moving, or
 * a latency that has really shifted rather than jittered.
 */
export function presenceChanged(
  before: ParticipantPresence[] | undefined,
  after: ParticipantPresence[],
): boolean {
  if (!before || before.length !== after.length) return true;
  return after.some((now, index) => {
    const then = before[index];
    return (
      then.identityId !== now.identityId ||
      then.presence !== now.presence ||
      then.inSync !== now.inSync ||
      (then.latencyMs === null) !== (now.latencyMs === null) ||
      Math.abs((then.latencyMs ?? 0) - (now.latencyMs ?? 0)) >= LATENCY_STEP_MS
    );
  });
}
