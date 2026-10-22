import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../database/database.js';
import { importPreviews } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import {
  heroNamed,
  type Hand,
  type SourceFormat,
  type Stake,
} from '../hands/hand.js';
import { keyOf } from '../hands/hand-store.js';
import {
  importHandHistory,
  SOURCE_FORMATS,
  type Discarded,
} from '../hands/import/import.js';
import { readUpload, UnreadableUpload } from '../hands/import/upload.js';
import { summarise, type HandSummary } from '../hands/replay/summary.js';
import type { Identity } from '../identity/identity.service.js';
import { LibraryService } from '../library/library.service.js';
import { Rejected } from '../rejection/rejection.js';
import {
  QueueService,
  type Attribution,
  type QueueEntry,
} from '../rooms/queue.service.js';
import { RoomsService, type Room } from '../rooms/rooms.service.js';

/** Where an import's Hands go: a Room's Queue, or the Importer's own Library. */
export type Destination = { kind: 'room'; code: string } | { kind: 'library' };

/** What the import dialog shows of each Hand it read. */
export interface HandPreview extends Partial<Attribution> {
  /** The Hero's Screen Name, as the Hand History states it. */
  hero: string;
  /** False when the Poker Site writes every Hero alike (`Hero`): no Screen Name can match it. */
  heroNamed: boolean;
  playedAt: string;
  stake: Stake;
  board: string[];
  summary: HandSummary;
  /** Into a Room only: whether the Hand is in the Importer's Library, so confirming queues that Library Hand. */
  inLibrary?: boolean;
}

/** What was read from one file or paste, before it is confirmed. */
export interface ImportPreview {
  /** Confirm the preview by this id. */
  id: string;
  /** The format the Hands were read in; `null` when none was recognised. */
  format: SourceFormat | null;
  /** The formats the text was tried against, to pick one by hand from. */
  tried: SourceFormat[];
  /** The Hands confirming adds; into a Room, each says who its Author would be. */
  hands: HandPreview[];
  /** What was left out, Hands already at the destination included as duplicates. */
  discarded: Discarded[];
}

/** An uploaded file, or text pasted into the dialog. */
export type ImportSource =
  { name: string; bytes: Uint8Array } | { text: unknown };

/** How long an unconfirmed preview is kept. */
const PREVIEW_KEPT_FOR_MS = 60 * 60 * 1000;

/**
 * Importing in two steps, into either destination: each file or paste is
 * read into a preview the Importer can review, then the previews they keep
 * are confirmed into the Room's Queue, or their Library, at once.
 */
