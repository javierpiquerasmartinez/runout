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
import type { HandCopyRequest } from './hand-copy.js';
import { handSummary } from './replay/hand-summary.js';
import { timeline, type Timeline } from './replay/timeline.js';

/** What the web needs to draw a Hand at any Action. It never changes. */
export interface HandWithTimeline {
  id: string;
  stake: Stake;
  /** Seats the table has, whether or not they are taken. */
  tableSize: number;
  timeline: Timeline;
  /** Whether Runout kept the Hand History it was read from, to copy as it came in. */
  hasHistory: boolean;
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
    const { content, handHistory } = await this.visibleTo(viewer, id);
    return {
      id,
      stake: content.stake,
      tableSize: content.tableSize,
      timeline: timeline(content),
      hasHistory: handHistory !== null,
    };
  }

  /**
   * The whole Hand as text to paste elsewhere, for someone who can see it:
   * its Hand Summary, or its Hand History as it came in (`no-history` for a
   * Hand stored before Runout kept it). Whatever Playback shows, and Hide
   * Opponent Names, it is the same.
   */
  async copy(
    viewer: Identity,
    id: string,
    { as, language, timeZone }: HandCopyRequest,
  ): Promise<string> {
    const { content, handHistory } = await this.visibleTo(viewer, id);
    if (as === 'history') {
      if (handHistory === null) throw new Rejected('no-history');
      return handHistory;
    }
    return handSummary(content, { language, timeZone });
  }

  /**
   * Refuses with `hand-not-found` unless the Hand is one this viewer may see,
   * for what hangs off a Hand rather than being part of it (its Notes).
   */
  async requireVisible(viewer: Identity, id: string): Promise<void> {
    await this.visibleTo(viewer, id);
  }

  /** The Hand as it was imported, and its text, for a viewer who may see it. */
  private async visibleTo(
    viewer: Identity,
    id: string,
  ): Promise<{ content: Hand; handHistory: string | null }> {
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
      .select({ content: hands.content, handHistory: hands.handHistory })
      .from(hands)
      .where(and(eq(hands.id, id), or(exists(inLibrary), exists(inOpenRoom))));
    if (!row) throw new Rejected('hand-not-found');
    return row;
  }
}
