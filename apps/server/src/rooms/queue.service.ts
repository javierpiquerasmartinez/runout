import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, max, sql, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../database/database.js';
import {
  hands,
  identities,
  queueEntries,
  roomMemberships,
  rooms,
  screenNames,
} from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import type { Hand, PokerSite, Stake } from '../hands/hand.js';
import { importHandHistory, type Discarded } from '../hands/import/import.js';
import { summarise, type HandSummary } from '../hands/replay/summary.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { RoomsService, type Room } from './rooms.service.js';
import { requireUndoable } from './undo-window.js';

export interface Author {
  identityId: string;
  displayName: string;
}

/** A Queue row as every Participant sees it. */
export interface QueueEntry {
  id: string;
  handId: string;
  position: number;
  author: Author;
  /**
   * With `siteHandId`, which real-world hand this is: two entries sharing
   * both are the same hand seen from two Heroes' seats (ADR 0002).
   */
  site: PokerSite;
  siteHandId: string;
  playedAt: string;
  stake: Stake;
  summary: HandSummary;
}

/** Who a Hand's Author would be, and whether its Hero matched their Screen Names. */
export interface Attribution {
  author: Author;
  /** False when nobody's Screen Names include the Hero, so the Importer is the Author. */
  heroMatched: boolean;
}

/** A Hand an import is about to put in the Queue. */
export interface Queued extends Attribution {
  hand: Hand;
  /** Set when the Hand is already stored, from an earlier import (ADR 0002). */
  storedId?: string;
}

export interface Pasted {
  room: Room;
  /** The new Queue Entries, in Queue order. Empty when no Hand was read. */
  entries: QueueEntry[];
  discarded: Discarded[];
}

