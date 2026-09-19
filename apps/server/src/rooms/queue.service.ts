import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
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
   * Room's Queue. Any Participant may import. Hands already imported are
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
    const { fresh, duplicates } = await this.firstImports(
      result.hands,
      result.texts,
    );
    const entries = await this.db.transaction((tx) =>
      this.append(tx, room, importer, fresh),
    );
    return { room, entries, discarded: [...result.discarded, ...duplicates] };
  }

  /**
   * Splits Hands into those never imported before and duplicates: the same
   * Poker Site, hand ID and Hero as a stored Hand, or as one earlier in the
   * list. Duplicates come back as discarded entries with their text.
   */
  async firstImports(
    read: Hand[],
    texts: string[],
  ): Promise<{ fresh: Hand[]; duplicates: Discarded[] }> {
    const stored =
      read.length === 0
        ? []
        : await this.db
            .select({
              site: hands.site,
              siteHandId: hands.siteHandId,
              heroScreenName: hands.heroScreenName,
            })
            .from(hands)
            .where(
              inArray(
                hands.siteHandId,
                read.map((hand) => hand.siteHandId),
              ),
            );
    const seen = new Set(
      stored.map((row) =>
        handKey(row.site, row.siteHandId, row.heroScreenName),
      ),
    );
    const fresh: Hand[] = [];
    const duplicates: Discarded[] = [];
    read.forEach((hand, index) => {
      const key = handKey(hand.site, hand.siteHandId, hand.hero.screenName);
      if (seen.has(key)) {
        duplicates.push({ text: texts[index], reason: 'duplicate' });
        return;
      }
      seen.add(key);
      fresh.push(hand);
    });
    return { fresh, duplicates };
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
   * Stores Hands, attributed to their Authors, and appends them to the end of
   * the Room's Queue, inside the caller's transaction. A Hand stored since it
   * was read is skipped. Returns the new Queue Entries, in Queue order.
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
    await tx
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.id, room.id))
      .for('update');
    const [{ last }] = await tx
      .select({ last: max(queueEntries.position) })
      .from(queueEntries)
      .where(eq(queueEntries.roomId, room.id));
    const attributions = await this.attribute(room.id, importer, read, tx);

    // The uniqueness constraint turns away a Hand another import stored
    // since this one was previewed.
    const stored = await tx
      .insert(hands)
      .values(
        read.map((hand, index) => ({
          site: hand.site,
          siteHandId: hand.siteHandId,
          heroScreenName: hand.hero.screenName,
          authorId: attributions[index].author.identityId,
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
      .returning({ id: hands.id });
    if (stored.length === 0) return [];
    const added = await tx
      .insert(queueEntries)
      .values(
        stored.map(({ id }, index) => ({
          roomId: room.id,
          handId: id,
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
        and(eq(queueEntries.roomId, roomId), eq(queueEntries.handId, handId)),
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
    const rows = await db
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
      .where(eq(queueEntries.roomId, roomId))
      .orderBy(asc(queueEntries.position));
    return rows.map((row) => ({
      id: row.id,
      handId: row.handId,
      position: row.position,
      author: { identityId: row.authorId, displayName: row.authorName ?? '' },
      site: row.content.site,
      siteHandId: row.content.siteHandId,
      playedAt: row.content.playedAt,
      stake: row.content.stake,
      summary: summarise(row.content),
    }));
  }
}

/** What makes a Hand the same Hand (ADR 0002). */
function handKey(site: string, siteHandId: string, hero: string): string {
  return JSON.stringify([site, siteHandId, hero]);
}
