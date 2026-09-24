import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { marks, queueEntries } from '../database/schema.js';
import type { Identity } from '../identity/identity.service.js';
import { requireQueued } from './queued-hand.js';
import { RoomsService } from './rooms.service.js';

/**
 * The private flags people put on Hands to find them again. A Mark belongs to
 * one person: nothing here ever tells anyone about anybody else's, and a Mark
 * is no part of what a Room shares.
 */
@Injectable()
export class MarksService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly rooms: RoomsService,
  ) {}

  /** The Hands this person has Marked among those in a Room's Queue. */
  async inRoom(identityId: string, roomId: string): Promise<string[]> {
    const rows = await this.db
      .select({ handId: marks.handId })
      .from(marks)
      .innerJoin(
        queueEntries,
        and(
          eq(queueEntries.handId, marks.handId),
          eq(queueEntries.roomId, roomId),
          isNull(queueEntries.removedAt),
        ),
      )
      .where(eq(marks.identityId, identityId))
      .orderBy(asc(marks.markedAt));
    return rows.map((row) => row.handId);
  }

  /** Whether this person has Marked the Hand. Nobody else is ever told. */
  async isMarked(identityId: string, handId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ handId: marks.handId })
      .from(marks)
      .where(and(eq(marks.identityId, identityId), eq(marks.handId, handId)));
    return row !== undefined;
  }

  /** A Participant Marks a Hand in their Room's Queue, or takes the Mark off. */
  async set(
    person: Identity,
    roomId: string,
    handId: unknown,
    marked: unknown,
  ): Promise<{ handId: string; marked: boolean }> {
    await this.rooms.requireParticipant(roomId, person.id);
    const queued = await requireQueued(this.db, roomId, handId);
    if (marked === false) {
      await this.db
        .delete(marks)
        .where(and(eq(marks.identityId, person.id), eq(marks.handId, queued)));
      return { handId: queued, marked: false };
    }
    await this.db
      .insert(marks)
      .values({
        identityId: person.id,
        handId: queued,
        markedAt: this.clock.now(),
      })
      .onConflictDoNothing();
    return { handId: queued, marked: true };
  }
}
