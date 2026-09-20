import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { roomMemberships, rooms } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import {
  IdentityService,
  type Identity,
} from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { generateRoomCode, normalizeRoomCode } from './room-code.js';

export const ROOM_NAME_MAX_LENGTH = 60;

export interface RoomSummary {
  code: string;
  name: string;
}

export interface Room extends RoomSummary {
  id: string;
  masterId: string;
}

/** An open Room someone has been in, for the welcome screen's list. */
export interface OpenRoom extends RoomSummary {
  id: string;
  /** When they first arrived in it. */
  joinedAt: Date;
}

/** A Participant as they join: who, under which Display Name, and since when. */
export interface JoiningParticipant {
  identityId: string;
  displayName: string;
  joinedAt: Date;
}

/** Room creation, lookup and membership. Every rule is enforced here, not in the web. */
@Injectable()
export class RoomsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly identities: IdentityService,
  ) {}

  /** Opens a Room with an empty Queue; its creator is the Master. */
  async create(
    creator: Identity,
    input: { name: unknown; displayName: unknown },
  ): Promise<Room> {
    const name = validRoomName(input.name);
    await this.identities.setDisplayName(creator.id, input.displayName);
    const now = this.clock.now();

    return this.db.transaction(async (tx) => {
      const [room] = await tx
        .insert(rooms)
        .values({
          code: await this.unusedCode(),
          name,
          masterId: creator.id,
          createdAt: now,
        })
        .returning();
      await tx
        .insert(roomMemberships)
        .values({ roomId: room.id, identityId: creator.id, joinedAt: now });
      return {
        id: room.id,
        code: room.code,
        name: room.name,
        masterId: room.masterId,
      };
    });
  }

  /** The open Room behind a typed code, or `room-not-found`. */
  async findOpen(typedCode: string): Promise<Room> {
    const [room] = await this.db
      .select()
      .from(rooms)
      .where(
        and(
          eq(rooms.code, normalizeRoomCode(typedCode)),
          eq(rooms.status, 'open'),
        ),
      );
    if (!room) throw new Rejected('room-not-found');
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      masterId: room.masterId,
    };
  }

  /**
   * The open Room behind a typed code, for someone who may still enter it.
   * A Room they were kicked from is `kicked-from-room`, never its name.
   */
  async findOpenFor(identity: Identity, typedCode: string): Promise<Room> {
    const room = await this.findOpen(typedCode);
    const [membership] = await this.db
      .select({ kicked: roomMemberships.kicked })
      .from(roomMemberships)
      .where(
        and(
          eq(roomMemberships.roomId, room.id),
          eq(roomMemberships.identityId, identity.id),
        ),
      );
    if (membership?.kicked) throw new Rejected('kicked-from-room');
    return room;
  }

  /**
   * Makes `identity` a Participant of the open Room under `displayName`, keeping the
   * original join time if they were in it before. A kicked identity is refused.
   */
  async join(
    identity: Identity,
    typedCode: string,
    displayName: unknown,
  ): Promise<{ room: Room; participant: JoiningParticipant }> {
    const room = await this.findOpen(typedCode);
    const named = await this.identities.setDisplayName(
      identity.id,
      displayName,
    );
    const [membership] = await this.db
      .insert(roomMemberships)
      .values({
        roomId: room.id,
        identityId: identity.id,
        joinedAt: this.clock.now(),
      })
      .onConflictDoUpdate({
        target: [roomMemberships.roomId, roomMemberships.identityId],
        // Writing the row it already has, only to get the join time back.
        set: { roomId: room.id },
        setWhere: eq(roomMemberships.kicked, false),
      })
      .returning();
    if (!membership) throw new Rejected('kicked-from-room');
    return {
      room,
      participant: {
        identityId: identity.id,
        displayName: named.displayName ?? '',
        joinedAt: membership.joinedAt,
      },
    };
  }

  /** Whether they are a Participant of the Room, kicked ones apart. */
  async isParticipant(roomId: string, identityId: string): Promise<boolean> {
    const [membership] = await this.db
      .select({ kicked: roomMemberships.kicked })
      .from(roomMemberships)
      .where(
        and(
          eq(roomMemberships.roomId, roomId),
          eq(roomMemberships.identityId, identityId),
        ),
      );
    return membership !== undefined && !membership.kicked;
  }

  /** Refuses with `not-in-room` anyone who isn't a Participant of the Room. */
  async requireParticipant(roomId: string, identityId: string): Promise<void> {
    if (!(await this.isParticipant(roomId, identityId))) {
      throw new Rejected('not-in-room');
    }
  }

  /** Refuses with `not-master` anyone but the open Room's Master. */
  async requireMaster(roomId: string, identityId: string): Promise<void> {
    const [room] = await this.db
      .select({ masterId: rooms.masterId })
      .from(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.status, 'open')));
    if (!room) throw new Rejected('room-not-found');
    if (room.masterId !== identityId) throw new Rejected('not-master');
  }

  /** Whether they hold the Master role of the open Room. */
  async isMaster(roomId: string, identityId: string): Promise<boolean> {
    const [room] = await this.db
      .select({ masterId: rooms.masterId })
      .from(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.status, 'open')));
    return room?.masterId === identityId;
  }

  /**
   * The Master removes a Participant from the Room. They are out at once and
   * can never come back to it; their Queue Entries are left where they are.
   */
  async kick(
    master: Identity,
    roomId: string,
    identityId: unknown,
  ): Promise<{ identityId: string }> {
    await this.requireMaster(roomId, master.id);
    if (!isUuid(identityId)) throw new Rejected('not-a-participant');
    if (identityId === master.id) throw new Rejected('cannot-kick-yourself');
    const kicked = await this.db
      .update(roomMemberships)
      .set({ kicked: true })
      .where(
        and(
          eq(roomMemberships.roomId, roomId),
          eq(roomMemberships.identityId, identityId),
          eq(roomMemberships.kicked, false),
        ),
      )
      .returning({ identityId: roomMemberships.identityId });
    if (kicked.length === 0) throw new Rejected('not-a-participant');
    return { identityId };
  }

  /**
   * The Master ends the session for everyone. A closed Room never reopens and
   * its Room Code stops working; the Hands it reviewed are untouched.
   */
  async close(master: Identity, roomId: string): Promise<void> {
    await this.requireMaster(roomId, master.id);
    // The Room closed between the check and the write; it is closed either way.
    await this.markClosed(roomId);
  }

  /** Closes a Room nobody has been connected to for long enough. */
  async closeAbandoned(roomId: string): Promise<boolean> {
    return this.markClosed(roomId);
  }

  /** The open Rooms someone is a Participant of, the ones they were kicked from apart. */
  async openRoomsOf(identityId: string): Promise<OpenRoom[]> {
    return this.db
      .select({
        id: rooms.id,
        code: rooms.code,
        name: rooms.name,
        joinedAt: roomMemberships.joinedAt,
      })
      .from(roomMemberships)
      .innerJoin(rooms, eq(rooms.id, roomMemberships.roomId))
      .where(
        and(
          eq(roomMemberships.identityId, identityId),
          eq(roomMemberships.kicked, false),
          eq(rooms.status, 'open'),
        ),
      )
      .orderBy(desc(roomMemberships.joinedAt));
  }

  /** Closes the Room if it is still open. False when it already was. */
  private async markClosed(roomId: string): Promise<boolean> {
    const closed = await this.db
      .update(rooms)
      .set({ status: 'closed', closedAt: this.clock.now() })
      .where(and(eq(rooms.id, roomId), eq(rooms.status, 'open')))
      .returning({ id: rooms.id });
    return closed.length > 0;
  }

  private async unusedCode(): Promise<string> {
    for (;;) {
      const code = generateRoomCode();
      const [taken] = await this.db
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.code, code));
      if (!taken) return code;
    }
  }
}

function validRoomName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length === 0 || name.length > ROOM_NAME_MAX_LENGTH) {
    throw new Rejected('invalid-room-name');
  }
  return name;
}
