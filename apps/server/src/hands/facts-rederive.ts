import { and, asc, eq, gt, isNull, lt, or } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { handFacts, hands } from '../database/schema.js';
import { writeFacts } from './hand-store.js';
import { FACTS_VERSION } from './replay/hero-facts.js';

/**
 * Works out again, by the current rules, the facts of every stored Hand
 * whose row is missing or was worked out by an older version, from the
 * Hand's stored content (never its Hand History, which not every Hand
 * keeps). It goes through the Hands in keyset batches of `batch`, each
 * written in its own transaction, so it can be stopped at any point and run
 * again: a row already brought up to date is no longer behind. Returns how
 * many Hands it wrote.
 */
export async function rederiveFacts(
  db: Database,
  { batch = 500 }: { batch?: number } = {},
): Promise<number> {
  let done = 0;
  let after: string | null = null;
  for (;;) {
    const rows: { id: string; content: typeof hands.$inferSelect.content }[] =
      await db
        .select({ id: hands.id, content: hands.content })
        .from(hands)
        .leftJoin(handFacts, eq(handFacts.handId, hands.id))
        .where(
          and(
            after === null ? undefined : gt(hands.id, after),
            or(isNull(handFacts.version), lt(handFacts.version, FACTS_VERSION)),
          ),
        )
        .orderBy(asc(hands.id))
        .limit(batch);
    if (rows.length === 0) return done;
    await db.transaction((tx) =>
      writeFacts(
        tx,
        rows.map((row) => ({ id: row.id, hand: row.content })),
      ),
    );
    done += rows.length;
    after = rows[rows.length - 1].id;
  }
}
