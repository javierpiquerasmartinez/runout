import { asc, gt } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { hands } from '../database/schema.js';
import { replaceStats } from './hand-store.js';

/** How many Hands each round reads and writes. */
const BATCH = 500;

/**
 * Works out the Hero's Stat rows of every stored Hand from its stored
 * content, as import does, and returns how many Hands it went through. Each
 * Hand's rows are replaced, never added to, so running it again changes
 * nothing.
 */
export async function backfillStats(db: Database): Promise<number> {
  let done = 0;
  let after: string | null = null;
  for (;;) {
    const rows: { id: string; content: typeof hands.$inferSelect.content }[] =
      await db
        .select({ id: hands.id, content: hands.content })
        .from(hands)
        .where(after === null ? undefined : gt(hands.id, after))
        .orderBy(asc(hands.id))
        .limit(BATCH);
    if (rows.length === 0) return done;
    await db.transaction((tx) =>
      replaceStats(
        tx,
        rows.map((row) => ({ id: row.id, hand: row.content })),
      ),
    );
    done += rows.length;
    after = rows[rows.length - 1].id;
  }
}
