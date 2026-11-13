import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { bulkImports } from '../database/schema.js';
import { FILE_STORE, type FileStore } from '../file-store/file-store.js';
import type { Hand } from '../hands/hand.js';
import { keyOf, withHistories } from '../hands/hand-store.js';
import { HeroResults } from '../hands/hero-results.js';
import {
  countHands,
  readHands,
  type HandRead,
  type SourceFile,
} from '../hands/import/hand-reader.js';
import { UnreadableUpload } from '../hands/import/upload.js';
import { addToLibrary, inLibrary } from '../library/library-entries.js';
import { BULK_IMPORT_LIMIT } from './bulk-import-limit.js';

/** The most Hands one batch goes through, in one transaction. */
const BATCH_SIZE = 1_000;

type BulkImport = typeof bulkImports.$inferSelect;

/** The Hands of an import being read, and how many of them have been gone through. */
interface OpenReader {
  hands: AsyncGenerator<HandRead>;
  position: number;
}

/**
 * Adds the Hands of every waiting Bulk Import to its Library, batch by batch.
 * Its one operation runs until nothing is left, and queries nothing once
 * there is nothing to do, so that the database can suspend. An import's
 * files are counted first, then read as a stream, never whole. Each batch is
 * one transaction with the record's counters, so a batch run again after a
 * crash changes nothing.
 */
