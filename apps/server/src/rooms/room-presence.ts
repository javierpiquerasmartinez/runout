import type { JoiningParticipant } from './rooms.service.js';

export interface Participant {
  identityId: string;
  displayName: string;
  role: 'master' | 'guest';
}

interface Present {
  identityId: string;
  displayName: string;
  joinedAt: Date;
  connections: Set<unknown>;
}

interface LiveRoom {
  masterId: string;
  present: Map<string, Present>;
}

/**
 * Who is in each open Room right now, held in memory by this one server
 * instance. A Participant is present while at least one of their connections
 * (a browser tab) is in the Room.
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
  ): boolean {
    const room = this.rooms.get(roomId) ?? { masterId, present: new Map() };
    this.rooms.set(roomId, room);
    const present = room.present.get(participant.identityId);
    this.roomOf.set(connection, { roomId, identityId: participant.identityId });
    if (present) {
      present.connections.add(connection);
      present.displayName = participant.displayName;
      return false;
    }
    room.present.set(participant.identityId, {
      ...participant,
      connections: new Set([connection]),
    });
    return true;
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
    return [...room.present.values()]
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((present) => this.toParticipant(room, present));
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
      .flatMap((present) => [...present.connections] as Connection[]);
  }

  private toParticipant(room: LiveRoom, present: Present): Participant {
    return {
      identityId: present.identityId,
      displayName: present.displayName,
      role: present.identityId === room.masterId ? 'master' : 'guest',
    };
  }
}
