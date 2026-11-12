import { isDeepStrictEqual } from 'node:util';
import { and, asc, eq, gt, isNotNull } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { hands } from '../database/schema.js';
import { handKey, keyOf, replaceStats } from './hand-store.js';
import { fromStored, type Hand } from './hand.js';
import { importHandHistory } from './import/import.js';
import { heroResult } from './replay/hero-result.js';
import { finalPot } from './replay/overview.js';

/** How many Hands each round reads. */
const BATCH = 500;

/** What a stored Hand keeps that is read, or worked out, from its text. */
export interface ReadColumns {
  content: Hand;
  heroResult: number;
  heroAllInEv: number;
  heroReachedShowdown: boolean;
  finalPot: number;
  rake: number;
  heroRakeGenerated: number;
}

/** What the backfill went through. */
export interface RereadCount {
  /** Hands with a Hand History, read again. */
  read: number;
  /** Hands whose columns changed once read again, and were rewritten. */
  rewritten: number;
  /** Hands whose Hand History no longer reads as that same Hand, left as they are. */
  unread: number;
}

/**
 * The columns a stored Hand gets from its Hand History, read again with the
 * parser as it is now; null when the text no longer reads as exactly the
 * Hand with that key, so nothing is rewritten from it.
 */
export function rereadColumns(text: string, key: string): ReadColumns | null {
  const read = importHandHistory(text).hands;
  if (read.length !== 1 || keyOf(read[0]) !== key) return null;
  const [hand] = read;
  const { result, allInEv, reachedShowdown, rakeGenerated } = heroResult(hand);
  return {
    content: hand,
    heroResult: result,
    heroAllInEv: allInEv,
    heroReachedShowdown: reachedShowdown,
    finalPot: finalPot(hand),
    rake: hand.rake,
    heroRakeGenerated: rakeGenerated,
  };
}

/** The columns as the database gives them back: content through JSON. */
function asStored(columns: ReadColumns): ReadColumns {
  return {
    ...columns,
    content: fromStored(JSON.parse(JSON.stringify(columns.content))),
  };
}

/**
 * Reads every stored Hand that keeps its Hand History again, as import
 * does, and rewrites its content, the columns worked out from it and its
 * Stat rows wherever they changed: a fix to a parser reaches the Hands
 * already stored. Hands stored without their text are left as they are.
 * Nothing changes when it runs again.
 */
export async function rereadHands(db: Database): Promise<RereadCount> {
  const count: RereadCount = { read: 0, rewritten: 0, unread: 0 };
  let after: string | null = null;
  for (;;) {
    const rows = await db
      .select({
        id: hands.id,
        site: hands.site,
        siteHandId: hands.siteHandId,
        heroScreenName: hands.heroScreenName,
        heroSeat: hands.heroSeat,
        handHistory: hands.handHistory,
        content: hands.content,
        heroResult: hands.heroResult,
        heroAllInEv: hands.heroAllInEv,
        heroReachedShowdown: hands.heroReachedShowdown,
        finalPot: hands.finalPot,
        rake: hands.rake,
        heroRakeGenerated: hands.heroRakeGenerated,
      })
      .from(hands)
      .where(
        and(
          isNotNull(hands.handHistory),
          after === null ? undefined : gt(hands.id, after),
        ),
      )
      .orderBy(asc(hands.id))
      .limit(BATCH);
    if (rows.length === 0) return count;
    after = rows[rows.length - 1].id;
    count.read += rows.length;

    const changed: { id: string; columns: ReadColumns }[] = [];
    for (const row of rows) {
      const columns = rereadColumns(
        row.handHistory!,
        handKey(row.site, row.siteHandId, row.heroScreenName, row.heroSeat),
      );
      if (columns === null) {
        count.unread += 1;
      } else if (
        !isDeepStrictEqual(asStored(columns), {
          content: row.content,
          heroResult: row.heroResult,
          heroAllInEv: row.heroAllInEv,
          heroReachedShowdown: row.heroReachedShowdown,
          finalPot: row.finalPot,
          rake: row.rake,
          heroRakeGenerated: row.heroRakeGenerated,
        })
      ) {
        changed.push({ id: row.id, columns });
      }
    }
    if (changed.length === 0) continue;
    await db.transaction(async (tx) => {
      for (const { id, columns } of changed) {
        await tx.update(hands).set(columns).where(eq(hands.id, id));
      }
      await replaceStats(
        tx,
        changed.map(({ id, columns }) => ({ id, hand: columns.content })),
      );
    });
    count.rewritten += changed.length;
  }
}
