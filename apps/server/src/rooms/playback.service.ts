import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import {
  hands,
  playbacks,
  queueEntries,
  roomMemberships,
  rooms,
} from '../database/schema.js';
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
  /** Seats that belong to no Participant are shown by Position, on every table. */
  hideOpponentNames: boolean;
}

/** Playback as it is read back from its row. */
const playbackColumns = {
  handId: playbacks.handId,
  actionIndex: playbacks.actionIndex,
  hideOpponentNames: playbacks.hideOpponentNames,
};

/** A Room's state: everyone on their own, or all following the Master (ADR 0009). */
export type RoomState = 'free-review' | 'live';

/**
 * Starting and ending Live, loading a Hand and moving through it. Only the
 * Master may change Playback, and only while the Room is Live.
 */
@Injectable()
export class PlaybackService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly rooms: RoomsService,
  ) {}

  /** The Room's state, and its Playback: null outside Live or with no Hand loaded. */
  async current(
    roomId: string,
  ): Promise<{ state: RoomState; playback: Playback | null }> {
    const state = await this.stateOf(roomId);
    if (state !== 'live') return { state, playback: null };
    const [row] = await this.db
      .select(playbackColumns)
      .from(playbacks)
      .where(eq(playbacks.roomId, roomId));
    return { state, playback: row ?? null };
  }

  /**
   * The Master starts Live from where they are: a Hand of the Queue at one of
   * its Actions, with every name shown, or no Hand at all.
   */
  async startLive(
    master: Identity,
    roomId: string,
    handId: unknown,
    actionIndex: unknown,
  ): Promise<Playback | null> {
    await this.rooms.requireMaster(roomId, master.id);
    if ((await this.stateOf(roomId)) === 'live') {
      throw new Rejected('already-live');
    }
    let playback: Playback | null = null;
    if (handId !== undefined && handId !== null) {
      const content = await this.queuedContent(roomId, handId);
      playback = {
        handId: handId as string,
        actionIndex: validActionIndex(content, actionIndex ?? 0),
        hideOpponentNames: false,
      };
    }
    const updatedAt = this.clock.now();
    await this.db.transaction(async (tx) => {
      await tx.update(rooms).set({ state: 'live' }).where(eq(rooms.id, roomId));
      if (playback) {
        await tx
          .insert(playbacks)
          .values({ roomId, ...playback, updatedAt })
          .onConflictDoUpdate({
            target: playbacks.roomId,
            set: { ...playback, updatedAt },
          });
      }
    });
    return playback;
  }

  /** The Master ends Live: the Room is back in Free Review, its Playback gone. */
  async endLive(master: Identity, roomId: string): Promise<void> {
    await this.rooms.requireMaster(roomId, master.id);
    if (!(await this.end(roomId))) throw new Rejected('not-live');
  }

  /** The open Rooms that are Live. */
  async liveRooms(): Promise<string[]> {
    const live = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.status, 'open'), eq(rooms.state, 'live')));
    return live.map((room) => room.id);
  }

  /** The open Live Rooms whose Master was away when last heard of, and since when. */
  async liveWithoutMaster(): Promise<{ roomId: string; since: Date }[]> {
    const live = await this.db
      .select({ roomId: rooms.id, since: rooms.masterAwaySince })
      .from(rooms)
      .where(
        and(
          eq(rooms.status, 'open'),
          eq(rooms.state, 'live'),
          isNotNull(rooms.masterAwaySince),
        ),
      );
    return live.flatMap(({ roomId, since }) =>
      since ? [{ roomId, since }] : [],
    );
  }

  /** Records since when the Live Room has had no Master connected, or that it has one again. */
  async masterAway(roomId: string, since: Date | null): Promise<void> {
    await this.db
      .update(rooms)
      .set({ masterAwaySince: since })
      .where(eq(rooms.id, roomId));
  }

  /** Ends Live whoever asks, as the Room itself does. False when it wasn't Live. */
  async end(roomId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const ended = await tx
        .update(rooms)
        .set({ state: 'free-review', masterAwaySince: null })
        .where(and(eq(rooms.id, roomId), eq(rooms.state, 'live')))
        .returning({ id: rooms.id });
      if (ended.length === 0) return false;
      // Everyone comes back to the Hand it ended on, as if they had opened it.
      const [endedOn] = await tx
        .select({ entryId: queueEntries.id })
        .from(playbacks)
        .innerJoin(
          queueEntries,
          and(
            eq(queueEntries.roomId, playbacks.roomId),
            eq(queueEntries.handId, playbacks.handId),
            isNull(queueEntries.removedAt),
          ),
        )
        .where(eq(playbacks.roomId, roomId))
        .limit(1);
      if (endedOn) {
        await tx
          .update(roomMemberships)
          .set({ currentEntryId: endedOn.entryId })
          .where(eq(roomMemberships.roomId, roomId));
      }
      await tx.delete(playbacks).where(eq(playbacks.roomId, roomId));
      return true;
    });
  }

  /** Loads a Hand from the Room's Queue at its Initial State, with every name shown. */
  async load(
    master: Identity,
    roomId: string,
    handId: unknown,
  ): Promise<Playback> {
    await this.requireLiveMaster(master, roomId);
    await this.queuedContent(roomId, handId);
    const playback = {
      handId: handId as string,
      actionIndex: 0,
      hideOpponentNames: false,
    };
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
    await this.requireLiveMaster(master, roomId);
    const [loaded] = await this.db
      .select({
        handId: playbacks.handId,
        hideOpponentNames: playbacks.hideOpponentNames,
        content: hands.content,
      })
      .from(playbacks)
      .innerJoin(hands, eq(hands.id, playbacks.handId))
      .where(eq(playbacks.roomId, roomId));
    if (!loaded) throw new Rejected('no-hand-loaded');
    const step = validActionIndex(loaded.content, actionIndex);

    await this.db
      .update(playbacks)
      .set({ actionIndex: step, updatedAt: this.clock.now() })
      .where(eq(playbacks.roomId, roomId));
    return {
      handId: loaded.handId,
      actionIndex: step,
      hideOpponentNames: loaded.hideOpponentNames,
    };
  }

  /** Turns Hide Opponent Names on or off for the loaded Hand, where Playback is. */
  async hideOpponentNames(
    master: Identity,
    roomId: string,
    hidden: unknown,
  ): Promise<Playback> {
    await this.requireLiveMaster(master, roomId);
    if (typeof hidden !== 'boolean') {
      throw new Rejected('invalid-hide-opponent-names');
    }
    const [playback] = await this.db
      .update(playbacks)
      .set({ hideOpponentNames: hidden, updatedAt: this.clock.now() })
      .where(eq(playbacks.roomId, roomId))
      .returning(playbackColumns);
    if (!playback) throw new Rejected('no-hand-loaded');
    return playback;
  }

  /** Refuses anyone but the Master, and anything while the Room isn't Live. */
  private async requireLiveMaster(
    master: Identity,
    roomId: string,
  ): Promise<void> {
    await this.rooms.requireMaster(roomId, master.id);
    if ((await this.stateOf(roomId)) !== 'live') throw new Rejected('not-live');
  }

  private async stateOf(roomId: string): Promise<RoomState> {
    const [room] = await this.db
      .select({ state: rooms.state })
      .from(rooms)
      .where(eq(rooms.id, roomId));
    return room?.state ?? 'free-review';
  }

  /** The content of a Hand in the Room's Queue, or `hand-not-in-queue`. */
  private async queuedContent(
    roomId: string,
    handId: unknown,
  ): Promise<typeof hands.$inferSelect.content> {
    if (!isUuid(handId)) throw new Rejected('hand-not-in-queue');
    const [queued] = await this.db
      .select({ content: hands.content })
      .from(queueEntries)
      .innerJoin(hands, eq(hands.id, queueEntries.handId))
      .where(
        and(
          eq(queueEntries.roomId, roomId),
          eq(queueEntries.handId, handId),
          isNull(queueEntries.removedAt),
        ),
      )
      .limit(1);
    if (!queued) throw new Rejected('hand-not-in-queue');
    return queued.content;
  }
}

/** A step of the Hand's Timeline, or `invalid-action-index`. */
function validActionIndex(
  content: typeof hands.$inferSelect.content,
  actionIndex: unknown,
): number {
  if (
    typeof actionIndex !== 'number' ||
    !Number.isInteger(actionIndex) ||
    actionIndex < 0 ||
    actionIndex >= timeline(content).states.length
  ) {
    throw new Rejected('invalid-action-index');
  }
  return actionIndex;
}
