import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { importPreviews } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import {
  heroNamed,
  type Hand,
  type SourceFormat,
  type Stake,
} from '../hands/hand.js';
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

/** What confirming did. */
export type Confirmed =
  | { kind: 'room'; room: Room; entries: QueueEntry[] }
  | { kind: 'library'; added: number };

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
    const roomId = await this.roomIdOf(importer, destination);
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
      previews = plan.queued.map(({ hand, author, heroMatched }) =>
        handPreview(hand, { author, heroMatched }),
      );
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
   * Adds the Hands of the Importer's previews to the destination, in the
   * order given, and forgets the previews. Into a Room they join the end of
   * the Queue, with Authors matched again against the Screen Names as they
   * are now. A Hand that reached the destination since it was previewed is
   * skipped. Refuses with `preview-not-found` if any of them is not theirs,
   * not for this destination, already confirmed or forgotten.
   */
  async confirm(
    importer: Identity,
    destination: Destination,
    previewIds: unknown,
  ): Promise<Confirmed> {
    const room =
      destination.kind === 'room'
        ? await this.rooms.findOpen(destination.code)
        : null;
    if (room) await this.rooms.requireParticipant(room.id, importer.id);
    const ids = validIds(previewIds);

    return this.db.transaction(async (tx) => {
      const taken = await tx
        .delete(importPreviews)
        .where(
          and(
            inArray(importPreviews.id, ids),
            eq(importPreviews.destination, destination.kind),
            room
              ? eq(importPreviews.roomId, room.id)
              : isNull(importPreviews.roomId),
            eq(importPreviews.importerId, importer.id),
            gte(importPreviews.createdAt, this.oldestKept()),
          ),
        )
        .returning({ id: importPreviews.id, hands: importPreviews.hands });
      if (taken.length !== ids.length) throw new Rejected('preview-not-found');
      const handsOf = new Map(taken.map((row) => [row.id, row.hands]));
      const read = ids.flatMap((id) => handsOf.get(id)!);
      if (!room) {
        return {
          kind: 'library',
          added: await this.library.add(tx, importer, read),
        };
      }
      return {
        kind: 'room',
        room,
        entries: await this.queue.append(tx, room, importer, read),
      };
    });
  }

  /** The Room an import goes into, once the Importer is known to be in it; null for the Library. */
  private async roomIdOf(
    importer: Identity,
    destination: Destination,
  ): Promise<string | null> {
    if (destination.kind === 'library') return null;
    const room = await this.rooms.findOpen(destination.code);
    await this.rooms.requireParticipant(room.id, importer.id);
    return room.id;
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