@Injectable()
export class ImportsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly rooms: RoomsService,
    private readonly queue: QueueService,
    private readonly library: LibraryService,
  ) {}

  /**
   * Reads one file or paste, in the format picked by hand if there is one,
   * and keeps the Hands until they are confirmed. Nothing reaches the
   * destination. Hands already there are left out as duplicates; into a
   * Room, each Hand kept says who its Author would be.
   */
  async preview(
    importer: Identity,
    destination: Destination,
    source: ImportSource,
    format: unknown,
  ): Promise<ImportPreview> {
    const roomId = (await this.roomOf(importer, destination))?.id ?? null;
    const picked = pickedFormat(format);
    const result = importHandHistory(textOf(source), { format: picked });
    let kept: Hand[];
    let previews: HandPreview[];
    let duplicates: Discarded[];
    if (roomId === null) {
      ({ kept, duplicates } = await this.library.planImport(
        importer,
        result.hands,
        result.texts,
      ));
      previews = kept.map((hand) => handPreview(hand));
    } else {
      const plan = await this.queue.planImport(
        roomId,
        importer,
        result.hands,
        result.texts,
      );
      kept = plan.queued.map(({ hand }) => hand);
      const inLibrary = await this.library.inLibrary(importer, kept);
      previews = plan.queued.map(({ hand, author, heroMatched }) => ({
        ...handPreview(hand, { author, heroMatched }),
        inLibrary: inLibrary.has(keyOf(hand)),
      }));
      duplicates = plan.duplicates;
    }

    await this.db
      .delete(importPreviews)
      .where(lt(importPreviews.createdAt, this.oldestKept()));
    const [stored] = await this.db
      .insert(importPreviews)
      .values({
        destination: destination.kind,
        roomId,
        importerId: importer.id,
        hands: kept,
        createdAt: this.clock.now(),
      })
      .returning({ id: importPreviews.id });
    return {
      id: stored.id,
      format: result.format,
      tried: result.tried,
      hands: previews,
      discarded: [...result.discarded, ...duplicates],
    };
  }

  /**
   * Appends the Hands of the Importer's previews for this Room to the end of
   * its Queue, in the order given, and forgets the previews. Authors are
   * matched again, against the Screen Names as they are now, and a Hand
   * queued since it was previewed is skipped. Returns the new Queue Entries.
   */
  async confirmIntoRoom(
    importer: Identity,
    code: string,
    previewIds: unknown,
  ): Promise<{ room: Room; entries: QueueEntry[] }> {
    const room = (await this.roomOf(importer, { kind: 'room', code }))!;
    const ids = validIds(previewIds);
    const entries = await this.db.transaction(async (tx) =>
      this.queue.append(
        tx,
        room,
        importer,
        await this.take(tx, importer, room, ids),
      ),
    );
    return { room, entries };
  }

  /**
   * Adds the Hands of the Importer's Library previews to their Library and
   * forgets the previews. A Hand added since it was previewed is skipped.
   * Returns the ids of the Hands added.
   */
  async confirmIntoLibrary(
    importer: Identity,
    previewIds: unknown,
  ): Promise<string[]> {
    const ids = validIds(previewIds);
    return this.db.transaction(async (tx) =>
      this.library.add(tx, importer, await this.take(tx, importer, null, ids)),
    );
  }

  /**
   * Deletes the previews and returns their Hands, in the order of `ids`.
   * Refuses with `preview-not-found` if any of them is not the Importer's,
   * not for this destination (`null` for their Library), already confirmed
   * or forgotten.
   */
  private async take(
    tx: Transaction,
    importer: Identity,
    room: Room | null,
    ids: string[],
  ): Promise<Hand[]> {
    const taken = await tx
      .delete(importPreviews)
      .where(
        and(
          inArray(importPreviews.id, ids),
          room
            ? and(
                eq(importPreviews.destination, 'room'),
                eq(importPreviews.roomId, room.id),
              )
            : eq(importPreviews.destination, 'library'),
          eq(importPreviews.importerId, importer.id),
          gte(importPreviews.createdAt, this.oldestKept()),
        ),
      )
      .returning({ id: importPreviews.id, hands: importPreviews.hands });
    if (taken.length !== ids.length) throw new Rejected('preview-not-found');
    const handsOf = new Map(taken.map((row) => [row.id, row.hands]));
    return ids.flatMap((id) => handsOf.get(id)!);
  }

  /** The open Room an import goes into, once the Importer is known to be in it; null for the Library. */
  private async roomOf(
    importer: Identity,
    destination: Destination,
  ): Promise<Room | null> {
    if (destination.kind === 'library') return null;
    const room = await this.rooms.findOpen(destination.code);
    await this.rooms.requireParticipant(room.id, importer.id);
    return room;
  }

  private oldestKept(): Date {
    return new Date(this.clock.now().getTime() - PREVIEW_KEPT_FOR_MS);
  }
}

function textOf(source: ImportSource): string {
  if (!('bytes' in source)) {
    return typeof source.text === 'string' ? source.text : '';
  }
  try {
    return readUpload(source.name, source.bytes);
  } catch (error) {
    if (!(error instanceof UnreadableUpload)) throw error;
    throw new Rejected('unreadable-file');
  }
}

/** `undefined` detects the format; anything else must name a known one. */
function pickedFormat(format: unknown): SourceFormat | undefined {
  if (format === undefined || format === '') return undefined;
  if (!SOURCE_FORMATS.includes(format as SourceFormat)) {
    throw new Rejected('invalid-format');
  }
  return format as SourceFormat;
}

/** Distinct preview ids, in the order given. */
function validIds(previewIds: unknown): string[] {
  if (
    !Array.isArray(previewIds) ||
    !previewIds.every((id) => typeof id === 'string' && isUuid(id))
  ) {
    throw new Rejected('preview-not-found');
  }
  return [...new Set(previewIds as string[])];
}

function handPreview(hand: Hand, attribution?: Attribution): HandPreview {
  return {
    ...attribution,
    hero: hand.hero.screenName,
    heroNamed: heroNamed(hand),
    playedAt: hand.playedAt,
    stake: hand.stake,
    board: hand.board,
    summary: summarise(hand),
  };
}
