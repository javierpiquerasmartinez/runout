import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { roomMemberships, rooms } from '../database/schema.js';
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
  ): Promise<RoomSummary> {
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
      return { code: room.code, name: room.name };
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
   * Makes `identity` a Participant of the open Room under `displayName`, keeping the
   * original join time if they were in it before.
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
        set: { roomId: room.id },
      })
      .returning();
    return {
      room,
      participant: {
        identityId: identity.id,
        displayName: named.displayName ?? '',
        joinedAt: membership.joinedAt,
      },
    };
  }

  /** Refuses with `not-in-room` anyone who isn't a Participant of the Room. */
  async requireParticipant(roomId: string, identityId: string): Promise<void> {
    const [membership] = await this.db
      .select({ kicked: roomMemberships.kicked })
      .from(roomMemberships)
      .where(
        and(
          eq(roomMemberships.roomId, roomId),
          eq(roomMemberships.identityId, identityId),
        ),
      );
    if (!membership || membership.kicked) throw new Rejected('not-in-room');
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
