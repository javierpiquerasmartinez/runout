import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { rooms } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { RoomsService } from './rooms.service.js';

/** The role has moved, and why. Sent to the whole Room as `room.masterChanged`. */
export interface MasterChanged {
  masterId: string;
  /** `handover` when the Master gave it away, `failover` when they dropped. */
  reason: 'handover' | 'failover';
}

/**
 * Who holds the Master role of a Room. It is handed over on purpose, or it
 * passes on its own when the Master drops (see `MasterFailover`); it is never
 * requested back.
 */
@Injectable()
export class MasterService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rooms: RoomsService,
  ) {}

  /**
   * The Master gives the role to another Participant of the Room, kicked ones
   * apart. Playback is not touched: the Room stays on its Hand and Action.
   */
  async handOver(
    master: Identity,
    roomId: string,
    toIdentityId: unknown,
  ): Promise<MasterChanged> {
    await this.rooms.requireMaster(roomId, master.id);
    if (!isUuid(toIdentityId)) throw new Rejected('not-a-participant');
    if (toIdentityId === master.id) throw new Rejected('already-master');
    if (!(await this.rooms.isParticipant(roomId, toIdentityId))) {
      throw new Rejected('not-a-participant');
    }
    // The Room moved on between the check and the write — it closed, or the
    // role passed on: whoever asked is no longer the Master to give it away.
    if (!(await this.take(roomId, master.id, toIdentityId))) {
      throw new Rejected('not-master');
    }
    return { masterId: toIdentityId, reason: 'handover' };
  }

  /**
   * The role passes to `successorId` because the Master has been away too
   * long. Null when it moved on meanwhile, or the Room is no longer open.
   */
  async failOver(
    roomId: string,
    fromMasterId: string,
    successorId: string,
  ): Promise<MasterChanged | null> {
    const taken = await this.take(roomId, fromMasterId, successorId);
    return taken ? { masterId: successorId, reason: 'failover' } : null;
  }

  /** Moves the role of an open Room, but only while `fromMasterId` still holds it. */
  private async take(
    roomId: string,
    fromMasterId: string,
    toIdentityId: string,
  ): Promise<boolean> {
    const changed = await this.db
      .update(rooms)
      .set({ masterId: toIdentityId })
      .where(
        and(
          eq(rooms.id, roomId),
          eq(rooms.status, 'open'),
          eq(rooms.masterId, fromMasterId),
        ),
      )
      .returning({ id: rooms.id });
    return changed.length > 0;
  }
}