/** A Room's Queue: the Hands it is going to review, in order. */
@Injectable()
export class QueueService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly rooms: RoomsService,
  ) {}

  /**
   * Imports the Hands in pasted Hand History text and appends them to the
   * Room's Queue. Any Participant may import. Hands already in this Queue are
   * discarded as duplicates.
   */
  async paste(
    importer: Identity,
    code: string,
    text: unknown,
  ): Promise<Pasted> {
    const room = await this.rooms.findOpen(code);
    await this.rooms.requireParticipant(room.id, importer.id);
    const result = importHandHistory(typeof text === 'string' ? text : '');
    const { duplicates } = await this.planImport(
      room.id,
      importer,
      result.hands,
      result.texts,
    );
    const entries = await this.db.transaction((tx) =>
      this.append(tx, room, importer, result.hands),
    );
    return { room, entries, discarded: [...result.discarded, ...duplicates] };
  }

  /**
   * What importing these Hands into the Room would do: which ones join the
   * Queue and under which Author, and which are duplicates — already in this
   * Room's Queue, or read twice from the same text. A Hand stored from an
   * earlier Room is not imported again: the Queue Entry references it, with
   * the Author it already has (ADR 0002).
   */
  async planImport(
    roomId: string,
    importer: Identity,
    read: Hand[],
    texts: string[],
    db: Database | Transaction = this.db,
  ): Promise<{ queued: Queued[]; duplicates: Discarded[] }> {
    const stored = await this.storedHands(roomId, read, db);
    const matched = await this.attribute(roomId, importer, read, db);
    const queued: Queued[] = [];
    const duplicates: Discarded[] = [];
    const taken = new Set<string>();
    read.forEach((hand, index) => {
      const key = handKey(hand.site, hand.siteHandId, hand.hero.screenName);
      const known = stored.get(key);
      if (known?.inQueue || taken.has(key)) {
        duplicates.push({ text: texts[index], reason: 'duplicate' });
        return;
      }
      taken.add(key);
      queued.push({
        hand,
        storedId: known?.id,
        // A stored Hand keeps the Author it was given when it was imported.
        author: known?.author ?? matched[index].author,
        heroMatched: matched[index].heroMatched,
      });
    });
    return { queued, duplicates };
  }

  /**
   * The Hands among `read` that are already stored: their id, their Author,
   * and whether they are in this Room's Queue already.
   */
  private async storedHands(
    roomId: string,
    read: Hand[],
    db: Database | Transaction,
  ): Promise<Map<string, { id: string; author: Author; inQueue: boolean }>> {
    if (read.length === 0) return new Map();
    const rows = await db
      .select({
        id: hands.id,
        site: hands.site,
        siteHandId: hands.siteHandId,
        heroScreenName: hands.heroScreenName,
        authorId: hands.authorId,
        authorName: identities.displayName,
        queueEntryId: queueEntries.id,
      })
      .from(hands)
      .innerJoin(identities, eq(identities.id, hands.authorId))
      .leftJoin(
        queueEntries,
        and(
          eq(queueEntries.handId, hands.id),
          eq(queueEntries.roomId, roomId),
          isNull(queueEntries.removedAt),
        ),
      )
      .where(
        inArray(
          hands.siteHandId,
          read.map((hand) => hand.siteHandId),
        ),
      );
    return new Map(
      rows.map((row) => [
        handKey(row.site, row.siteHandId, row.heroScreenName),
        {
          id: row.id,
          author: {
            identityId: row.authorId,
            displayName: row.authorName ?? '',
          },
          inQueue: row.queueEntryId !== null,
        },
      ]),
    );
  }

  /**
   * Who each Hand's Author would be: the Participant of the Room whose Screen
   * Names include its Hero, ignoring case, or else the Importer. When several
   * Participants claim the Hero, the Importer wins if they are one of them,
   * then whoever joined the Room first.
   */
  async attribute(
    roomId: string,
    importer: Identity,
    read: Hand[],
    db: Database | Transaction = this.db,
  ): Promise<Attribution[]> {
    const heroes = [
      ...new Set(read.map((hand) => hand.hero.screenName.toLowerCase())),
    ];
    const claims =
      heroes.length === 0
        ? []
        : await db
            .select({
              hero: sql<string>`lower(${screenNames.screenName})`,
              identityId: identities.id,
              displayName: identities.displayName,
            })
            .from(screenNames)
            .innerJoin(
              roomMemberships,
              and(
                eq(roomMemberships.identityId, screenNames.identityId),
                eq(roomMemberships.roomId, roomId),
                eq(roomMemberships.kicked, false),
              ),
            )
            .innerJoin(identities, eq(identities.id, screenNames.identityId))
            .where(inArray(sql`lower(${screenNames.screenName})`, heroes))
            .orderBy(
              sql`${identities.id} = ${importer.id} desc`,
              asc(roomMemberships.joinedAt),
            );

    const claimed = new Map<string, Author>();
    for (const claim of claims) {
      if (claimed.has(claim.hero)) continue;
      claimed.set(claim.hero, {
        identityId: claim.identityId,
        displayName: claim.displayName ?? '',
      });
    }
    const importerAsAuthor = {
      identityId: importer.id,
      displayName: importer.displayName ?? '',
    };
    return read.map((hand) => {
      const author = claimed.get(hand.hero.screenName.toLowerCase());
      return author
        ? { author, heroMatched: true }
        : { author: importerAsAuthor, heroMatched: false };
    });
  }

  /**
   * Stores the Hands this Room hasn't got yet, attributed to their Authors,
   * and appends a Queue Entry for each Hand that isn't in the Queue, inside
   * the caller's transaction. Returns the new Queue Entries, in Queue order.
   */
  async append(
    tx: Transaction,
    room: Room,
    importer: Identity,
    read: Hand[],
  ): Promise<QueueEntry[]> {
    if (read.length === 0) return [];
    const now = this.clock.now();
    // Serialises appends to one Room, so two imports never share a position.
    await this.lockRoom(tx, room.id);
    const [{ last }] = await tx
      .select({ last: max(queueEntries.position) })
      .from(queueEntries)
      .where(eq(queueEntries.roomId, room.id));
    // Read again inside the transaction: Screen Names, and the Queue itself,
    // may have moved on since the import was previewed.
    const { queued } = await this.planImport(room.id, importer, read, [], tx);
    if (queued.length === 0) return [];

    const handIds = await this.store(tx, importer, queued, now);
    const added = await tx
      .insert(queueEntries)
      .values(
        handIds.map((handId, index) => ({
          roomId: room.id,
          handId,
          position: (last ?? 0) + index + 1,
          addedAt: now,
        })),
      )
      .returning({ id: queueEntries.id });

    const addedIds = new Set(added.map(({ id }) => id));
    return (await this.entries(room.id, tx)).filter((entry) =>
      addedIds.has(entry.id),
    );
  }

  /** Stores the Hands that aren't stored yet, and returns every Hand's id, in order. */
  private async store(
    tx: Transaction,
    importer: Identity,
    queued: Queued[],
    now: Date,
  ): Promise<string[]> {
    const toStore = queued.filter((each) => each.storedId === undefined);
    const ids = new Map(
      queued.flatMap((each) =>
        each.storedId ? [[keyOf(each.hand), each.storedId] as const] : [],
      ),
    );
    if (toStore.length > 0) {
      // Another Room's import may have stored one of them a moment ago; the
      // uniqueness constraint turns it away and it is read back below.
      const stored = await tx
        .insert(hands)
        .values(
          toStore.map(({ hand, author }) => ({
            site: hand.site,
            siteHandId: hand.siteHandId,
            heroScreenName: hand.hero.screenName,
            authorId: author.identityId,
            importerId: importer.id,
            sourceFormat: hand.sourceFormat,
            playedAt: new Date(hand.playedAt),
            smallBlind: hand.stake.smallBlind,
            bigBlind: hand.stake.bigBlind,
            currency: hand.stake.currency,
            content: hand,
            importedAt: now,
          })),
        )
        .onConflictDoNothing({
          target: [hands.site, hands.siteHandId, hands.heroScreenName],
        })
        .returning({
          id: hands.id,
          site: hands.site,
          siteHandId: hands.siteHandId,
          heroScreenName: hands.heroScreenName,
        });
      for (const row of stored) {
        ids.set(handKey(row.site, row.siteHandId, row.heroScreenName), row.id);
      }
      const missing = toStore.filter((each) => !ids.has(keyOf(each.hand)));
      if (missing.length > 0) {
        const rows = await tx
          .select({
            id: hands.id,
            site: hands.site,
            siteHandId: hands.siteHandId,
            heroScreenName: hands.heroScreenName,
          })
          .from(hands)
          .where(
            inArray(
              hands.siteHandId,
              missing.map(({ hand }) => hand.siteHandId),
            ),
          );
        for (const row of rows) {
          ids.set(
            handKey(row.site, row.siteHandId, row.heroScreenName),
            row.id,
          );
        }
      }
    }
    return queued.map(({ hand }) => ids.get(keyOf(hand))!);
  }

  /**
   * The Master gives a Hand in the Queue another Author: any Participant of
   * the Room who hasn't been kicked.
   */
  async reassignAuthor(
    master: Identity,
    roomId: string,
    handId: unknown,
    authorId: unknown,
  ): Promise<{ handId: string; author: Author }> {
    await this.rooms.requireMaster(roomId, master.id);
    if (!isUuid(handId)) throw new Rejected('hand-not-in-queue');
    const [queued] = await this.db
      .select({ id: queueEntries.id })
      .from(queueEntries)
      .where(
        and(
          eq(queueEntries.roomId, roomId),
          eq(queueEntries.handId, handId),
          isNull(queueEntries.removedAt),
        ),
      )
      .limit(1);
    if (!queued) throw new Rejected('hand-not-in-queue');
    if (!isUuid(authorId)) throw new Rejected('author-not-in-room');
    const [author] = await this.db
      .select({
        identityId: identities.id,
        displayName: identities.displayName,
      })
      .from(roomMemberships)
      .innerJoin(identities, eq(identities.id, roomMemberships.identityId))
      .where(
        and(
          eq(roomMemberships.roomId, roomId),
          eq(roomMemberships.identityId, authorId),
          eq(roomMemberships.kicked, false),
        ),
      );
    if (!author) throw new Rejected('author-not-in-room');

    await this.db
      .update(hands)
      .set({ authorId: author.identityId })
      .where(eq(hands.id, handId));
    return {
      handId,
      author: {
        identityId: author.identityId,
        displayName: author.displayName ?? '',
      },
    };
  }

  /** The Room's whole Queue, in order. */
  async entries(
    roomId: string,
    db: Database | Transaction = this.db,
  ): Promise<QueueEntry[]> {
    const rows = await this.entryRows(
      db,
      and(eq(queueEntries.roomId, roomId), isNull(queueEntries.removedAt)),
    ).orderBy(asc(queueEntries.position));
    return rows.map(toQueueEntry);
  }

  /** One Queue Entry by id, regardless of whether it's removed. */
  private async entryById(
    db: Database | Transaction,
    id: string,
  ): Promise<QueueEntry | undefined> {
    const [row] = await this.entryRows(db, eq(queueEntries.id, id));
    return row && toQueueEntry(row);
  }

  private entryRows(db: Database | Transaction, where: SQL | undefined) {
    return db
      .select({
        id: queueEntries.id,
        handId: hands.id,
        position: queueEntries.position,
        authorId: hands.authorId,
        authorName: identities.displayName,
        content: hands.content,
      })
      .from(queueEntries)
      .innerJoin(hands, eq(hands.id, queueEntries.handId))
      .innerJoin(identities, eq(identities.id, hands.authorId))
      .where(where);
  }

  /** Row-locks the Room, serialising position changes to its Queue. */
  private lockRoom(tx: Transaction, roomId: string) {
    return tx
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .for('update');
  }

  /** Renumbers `orderedIds` to consecutive positions starting at 1, in order. */
  private renumber(tx: Transaction, orderedIds: string[]): Promise<unknown> {
    return Promise.all(
      orderedIds.map((id, index) =>
        tx
          .update(queueEntries)
          .set({ position: index + 1 })
          .where(eq(queueEntries.id, id)),
      ),
    );
  }

  /**
   * The Master puts the Queue's active Entries in a new order, the same for
   * everyone. `order` must be exactly a permutation of their ids, with no
   * repeats.
   */
  async reorder(
    master: Identity,
    roomId: string,
    order: unknown,
  ): Promise<string[]> {
    await this.rooms.requireMaster(roomId, master.id);
    if (!Array.isArray(order) || !order.every(isUuid)) {
      throw new Rejected('invalid-queue-order');
    }
    if (new Set(order).size !== order.length) {
      throw new Rejected('invalid-queue-order');
    }
    await this.db.transaction(async (tx) => {
      // Serialises reorders (and appends) of one Room.
      await this.lockRoom(tx, roomId);
      const active = await tx
        .select({ id: queueEntries.id })
        .from(queueEntries)
        .where(
          and(eq(queueEntries.roomId, roomId), isNull(queueEntries.removedAt)),
        );
      const activeIds = new Set(active.map((row) => row.id));
      if (
        order.length !== activeIds.size ||
        !order.every((id) => activeIds.has(id))
      ) {
        throw new Rejected('invalid-queue-order');
      }
      await this.renumber(tx, order);
    });
    return order;
  }

  /**
   * The Master removes a Queue Entry, soft: the Hand it references is never
   * deleted, and undoing within 10 s restores it (see `undoRemoval`).
   */
  async remove(
    master: Identity,
    roomId: string,
    id: unknown,
  ): Promise<{ id: string }> {
    await this.rooms.requireMaster(roomId, master.id);
    if (!isUuid(id)) throw new Rejected('entry-not-in-queue');
    const [removed] = await this.db
      .update(queueEntries)
      .set({ removedAt: this.clock.now() })
      .where(
        and(
          eq(queueEntries.id, id),
          eq(queueEntries.roomId, roomId),
          isNull(queueEntries.removedAt),
        ),
      )
      .returning({ id: queueEntries.id });
    if (!removed) throw new Rejected('entry-not-in-queue');
    return { id: removed.id };
  }

  /**
   * Undoes a removal within its 10 s window. The restored Entry is sorted
   * back into the active Queue by the position it had, then the whole active
   * Queue is renumbered from it: a `reorder` of the other Entries while this
   * one was removed can't leave two Entries sharing a position.
   */
  async undoRemoval(
    master: Identity,
    roomId: string,
    id: unknown,
  ): Promise<QueueEntry> {
    await this.rooms.requireMaster(roomId, master.id);
    if (!isUuid(id)) throw new Rejected('nothing-to-undo');
    return this.db.transaction(async (tx) => {
      await this.lockRoom(tx, roomId);
      const [row] = await tx
        .select({ removedAt: queueEntries.removedAt })
        .from(queueEntries)
        .where(and(eq(queueEntries.id, id), eq(queueEntries.roomId, roomId)));
      if (!row) throw new Rejected('nothing-to-undo');
      requireUndoable(this.clock, row.removedAt);
      await tx
        .update(queueEntries)
        .set({ removedAt: null })
        .where(eq(queueEntries.id, id));
      const active = await tx
        .select({ id: queueEntries.id })
        .from(queueEntries)
        .where(
          and(eq(queueEntries.roomId, roomId), isNull(queueEntries.removedAt)),
        )
        .orderBy(asc(queueEntries.position), asc(queueEntries.addedAt));
      await this.renumber(tx, active.map((each) => each.id));
      return (await this.entryById(tx, id))!;
    });
  }
}


interface QueueEntryRow {
  id: string;
  handId: string;
  position: number;
  authorId: string;
  authorName: string | null;
  content: Hand;
}

function toQueueEntry(row: QueueEntryRow): QueueEntry {
  return {
    id: row.id,
    handId: row.handId,
    position: row.position,
    author: { identityId: row.authorId, displayName: row.authorName ?? '' },
    site: row.content.site,
    siteHandId: row.content.siteHandId,
    playedAt: row.content.playedAt,
    stake: row.content.stake,
    summary: summarise(row.content),
  };
}

/** What makes a Hand the same Hand (ADR 0002). */
function handKey(site: string, siteHandId: string, hero: string): string {
  return JSON.stringify([site, siteHandId, hero]);
}

function keyOf(hand: Hand): string {
  return handKey(hand.site, hand.siteHandId, hand.hero.screenName);
}
