import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { hands, playbacks, queueEntries } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { timeline } from '../hands/replay/timeline.js';
import { Rejected } from '../rejection/rejection.js';
import { RoomsService } from './rooms.service.js';

/**
 * The Room's shared replay state as every Participant receives it. The Hand
 * itself, with its Timeline, is fetched over HTTP by id.
 */
export interface Playback {
  handId: string;
  /** 0 is the Initial State; n is the table after Action n. */
  actionIndex: number;
}

/** Loading a Hand and moving through it. Only the Master may change Playback. */
@Injectable()
export class PlaybackService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly rooms: RoomsService,
  ) {}

  /** The Room's Playback, or null while no Hand has been loaded. */
  async current(roomId: string): Promise<Playback | null> {
    const [row] = await this.db
      .select({ handId: playbacks.handId, actionIndex: playbacks.actionIndex })
      .from(playbacks)
      .where(eq(playbacks.roomId, roomId));
    return row ?? null;
  }

  /** Loads a Hand from the Room's Queue at its Initial State. */
  async load(
    master: Identity,
    roomId: string,
    handId: unknown,
  ): Promise<Playback> {
    await this.rooms.requireMaster(roomId, master.id);
    if (!isUuid(handId)) throw new Rejected('hand-not-in-queue');
    const [queued] = await this.db
      .select({ id: queueEntries.id })
      .from(queueEntries)
      .where(
        and(
          eq(queueEntries.roomId, roomId),
          eq(queueEntries.handId, handId),
          isNull(queueEntries.removedAt),
        ),
      )
      .limit(1);
    if (!queued) throw new Rejected('hand-not-in-queue');

    const playback = { handId, actionIndex: 0 };
    const updatedAt = this.clock.now();
    await this.db
      .insert(playbacks)
      .values({ roomId, ...playback, updatedAt })
      .onConflictDoUpdate({
        target: playbacks.roomId,
        set: { ...playback, updatedAt },
      });
    return playback;
  }

  /**
   * Takes Playback to an absolute step of the Hand's Timeline (the Initial
   * State, an Action, a Street dealt or the end), so stepping either way and
   * jumping are the same idempotent command.
   */
  async goTo(
    master: Identity,
    roomId: string,
    actionIndex: unknown,
  ): Promise<Playback> {
    await this.rooms.requireMaster(roomId, master.id);
    const [loaded] = await this.db
      .select({ handId: playbacks.handId, content: hands.content })
      .from(playbacks)
      .innerJoin(hands, eq(hands.id, playbacks.handId))
      .where(eq(playbacks.roomId, roomId));
    if (!loaded) throw new Rejected('no-hand-loaded');
    if (
      typeof actionIndex !== 'number' ||
      !Number.isInteger(actionIndex) ||
      actionIndex < 0 ||
      actionIndex >= timeline(loaded.content).states.length
    ) {
      throw new Rejected('invalid-action-index');
    }

    await this.db
      .update(playbacks)
      .set({ actionIndex, updatedAt: this.clock.now() })
      .where(eq(playbacks.roomId, roomId));
    return { handId: loaded.handId, actionIndex };
  }
}
