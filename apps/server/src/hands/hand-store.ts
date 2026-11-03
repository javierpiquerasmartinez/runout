import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../database/database.js';
import { hands } from '../database/schema.js';
import { heroSeat, type Hand } from './hand.js';
import { heroResult } from './replay/hero-result.js';
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

/**
 * The Hand History each Hand was read from, by key, from texts in step with
 * `read`. A Hand read twice keeps the first text it was read from.
 */
export function historiesOf(
  read: Hand[],
  texts: readonly (string | null | undefined)[],
): Map<string, string> {
  const histories = new Map<string, string>();
  read.forEach((hand, index) => {
    const text = texts[index];
    const key = keyOf(hand);
    if (typeof text === 'string' && !histories.has(key)) {
      histories.set(key, text);
    }
  });
  return histories;
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
 * Gives the stored Hands in `ids` (by key) their Hand History from
 * `histories` (by key), when they have none. A Hand's text, once set, is
 * never replaced: it stays the first text it was read from.
 */
export async function fillHistories(
  db: Database | Transaction,
  ids: ReadonlyMap<string, string>,
  histories: ReadonlyMap<string, string>,
): Promise<void> {
  const rows = [...ids]
    .filter(([key]) => histories.has(key))
    .map(([key, id]) => sql`(${id}::uuid, ${histories.get(key)!})`);
  if (rows.length === 0) return;
  const filled = sql`filled`;
  await db
    .update(hands)
    .set({ handHistory: sql`${filled}.text` })
    .from(sql`(values ${sql.join(rows, sql`, `)}) as ${filled} (id, text)`)
    .where(and(eq(hands.id, sql`${filled}.id`), isNull(hands.handHistory)));
}

/**
 * Stores the Hands that aren't stored yet, with `importerId` as their
 * Importer and the Hand History in `histories` (by key) as their text, and
 * returns every Hand's id, in order. A Hand already stored without its text
 * gets it (see `fillHistories`).
 */
export async function storeHands(
  tx: Transaction,
  importerId: string,
  read: Hand[],
  now: Date,
  histories: ReadonlyMap<string, string> = new Map(),
): Promise<string[]> {
  if (read.length === 0) return [];
  const ids = await storedIds(tx, read);
  await fillHistories(tx, ids, histories);
  const toStore = read.filter((hand) => !ids.has(keyOf(hand)));
  if (toStore.length > 0) {
    // Another import may have stored one of them a moment ago; the
    // uniqueness constraint turns it away and it is read back below.
    const stored = await tx
      .insert(hands)
      .values(
        toStore.map((hand) => {
          const { result, allInEv, reachedShowdown } = heroResult(hand);
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
    const missing = toStore.filter((hand) => !ids.has(keyOf(hand)));
    if (missing.length > 0) {
      for (const [key, id] of await storedIds(tx, missing)) ids.set(key, id);
    }
  }
  return read.map((hand) => ids.get(keyOf(hand))!);
}