@Injectable()
export class ImportEngine implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImportEngine.name);
  private working: Promise<void> | null = null;
  /** Set when woken while working: look again before stopping. */
  private wokenAgain = false;
  /** Each import's reader, left open between its batches. */
  private readonly readers = new Map<string, OpenReader>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FILE_STORE) private readonly store: FileStore,
    private readonly heroResults: HeroResults,
    @Inject(BULK_IMPORT_LIMIT) private readonly limit: number,
  ) {}

  /** Imports left waiting or interrupted go on as soon as the service starts. */
  onApplicationBootstrap(): void {
    this.workUntilNothingLeft().catch((error: unknown) =>
      this.logger.error(`The import engine stopped: ${messageOf(error)}`),
    );
  }

  /** Works until no Bulk Import is left to advance. Woken while working, it looks again before stopping. */
  workUntilNothingLeft(): Promise<void> {
    if (this.working) {
      this.wokenAgain = true;
      return this.working;
    }
    this.working = (async () => {
      try {
        do {
          this.wokenAgain = false;
          while (await this.advanceOne()) {
            // One step at a time, until none is left.
          }
        } while (this.wokenAgain);
      } finally {
        this.working = null;
        await this.closeReaders();
      }
    })();
    return this.working;
  }

  /** Resolves once the engine has nothing in hand. */
  async settled(): Promise<void> {
    while (this.working) await this.working.catch(() => undefined);
  }

  /** Takes one step of the import that advanced longest ago; false when none is left. */
  private async advanceOne(): Promise<boolean> {
    const [next] = await this.db
      .select()
      .from(bulkImports)
      .where(inArray(bulkImports.status, ['waiting', 'counting', 'running']))
      .orderBy(
        sql`${bulkImports.lastAdvancedAt} asc nulls first`,
        asc(bulkImports.createdAt),
      )
      .limit(1);
    if (!next) return false;
    try {
      if (next.status === 'running') await this.addBatch(next);
      else await this.count(next);
    } catch (error) {
      if (!(error instanceof UnreadableUpload)) throw error;
      await this.end(next, 'unreadable-file');
    }
    return true;
  }

  /**
   * The first pass: how many Hands the files hold, for progress, and the
   * runs of text that are none. Past the limit, the import ends adding none.
   */
  private async count(record: BulkImport): Promise<void> {
    await this.db
      .update(bulkImports)
      .set({ status: 'counting' })
      .where(eq(bulkImports.id, record.id));
    const counted = await countHands(this.filesOf(record), this.limit);
    if (counted.overLimit) {
      await this.end(record, 'too-many-hands');
      return;
    }
    await this.db
      .update(bulkImports)
      .set({
        status: 'running',
        total: counted.hands,
        notImported:
          counted.unrecognised > 0
            ? { 'unrecognised-format': counted.unrecognised }
            : {},
      })
      .where(eq(bulkImports.id, record.id));
  }

  /** Adds the next batch of Hands, with the record's counters, in one transaction. */
  private async addBatch(record: BulkImport): Promise<void> {
    const reader = await this.readerAt(record);
    const from = record.processed;
    const batch: { hand: Hand; text: string }[] = [];
    const discarded: Record<string, number> = {};
    let gone = 0;
    let ended = false;
    while (gone < BATCH_SIZE) {
      const next = await reader.hands.next();
      if (next.done) {
        ended = true;
        break;
      }
      const read = next.value;
      // Counted already, in the first pass.
      if (read.kind === 'unrecognised') continue;
      gone++;
      if (read.kind === 'hand') batch.push(read);
      else discarded[read.reason] = (discarded[read.reason] ?? 0) + 1;
    }
    const to = from + gone;
    const done = ended || to >= (record.total ?? 0);

    const committed = await this.db.transaction(async (tx) => {
      // Nobody else moved it meanwhile: same place, still running.
      const [locked] = await tx
        .select({
          processed: bulkImports.processed,
          notImported: bulkImports.notImported,
        })
        .from(bulkImports)
        .where(
          and(eq(bulkImports.id, record.id), eq(bulkImports.status, 'running')),
        )
        .for('update');
      if (locked?.processed !== from) return false;

      const hands = batch.map(({ hand }) => hand);
      const held = await inLibrary(tx, record.identityId, hands);
      const kept: Hand[] = [];
      const texts: string[] = [];
      const taken = new Set<string>();
      for (const { hand, text } of batch) {
        const key = keyOf(hand);
        if (held.has(key) || taken.has(key)) continue;
        taken.add(key);
        kept.push(hand);
        texts.push(text);
      }
      const now = this.clock.now();
      const added = await addToLibrary(
        tx,
        this.heroResults,
        record.identityId,
        withHistories(kept, texts),
        now,
      );
      await tx
        .update(bulkImports)
        .set({
          processed: to,
          imported: sql`${bulkImports.imported} + ${added.length}`,
          duplicates: sql`${bulkImports.duplicates} + ${batch.length - added.length}`,
          notImported: plus(locked.notImported, discarded),
          lastAdvancedAt: now,
          ...(done ? { status: 'completed', finishedAt: now } : {}),
        })
        .where(eq(bulkImports.id, record.id));
      return true;
    });

    if (!committed) {
      await this.closeReader(record.id);
      return;
    }
    reader.position = to;
    if (done) {
      await this.closeReader(record.id);
      await this.deleteFiles(record);
    }
  }

  /** Ends an import short of adding its Hands, saying why, and lets its files go. */
  private async end(record: BulkImport, reason: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(bulkImports)
      .set({
        status: 'completed',
        reason,
        finishedAt: now,
        lastAdvancedAt: now,
      })
      .where(eq(bulkImports.id, record.id));
    await this.closeReader(record.id);
    await this.deleteFiles(record);
  }

  /** The import's reader, where its last batch left it; opened again after a restart. */
  private async readerAt(record: BulkImport): Promise<OpenReader> {
    const open = this.readers.get(record.id);
    if (open?.position === record.processed) return open;
    await this.closeReader(record.id);
    const reader: OpenReader = {
      hands: readHands(this.filesOf(record)),
      position: 0,
    };
    // Where it had got to: past every Hand already gone through.
    while (reader.position < record.processed) {
      const next = await reader.hands.next();
      if (next.done) break;
      if (next.value.kind !== 'unrecognised') reader.position++;
    }
    this.readers.set(record.id, reader);
    return reader;
  }

  private filesOf(record: BulkImport): SourceFile[] {
    return record.files.map((file) => ({
      name: file.name,
      bytes: this.store.read(file.key),
    }));
  }

  private async closeReader(id: string): Promise<void> {
    const open = this.readers.get(id);
    this.readers.delete(id);
    await open?.hands.return(undefined);
  }

  private async closeReaders(): Promise<void> {
    // Deleting the entry being visited is safe in a Map.
    for (const id of this.readers.keys()) await this.closeReader(id);
  }

  /** Its files are no longer needed; one left behind is only a waste of space. */
  private async deleteFiles(record: BulkImport): Promise<void> {
    for (const file of record.files) {
      await this.store
        .delete(file.key)
        .catch((error: unknown) =>
          this.logger.error(
            `Could not delete ${file.key}: ${messageOf(error)}`,
          ),
        );
    }
  }
}

function plus(
  counts: Record<string, number>,
  more: Record<string, number>,
): Record<string, number> {
  const sum = { ...counts };
  for (const [reason, count] of Object.entries(more)) {
    sum[reason] = (sum[reason] ?? 0) + count;
  }
  return sum;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
