import { and, eq, isNull } from 'drizzle-orm';
import type { Database, Transaction } from '../database/database.js';
import { queueEntries } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import { Rejected } from '../rejection/rejection.js';

/**
 * The id of a Hand that is in the Room's Queue right now, for what hangs off
 * a Hand while the Room is reviewing it. Anything else — a Hand of another
 * Room, one whose Queue Entry was removed, or no id at all — is
 * `hand-not-in-queue`.
 */
export async function requireQueued(
  db: Database | Transaction,
  roomId: string,
  handId: unknown,
): Promise<string> {
  if (!isUuid(handId)) throw new Rejected('hand-not-in-queue');
  const [queued] = await db
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
  return handId;
}
