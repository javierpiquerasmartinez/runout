import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../database/database.js';
import { hands, libraryEntries, marks } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import type { Hand, PokerSite, Stake } from '../hands/hand.js';
import { keyOf, storedIds, storeHands } from '../hands/hand-store.js';
import type { Discarded } from '../hands/import/import.js';
import { summarise, type HandSummary } from '../hands/replay/summary.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import {
  libraryFilterWhere,
  markedBy,
  stakeKey,
  stakeLimit,
  type LibraryFilter,
  type LibraryFilterOptions,
} from './library-filter.js';

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
  /** Whether this person has Marked it. Nobody else is ever told. */
  marked: boolean;
  summary: HandSummary;
}

/** One page of the Hands a filter keeps, newest first, with how many it keeps. */
export interface LibraryPage {
  total: number;
  /** From 1. */
  page: number;
  pageSize: number;
  hands: LibraryHand[];
  /** What the whole Library holds to filter by, whatever this filter. */
  options: LibraryFilterOptions;
  /** The whole Library's Hands, and how many of them are Marked. */
  counts: { all: number; marked: number };
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

  /**
   * One page of the Hands the filter keeps, newest first by when each Hand
   * was played, with what the whole Library offers to filter by.
   */
  async page(
    account: Identity,
    filter: LibraryFilter,
    page: unknown,
    pageSize: unknown,
  ): Promise<LibraryPage> {
    const size = boundedInt(pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const number = boundedInt(page, 1, 1, Number.MAX_SAFE_INTEGER);
    const kept = libraryFilterWhere(account.id, filter);
    const marked = markedBy(account.id);
    const [[{ total }], rows, options, counts] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(libraryEntries)
        .innerJoin(hands, eq(hands.id, libraryEntries.handId))
        .where(kept),
      this.db
        .select({
          id: hands.id,
          result: hands.heroResult,
          content: hands.content,
          marked: sql<boolean>`${marked}`,
        })
        .from(libraryEntries)
        .innerJoin(hands, eq(hands.id, libraryEntries.handId))
        .where(kept)
        .orderBy(desc(hands.playedAt), desc(hands.id))
        .limit(size)
        .offset((number - 1) * size),
      this.options(account),
      this.counts(account),
    ]);
    return {
      total,
      page: number,
      pageSize: size,
      hands: rows.map(({ id, result, content, marked }) => ({
        id,
        site: content.site,
        siteHandId: content.siteHandId,
        hero: content.hero.screenName,
        holeCards: content.hero.cards,
        playedAt: content.playedAt,
        stake: content.stake,
        result,
        marked,
        summary: summarise(content),
      })),
      options,
      counts,
    };
  }

  /**
   * The person Marks a Hand of their Library, or takes the Mark off. A Hand
   * outside it is `hand-not-found`, as if it didn't exist.
   */
  async setMark(
    account: Identity,
    handId: string,
    marked: boolean,
  ): Promise<{ handId: string; marked: boolean }> {
    if (!isUuid(handId) || !(await this.holds(account, handId))) {
      throw new Rejected('hand-not-found');
    }
    if (marked) {
      await this.db
        .insert(marks)
        .values({ identityId: account.id, handId, markedAt: this.clock.now() })
        .onConflictDoNothing();
    } else {
      await this.db
        .delete(marks)
        .where(and(eq(marks.identityId, account.id), eq(marks.handId, handId)));
    }
    return { handId, marked };
  }

  /** The Poker Sites, Heroes and Stakes present in the Library, sorted. */
  private async options(account: Identity): Promise<LibraryFilterOptions> {
    const rows = await this.db
      .selectDistinct({
        site: hands.site,
        hero: hands.heroScreenName,
        limit: stakeLimit,
        smallBlind: hands.smallBlind,
        bigBlind: hands.bigBlind,
        currency: hands.currency,
      })
      .from(libraryEntries)
      .innerJoin(hands, eq(hands.id, libraryEntries.handId))
      .where(eq(libraryEntries.identityId, account.id));
    const stakes = new Map<string, Stake>();
    for (const { limit, smallBlind, bigBlind, currency } of rows) {
      stakes.set(stakeKey({ limit, smallBlind, bigBlind, currency }), {
        limit,
        smallBlind,
        bigBlind,
        currency,
      });
    }
    return {
      sites: sortedUnique(rows.map((row) => row.site as PokerSite)),
      heroes: sortedUnique(rows.map((row) => row.hero)),
      stakes: [...stakes.values()].sort(
        (a, b) =>
          a.bigBlind - b.bigBlind ||
          a.smallBlind - b.smallBlind ||
          a.currency.localeCompare(b.currency) ||
          a.limit.localeCompare(b.limit),
      ),
    };
  }

  /** How many Hands the whole Library holds, and how many of them are Marked. */
  private async counts(
    account: Identity,
  ): Promise<{ all: number; marked: number }> {
    const [row] = await this.db
      .select({
        all: count(),
        marked:
          sql<number>`count(*) filter (where ${markedBy(account.id)})`.mapWith(
            Number,
          ),
      })
      .from(libraryEntries)
      .innerJoin(hands, eq(hands.id, libraryEntries.handId))
      .where(eq(libraryEntries.identityId, account.id));
    return row;
  }

  /** Whether the Hand is in this Library. */
  private async holds(account: Identity, handId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ handId: libraryEntries.handId })
      .from(libraryEntries)
      .where(
        and(
          eq(libraryEntries.identityId, account.id),
          eq(libraryEntries.handId, handId),
        ),
      );
    return row !== undefined;
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

function sortedUnique<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
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
