import { eq, isNull } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { hands } from '../database/schema.js';
import type { Hand } from './hand.js';
import { importHandHistory } from './import/import.js';
import { heroResult } from './replay/hero-result.js';

/** How many Hands each round reads and writes. */
const BATCH = 500;

/**
 * Gives every stored Hand that has no Rake yet its Rake and the Hero's Rake
 * Generated, and returns how many it filled in. Running it again finds none.
 *
 * A Hand with its Hand History is read again from that text, so its content
 * carries the Rake and the Fees apart, as a fresh import stores it. A Hand
 * without one keeps what it has: everything the house took counts as Rake,
 * with no Fees.
 */
export async function backfillRake(db: Database): Promise<number> {
  let filled = 0;
  for (;;) {
    const rows = await db
      .select({
        id: hands.id,
        content: hands.content,
        handHistory: hands.handHistory,
      })
      .from(hands)
      .where(isNull(hands.rake))
      .limit(BATCH);
    if (rows.length === 0) return filled;
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const hand = (row.handHistory === null
          ? null
          : reread(row.handHistory, row.content)) ?? {
          ...row.content,
          fees: row.content.fees ?? 0,
        };
        await tx
          .update(hands)
          .set({
            content: hand,
            rake: hand.rake,
            heroRakeGenerated: heroResult(hand).rakeGenerated,
          })
          .where(eq(hands.id, row.id));
      }
    });
    filled += rows.length;
  }
}

/** The Hand read again from its Hand History, or null if it no longer reads. */
function reread(text: string, stored: Hand): Hand | null {
  return (
    importHandHistory(text, { format: stored.sourceFormat }).hands[0] ?? null
  );
}
