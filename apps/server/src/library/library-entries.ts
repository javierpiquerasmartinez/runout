import { and, eq, inArray } from 'drizzle-orm';
import type { Database, Transaction } from '../database/database.js';
import { libraryEntries } from '../database/schema.js';
import type { Hand } from '../hands/hand.js';
import { storedIds, storeHands, type HandsRead } from '../hands/hand-store.js';
import type { HeroResults } from '../hands/hero-results.js';

/*
 * What a Library holds, written and read without the rest of the Library:
 * the import service adds Hands with these, with no Rooms around it.
 */

/** The ids of the Hands among `read` already in the Account's Library, by key. */
export async function inLibrary(
  db: Database | Transaction,
  accountId: string,
  read: Hand[],
): Promise<Map<string, string>> {
  const stored = await storedIds(db, read);
  if (stored.size === 0) return new Map();
  const rows = await db
    .select({ handId: libraryEntries.handId })
    .from(libraryEntries)
    .where(
      and(
        eq(libraryEntries.identityId, accountId),
        inArray(libraryEntries.handId, [...stored.values()]),
      ),
    );
  const held = new Set(rows.map((row) => row.handId));
  return new Map([...stored].filter(([, id]) => held.has(id)));
}

/**
 * Stores the Hands nobody has imported before and adds every one to the
 * Account's Library, inside the caller's transaction. Returns the ids of the
 * Hands added: one already there is not added again.
 */
export async function addToLibrary(
  tx: Transaction,
  heroResults: HeroResults,
  accountId: string,
  read: HandsRead,
  now: Date,
): Promise<string[]> {
  const handIds = await storeHands(tx, heroResults, accountId, read, now);
  if (handIds.length === 0) return [];
  const added = await tx
    .insert(libraryEntries)
    .values(
      handIds.map((handId) => ({
        identityId: accountId,
        handId,
        addedAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ handId: libraryEntries.handId });
  return added.map((row) => row.handId);
}
