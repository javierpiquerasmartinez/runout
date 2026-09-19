import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, max } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import {
  hands,
  identities,
  queueEntries,
  roomMemberships,
  rooms,
} from '../database/schema.js';
import type { Stake } from '../hands/hand.js';
import { importHandHistory, type Discarded } from '../hands/import/import.js';
import { summarise, type HandSummary } from '../hands/replay/summary.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { RoomsService, type Room } from './rooms.service.js';

/** A Queue row as every Participant sees it. */
export interface QueueEntry {
  id: string;
  handId: string;
  position: number;
  author: { identityId: string; displayName: string };
  playedAt: string;
  stake: Stake;
  summary: HandSummary;
}

export interface Pasted {
  room: Room;
  /** The new Queue Entries, in Queue order. Empty when no Hand was read. */
  entries: QueueEntry[];
  discarded: Discarded[];
}

/** A Room's Queue: the Hands it is going to review, in order. */
@Injectable()
export class QueueService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly rooms: RoomsService,
  ) {}

  /**
   * Imports the Hands in pasted Hand History text and appends them to the
   * Room's Queue. Any Participant may import; for now the Importer is also
   * the Author.
   */
  async paste(
    importer: Identity,
    code: string,
    text: unknown,
  ): Promise<Pasted> {
    const room = await this.rooms.findOpen(code);
    await this.requireParticipant(room.id, importer.id);
    const { hands: read, discarded } = importHandHistory(
      typeof text === 'string' ? text : '',
    );
    if (read.length === 0) return { room, entries: [], discarded };
    const now = this.clock.now();

    const added = await this.db.transaction(async (tx) => {
      // Serialises appends to one Room, so two pastes never share a position.
      await tx
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.id, room.id))
        .for('update');
      const [{ last }] = await tx
        .select({ last: max(queueEntries.position) })
        .from(queueEntries)
        .where(eq(queueEntries.roomId, room.id));

      const stored = await tx
        .insert(hands)
        .values(
          read.map((hand) => ({
            site: hand.site,
            siteHandId: hand.siteHandId,
            heroScreenName: hand.hero.screenName,
            authorId: importer.id,
            importerId: importer.id,
            sourceFormat: hand.sourceFormat,
            playedAt: new Date(hand.playedAt),
            smallBlind: hand.stake.smallBlind,
            bigBlind: hand.stake.bigBlind,
            currency: hand.stake.currency,
            content: hand,
            importedAt: now,
          })),
        )
        .returning({ id: hands.id });
      return tx
        .insert(queueEntries)
        .values(
          stored.map(({ id }, index) => ({
            roomId: room.id,
            handId: id,
            position: (last ?? 0) + index + 1,
            addedAt: now,
          })),
        )
        .returning({ id: queueEntries.id });
    });

    const entries = await this.entries(room.id);
    const addedIds = new Set(added.map(({ id }) => id));
    return {
      room,
      entries: entries.filter((entry) => addedIds.has(entry.id)),
      discarded,
    };
  }

  /** The Room's whole Queue, in order. */
  async entries(roomId: string): Promise<QueueEntry[]> {
    const rows = await this.db
      .select({
        id: queueEntries.id,
        handId: hands.id,
        position: queueEntries.position,
        authorId: hands.authorId,
        authorName: identities.displayName,
        content: hands.content,
      })
      .from(queueEntries)
      .innerJoin(hands, eq(hands.id, queueEntries.handId))
      .innerJoin(identities, eq(identities.id, hands.authorId))
      .where(eq(queueEntries.roomId, roomId))
      .orderBy(asc(queueEntries.position));
    return rows.map((row) => ({
      id: row.id,
      handId: row.handId,
      position: row.position,
      author: { identityId: row.authorId, displayName: row.authorName ?? '' },
      playedAt: row.content.playedAt,
      stake: row.content.stake,
      summary: summarise(row.content),
    }));
  }

  private async requireParticipant(
    roomId: string,
    identityId: string,
  ): Promise<void> {
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
}
