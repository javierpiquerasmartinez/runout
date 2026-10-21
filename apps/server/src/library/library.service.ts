import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../database/database.js';
import { hands, libraryEntries } from '../database/schema.js';
import type { Hand, PokerSite, Stake } from '../hands/hand.js';
import { keyOf, storedIds, storeHands } from '../hands/hand-store.js';
import type { Discarded } from '../hands/import/import.js';
import { summarise, type HandSummary } from '../hands/replay/summary.js';
import type { Identity } from '../identity/identity.service.js';

/** A Library row: what tells the spot apart at a glance. */
export interface LibraryHand {
  id: string;
  site: PokerSite;
  siteHandId: string;
  /** The Hero's Screen Name, as the Hand History states it. */
  hero: string;
  holeCards: string[];
  playedAt: string;
  stake: Stake;
  /** The Hero's Result, as an Amount. */
  result: number;
  summary: HandSummary;
}

/** One page of a Library, newest first, with how many Hands it holds. */
export interface LibraryPage {
  total: number;
  /** From 1. */
  page: number;
  pageSize: number;
  hands: LibraryHand[];
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * An Account's Library: the Hands it imported, whatever their Hero (ADR
 * 0004). It holds references, so a Hand someone else has is shared, Notes
 * included.
 */
@Injectable()
export class LibraryService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * What importing these Hands would add: the ones not in this Library yet.
   * The others, and any read twice from the same text, are duplicates.
   */
  async planImport(
    account: Identity,
    read: Hand[],
    texts: string[],
    db: Database | Transaction = this.db,
  ): Promise<{ kept: Hand[]; duplicates: Discarded[] }> {
    const inLibrary = await this.inLibrary(account, read, db);
    const kept: Hand[] = [];
    const duplicates: Discarded[] = [];
    const taken = new Set<string>();
    read.forEach((hand, index) => {
      const key = keyOf(hand);
      if (inLibrary.has(key) || taken.has(key)) {
        duplicates.push({ text: texts[index], reason: 'duplicate' });
        return;
      }
      taken.add(key);
      kept.push(hand);
    });
    return { kept, duplicates };
  }

  /**
   * Adds the Hands to the Library inside the caller's transaction, storing
   * those nobody has imported before. Returns how many were added: one
   * added since it was previewed is skipped.
   */
  async add(tx: Transaction, account: Identity, read: Hand[]): Promise<number> {
    const { kept } = await this.planImport(account, read, [], tx);
    if (kept.length === 0) return 0;
    const now = this.clock.now();
    const handIds = await storeHands(tx, account.id, kept, now);
    const added = await tx
      .insert(libraryEntries)
      .values(
        handIds.map((handId) => ({
          identityId: account.id,
          handId,
          addedAt: now,
        })),
      )
      .onConflictDoNothing()
      .returning({ handId: libraryEntries.handId });
    return added.length;
  }

  /** One page of the Library, newest first by when each Hand was played. */
  async page(
    account: Identity,
    page: unknown,
    pageSize: unknown,
  ): Promise<LibraryPage> {
    const size = boundedInt(pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const number = boundedInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
    const mine = eq(libraryEntries.identityId, account.id);
    const [[{ total }], rows] = await Promise.all([
      this.db.select({ total: count() }).from(libraryEntries).where(mine),
      this.db
        .select({
          id: hands.id,
          result: hands.heroResult,
          content: hands.content,
        })
        .from(libraryEntries)
        .innerJoin(hands, eq(hands.id, libraryEntries.handId))
        .where(mine)
        .orderBy(desc(hands.playedAt), desc(hands.id))
        .limit(size)
        .offset((number - 1) * size),
    ]);
    return {
      total,
      page: number,
      pageSize: size,
      hands: rows.map(({ id, result, content }) => ({
        id,
        site: content.site,
        siteHandId: content.siteHandId,
        hero: content.hero.screenName,
        holeCards: content.hero.cards,
        playedAt: content.playedAt,
        stake: content.stake,
        result,
        summary: summarise(content),
      })),
    };
  }

  /** The keys of the Hands among `read` this Library already has. */
  private async inLibrary(
    account: Identity,
    read: Hand[],
    db: Database | Transaction,
  ): Promise<Set<string>> {
    const stored = await storedIds(db, read);
    if (stored.size === 0) return new Set();
    const rows = await db
      .select({ handId: libraryEntries.handId })
      .from(libraryEntries)
      .where(
        and(
          eq(libraryEntries.identityId, account.id),
          inArray(libraryEntries.handId, [...stored.values()]),
        ),
      );
    const held = new Set(rows.map((row) => row.handId));
    return new Set(
      [...stored].filter(([, id]) => held.has(id)).map(([key]) => key),
    );
  }
}

/** A whole number from a query string, within bounds, or the fallback. */
function boundedInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
