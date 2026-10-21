import { Inject, Injectable } from '@nestjs/common';
import { and, eq, exists, or } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import {
  hands,
  libraryEntries,
  queueEntries,
  roomMemberships,
  rooms,
} from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import type { Hand, Stake } from './hand.js';
import { timeline, type Timeline } from './replay/timeline.js';

/** What the web needs to draw a Hand at any Action. It never changes. */
export interface HandWithTimeline {
  id: string;
  stake: Stake;
  /** Seats the table has, whether or not they are taken. */
  tableSize: number;
  timeline: Timeline;
}

@Injectable()
export class HandsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * The Hand with its Timeline, for someone who can see it: who has it in
   * their Library, or a Participant of an open Room whose Queue holds it.
   * Anyone else gets `hand-not-found`, so a Hand's existence isn't revealed.
   */
  async withTimeline(viewer: Identity, id: string): Promise<HandWithTimeline> {
    const content = await this.visibleTo(viewer, id);
    return {
      id,
      stake: content.stake,
      tableSize: content.tableSize,
      timeline: timeline(content),
    };
  }

  /**
   * Refuses with `hand-not-found` unless the Hand is one this viewer may see,
   * for what hangs off a Hand rather than being part of it (its Notes).
   */
  async requireVisible(viewer: Identity, id: string): Promise<void> {
    await this.visibleTo(viewer, id);
  }

  /** The Hand as it was imported, for a viewer who may see it. */
  private async visibleTo(viewer: Identity, id: string): Promise<Hand> {
    if (!isUuid(id)) throw new Rejected('hand-not-found');
    const inLibrary = this.db
      .select({ handId: libraryEntries.handId })
      .from(libraryEntries)
      .where(
        and(
          eq(libraryEntries.handId, hands.id),
          eq(libraryEntries.identityId, viewer.id),
        ),
      );
    const inOpenRoom = this.db
      .select({ handId: queueEntries.handId })
      .from(queueEntries)
      .innerJoin(
        rooms,
        and(eq(rooms.id, queueEntries.roomId), eq(rooms.status, 'open')),
      )
      .innerJoin(
        roomMemberships,
        and(
          eq(roomMemberships.roomId, queueEntries.roomId),
          eq(roomMemberships.identityId, viewer.id),
          eq(roomMemberships.kicked, false),
        ),
      )
      .where(eq(queueEntries.handId, hands.id));
    const [row] = await this.db
      .select({ content: hands.content })
      .from(hands)
      .where(and(eq(hands.id, id), or(exists(inLibrary), exists(inOpenRoom))));
    if (!row) throw new Rejected('hand-not-found');
    return row.content;
  }
}
