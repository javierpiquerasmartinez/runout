import { eq, isNull } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { hands } from '../database/schema.js';
import type { Hand } from './hand.js';
import { importHandHistory } from './import/import.js';
import { heroResult } from './replay/hero-result.js';

/** How many Hands each round reads and writes. */
const BATCH = 500;

/** What a run of the backfill did. */
export interface RakeBackfill {
  /** How many Hands it gave a Rake and Rake Generated. */
  filled: number;
  /**
   * How many of them have a Hand History that no longer reads, so kept what
   * they had, as a Hand without one does.
   */
  unreadable: number;
}

/**
 * Gives every stored Hand that has no Rake yet its Rake and the Hero's Rake
 * Generated. Running it again finds none.
 *
 * A Hand with its Hand History is read again from that text, so its content
 * carries the Rake and the Fees apart, as a fresh import stores it. A Hand
 * without one, or whose text no longer reads, keeps what it has: the Rake
 * and the Fees together count as Rake, with no Fees.
 */
export async function backfillRake(db: Database): Promise<RakeBackfill> {
  const report: RakeBackfill = { filled: 0, unreadable: 0 };
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
    if (rows.length === 0) return report;
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const reread =
          row.handHistory === null
            ? null
            : readAgain(row.handHistory, row.content);
        if (row.handHistory !== null && reread === null) report.unreadable++;
        const hand = reread ?? row.content;
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
    report.filled += rows.length;
  }
}

/** The Hand read again from its Hand History, or null if it no longer reads. */
function readAgain(text: string, stored: Hand): Hand | null {
  return (
    importHandHistory(text, { format: stored.sourceFormat }).hands[0] ?? null
  );
}
