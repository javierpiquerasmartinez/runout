import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { importPreviews } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import type { Hand, SourceFormat, Stake } from '../hands/hand.js';
import {
  importHandHistory,
  SOURCE_FORMATS,
  type Discarded,
} from '../hands/import/import.js';
import { readUpload, UnreadableUpload } from '../hands/import/upload.js';
import { summarise, type HandSummary } from '../hands/replay/summary.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { QueueService, type QueueEntry } from './queue.service.js';
import { RoomsService, type Room } from './rooms.service.js';

/** What the import dialog shows of each Hand it read. */
export interface HandPreview {
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
  hands: HandPreview[];
  discarded: Discarded[];
}

/** An uploaded file, or text pasted into the dialog. */
export type ImportSource =
  { name: string; bytes: Uint8Array } | { text: unknown };

/** How long an unconfirmed preview is kept. */
const PREVIEW_KEPT_FOR_MS = 60 * 60 * 1000;

/**
 * Importing in two steps: each file or paste is read into a preview the
 * Importer can review, then the previews they keep are confirmed into the
 * Room's Queue at once.
 */
@Injectable()
export class ImportsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly rooms: RoomsService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Reads one file or paste, in the format picked by hand if there is one,
   * and keeps the Hands until they are confirmed. Nothing reaches the Queue.
   */
  async preview(
    importer: Identity,
    code: string,
    source: ImportSource,
    format: unknown,
  ): Promise<ImportPreview> {
    const room = await this.rooms.findOpen(code);
    await this.rooms.requireParticipant(room.id, importer.id);
    const picked = pickedFormat(format);
    const result = importHandHistory(textOf(source), { format: picked });

    const now = this.clock.now();
    await this.db
      .delete(importPreviews)
      .where(lt(importPreviews.createdAt, this.oldestKept()));
    const [stored] = await this.db
      .insert(importPreviews)
      .values({
        roomId: room.id,
        importerId: importer.id,
        hands: result.hands,
        createdAt: now,
      })
      .returning({ id: importPreviews.id });
    return {
      id: stored.id,
      format: result.format,
      tried: result.tried,
      hands: result.hands.map(handPreview),
      discarded: result.discarded,
    };
  }

  /**
   * Appends the Hands of the Importer's previews to the end of the Queue, in
   * the order given, and forgets the previews. Refuses with
   * `preview-not-found` if any of them is not theirs, not for this Room,
   * already confirmed or forgotten.
   */
  async confirm(
    importer: Identity,
    code: string,
    previewIds: unknown,
  ): Promise<{ room: Room; entries: QueueEntry[] }> {
    const room = await this.rooms.findOpen(code);
    await this.rooms.requireParticipant(room.id, importer.id);
    const ids = validIds(previewIds);

    const entries = await this.db.transaction(async (tx) => {
      const taken = await tx
        .delete(importPreviews)
        .where(
          and(
            inArray(importPreviews.id, ids),
            eq(importPreviews.roomId, room.id),
            eq(importPreviews.importerId, importer.id),
            gte(importPreviews.createdAt, this.oldestKept()),
          ),
        )
        .returning({ id: importPreviews.id, hands: importPreviews.hands });
      if (taken.length !== ids.length) throw new Rejected('preview-not-found');
      const handsOf = new Map(taken.map((row) => [row.id, row.hands]));
      return this.queue.append(
        tx,
        room,
        importer,
        ids.flatMap((id) => handsOf.get(id)!),
      );
    });
    return { room, entries };
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

function handPreview(hand: Hand): HandPreview {
  return {
    playedAt: hand.playedAt,
    stake: hand.stake,
    board: hand.board,
    summary: summarise(hand),
  };
}
