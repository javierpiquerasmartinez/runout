import { eq, isNull } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { hands } from '../database/schema.js';
import { finalPot } from './replay/summary.js';

/** How many Hands each round reads and writes. */
const BATCH = 500;

/**
 * Works out the final pot of every stored Hand that has none, as import
 * does now, and returns how many it filled in. Running it again finds none.
 */
export async function backfillFinalPots(db: Database): Promise<number> {
  let filled = 0;
  for (;;) {
    const rows = await db
      .select({ id: hands.id, content: hands.content })
      .from(hands)
      .where(isNull(hands.finalPot))
      .limit(BATCH);
    if (rows.length === 0) return filled;
    await db.transaction(async (tx) => {
      for (const row of rows) {
        await tx
          .update(hands)
          .set({ finalPot: finalPot(row.content) })
          .where(eq(hands.id, row.id));
      }
    });
    filled += rows.length;
  }
}
