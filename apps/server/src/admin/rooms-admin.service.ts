import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import {
  identities,
  queueEntries,
  roomMemberships,
  rooms,
} from '../database/schema.js';
import type { PersonView } from '../identity/invitations.service.js';
import { Rejected } from '../rejection/rejection.js';
import { RoomGateway } from '../rooms/room.gateway.js';
import { normalizeRoomCode } from '../rooms/room-code.js';
import { adminPage, oneOf } from './admin-query.js';
import { person } from './accounts.service.js';

export interface AdminRoomView {
  code: string;
  name: string;
  status: 'open' | 'closed';
  /** Free Review or Live (ADR 0009). */
  state: 'free-review' | 'live';
  master: PersonView;
  participants: number;
  queueLength: number;
  createdAt: string;
  lastActivityAt: string;
  closedAt: string | null;
}

export const ROOM_SORTS = ['lastActivityAt', 'createdAt', 'name'] as const;

/** The Rooms tab: every Room, open or closed, to spot the ones left behind. */
@Injectable()
export class RoomsAdminService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly gateway: RoomGateway,
  ) {}

  async list(query: {
    search?: unknown;
    status?: unknown;
    sort?: unknown;
    direction?: unknown;
    page?: unknown;
    pageSize?: unknown;
  }): Promise<{
    total: number;
    page: number;
    pageSize: number;
    rooms: AdminRoomView[];
  }> {
    const status = oneOf(query.status, ['all', 'open', 'closed'] as const);
    const sort = oneOf(query.sort, ROOM_SORTS);
    // Stale ones first: the oldest activity on top, unless asked otherwise.
    const direction = oneOf(query.direction, ['asc', 'desc'] as const);
    const { page, pageSize } = adminPage(query);
    // Every Revision has been written before the list is read.
    await this.gateway.activitySettled();
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const where = and(
      status === 'all' ? undefined : eq(rooms.status, status),
      search
        ? or(
            sql`${rooms.name} ilike ${pattern}`,
            eq(rooms.code, normalizeRoomCode(search)),
          )
        : undefined,
    );
    const column = rooms[sort];
    const participants = sql<number>`(select count(*)::int from ${roomMemberships} where ${roomMemberships.roomId} = ${rooms.id} and not ${roomMemberships.kicked})`;
    const queueLength = sql<number>`(select count(*)::int from ${queueEntries} where ${queueEntries.roomId} = ${rooms.id} and ${queueEntries.removedAt} is null)`;
    const [[{ total }], rows] = await Promise.all([
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(rooms)
        .where(where),
      this.db
        .select({ room: rooms, master: identities, participants, queueLength })
        .from(rooms)
        .innerJoin(identities, eq(identities.id, rooms.masterId))
        .where(where)
        .orderBy(
          direction === 'asc'
            ? sql`${column} asc, ${rooms.id}`
            : sql`${column} desc, ${rooms.id}`,
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    return {
      total,
      page,
      pageSize,
      rooms: rows.map(({ room, master, ...counts }) => ({
        code: room.code,
        name: room.name,
        status: room.status,
        state: room.state,
        master: person(master),
        participants: counts.participants,
        queueLength: counts.queueLength,
        createdAt: room.createdAt.toISOString(),
        lastActivityAt: room.lastActivityAt.toISOString(),
        closedAt: room.closedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Closes an open Room the way its Master would; `room-not-found` if it isn't open. */
  async close(code: string): Promise<void> {
    const [room] = await this.db
      .select({ id: rooms.id, status: rooms.status })
      .from(rooms)
      .where(eq(rooms.code, normalizeRoomCode(code)));
    if (!room || room.status !== 'open') throw new Rejected('room-not-found');
    await this.gateway.closeAsAdministrator(room.id);
  }
}
