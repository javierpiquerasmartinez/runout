import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../database/database.js';
import { handStats, hands } from '../database/schema.js';
import { heroSeat, type Hand } from './hand.js';
import { heroResult } from './replay/hero-result.js';
import { heroStats, STAT_KEYS } from './replay/hero-stats.js';
import { finalPot } from './replay/overview.js';

/*
 * Hands are stored once each (ADR 0002) and belong to no one (ADR 0004):
 * every import, into a Room or a Library, references the stored Hand when it
 * is already there.
 */

/** What makes a Hand the same Hand (ADR 0002). */
export function handKey(
  site: string,
  siteHandId: string,
  hero: string,
  seat: number,
): string {
  return JSON.stringify([site, siteHandId, hero, seat]);
}

export function keyOf(hand: Hand): string {
  return handKey(
    hand.site,
    hand.siteHandId,
    hand.hero.screenName,
    heroSeat(hand),
  );
}

const keyColumns = {
  id: hands.id,
  site: hands.site,
  siteHandId: hands.siteHandId,
  heroScreenName: hands.heroScreenName,
  heroSeat: hands.heroSeat,
};

type KeyRow = {
  id: string;
  site: string;
  siteHandId: string;
  heroScreenName: string;
  heroSeat: number;
};

function rowKey(row: KeyRow): string {
  return handKey(row.site, row.siteHandId, row.heroScreenName, row.heroSeat);
}

/** Hands read from Hand History text, with the Hand History each was read from, by key. */
export interface HandsRead {
  hands: Hand[];
  histories: ReadonlyMap<string, string>;
}

/**
 * The Hands with the Hand History each was read from, from texts in step
 * with `hands` (null where it wasn't kept). A Hand read twice keeps the
 * first text it was read from.
 */
export function withHistories(
  hands: Hand[],
  texts: readonly (string | null)[],
): HandsRead {
  const histories = new Map<string, string>();
  hands.forEach((hand, index) => {
    const text = texts[index];
    const key = keyOf(hand);
    if (text !== null && !histories.has(key)) histories.set(key, text);
  });
  return { hands, histories };
}

/** The ids of the Hands among `read` that are already stored, by key. */
export async function storedIds(
  db: Database | Transaction,
  read: Hand[],
): Promise<Map<string, string>> {
  if (read.length === 0) return new Map();
  const rows = await db
    .select(keyColumns)
    .from(hands)
    .where(
      inArray(
        hands.siteHandId,
        read.map((hand) => hand.siteHandId),
      ),
    );
  return new Map(rows.map((row) => [rowKey(row), row.id]));
}

/**
 * Gives the stored Hands in `ids` (by key) their Hand History from `read`,
 * when they have none, and rewrites their content, Rake and Rake Generated
 * as read from that text: stored without it, they had the Fees inside the
 * Rake. A Hand's text, once set, is never replaced: it stays the first text
 * it was read from.
 */
export async function fillHistoriesAndReread(
  db: Database | Transaction,
  ids: ReadonlyMap<string, string>,
  { hands: read, histories }: HandsRead,
): Promise<void> {
  const byKey = new Map<string, Hand>();
  for (const hand of read) {
    if (!byKey.has(keyOf(hand))) byKey.set(keyOf(hand), hand);
  }
  const rows = [...ids]
    .filter(([key]) => histories.has(key) && byKey.has(key))
    .map(([key, id]) => {
      const hand = byKey.get(key)!;
      return sql`(${id}::uuid, ${histories.get(key)!}, ${JSON.stringify(hand)}::jsonb,
        ${hand.rake}::integer, ${heroResult(hand).rakeGenerated}::integer)`;
    });
  if (rows.length === 0) return;
  const filled = sql`filled`;
  await db
    .update(hands)
    .set({
      handHistory: sql`${filled}.text`,
      content: sql`${filled}.content`,
      rake: sql`${filled}.rake`,
      heroRakeGenerated: sql`${filled}.rake_generated`,
    })
    .from(
      sql`(values ${sql.join(rows, sql`, `)}) as ${filled} (id, text, content, rake, rake_generated)`,
    )
    .where(and(eq(hands.id, sql`${filled}.id`), isNull(hands.handHistory)));
}

/**
 * Stores the Hands that aren't stored yet, with `importerId` as their
 * Importer and the Hand History each was read from as their text, and
 * returns every Hand's id, in order. A Hand already stored without its text
 * gets it (see `fillHistoriesAndReread`).
 */
export async function storeHands(
  tx: Transaction,
  importerId: string,
  handsRead: HandsRead,
  now: Date,
): Promise<string[]> {
  const { hands: read, histories } = handsRead;
  if (read.length === 0) return [];
  const ids = await storedIds(tx, read);
  await fillHistoriesAndReread(tx, ids, handsRead);
  const toStore = read.filter((hand) => !ids.has(keyOf(hand)));
  if (toStore.length > 0) {
    // Another import may have stored one of them a moment ago; the
    // uniqueness constraint turns it away and it is read back below.
    const stored = await tx
      .insert(hands)
      .values(
        toStore.map((hand) => {
          const { result, allInEv, reachedShowdown, rakeGenerated } =
            heroResult(hand);
          return {
            site: hand.site,
            siteHandId: hand.siteHandId,
            heroScreenName: hand.hero.screenName,
            heroSeat: heroSeat(hand),
            importerId,
            sourceFormat: hand.sourceFormat,
            playedAt: new Date(hand.playedAt),
            smallBlind: hand.stake.smallBlind,
            bigBlind: hand.stake.bigBlind,
            currency: hand.stake.currency,
            heroResult: result,
            heroAllInEv: allInEv,
            heroReachedShowdown: reachedShowdown,
            finalPot: finalPot(hand),
            rake: hand.rake,
            heroRakeGenerated: rakeGenerated,
            content: hand,
            handHistory: histories.get(keyOf(hand)) ?? null,
            importedAt: now,
          };
        }),
      )
      .onConflictDoNothing({
        target: [
          hands.site,
          hands.siteHandId,
          hands.heroScreenName,
          hands.heroSeat,
        ],
      })
      .returning(keyColumns);
    for (const row of stored) ids.set(rowKey(row), row.id);
    await storeStats(
      tx,
      stored.map((row) => ({
        id: row.id,
        hand: toStore.find((hand) => keyOf(hand) === rowKey(row))!,
      })),
    );
    const missing = toStore.filter((hand) => !ids.has(keyOf(hand)));
    if (missing.length > 0) {
      for (const [key, id] of await storedIds(tx, missing)) ids.set(key, id);
    }
  }
  return read.map((hand) => ids.get(keyOf(hand))!);
}

/**
 * Writes the Hero's Stat rows of Hands just stored: one per Stat they had
 * an opportunity at (see `heroStats`).
 */
async function storeStats(
  tx: Transaction,
  stored: { id: string; hand: Hand }[],
): Promise<void> {
  const rows = stored.flatMap(({ id, hand }) => {
    const stats = heroStats(hand);
    return STAT_KEYS.filter((stat) => stats[stat].opportunities > 0).map(
      (stat) => ({ handId: id, stat, ...stats[stat] }),
    );
  });
  if (rows.length > 0) await tx.insert(handStats).values(rows);
}
