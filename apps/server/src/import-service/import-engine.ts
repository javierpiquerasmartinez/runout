import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../database/database.js';
import { advancing } from '../database/bulk-import-status.js';
import {
  bulkImports,
  identities,
  libraryEntries,
  type BulkImportReason,
} from '../database/schema.js';
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
import { LIBRARY_CAPACITY } from '../library/library-limits.js';
import { Storage } from '../storage/storage.js';
import { BULK_IMPORT_LIMIT } from './bulk-import-limit.js';
import { AdministratorsEmail } from './administrators-email.js';
import { ImporterEmail } from './importer-email.js';
import { messageOf } from './message-of.js';

/** The most Hands one batch goes through, in one transaction. */
const BATCH_SIZE = 1_000;

/** How many times a step is tried before its import is marked failed. */
const ATTEMPTS = 3;

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
export class ImportEngine implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ImportEngine.name);
  private working: Promise<void> | null = null;
  /** Set when woken while working: look again before stopping. */
  private wokenAgain = false;
  /** Set when the service is stopping: no batch is begun after the one in hand. */
  private stopping = false;
  /** Each import's reader, left open between its batches. */
  private readonly readers = new Map<string, OpenReader>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FILE_STORE) private readonly store: FileStore,
    private readonly heroResults: HeroResults,
    @Inject(BULK_IMPORT_LIMIT) private readonly limit: number,
    @Inject(LIBRARY_CAPACITY) private readonly capacity: number,
    private readonly importerEmail: ImporterEmail,
    private readonly administratorsEmail: AdministratorsEmail,
    private readonly storage: Storage,
  ) {}

  /** Imports left waiting or interrupted go on as soon as the service starts. */
  onApplicationBootstrap(): void {
    this.workUntilNothingLeft().catch((error: unknown) =>
      this.logger.error(`The import engine stopped: ${messageOf(error)}`),
    );
  }

  /**
   * Lets the batch in hand commit, and begins no other: what is left goes on
   * when the service starts again, from the cursor the last batch committed.
   */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.settled();
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
          while (!this.stopping && (await this.advanceOne())) {
            // One step at a time, until none is left.
          }
        } while (this.wokenAgain && !this.stopping);
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
      .where(advancing)
      .orderBy(
        sql`${bulkImports.lastAdvancedAt} asc nulls first`,
        asc(bulkImports.createdAt),
      )
      .limit(1);
    if (!next) return false;
    // Before each batch: past the threshold, every write in Runout could fail.
    if (next.status === 'running' && (await this.storage.reached())) {
      await this.pauseAll();
      return true;
    }
    for (let attempt = 1; ; attempt++) {
      try {
        if (next.status === 'running') await this.addBatch(next);
        else await this.count(next);
        return true;
      } catch (error) {
        if (error instanceof UnreadableUpload) {
          await this.end(next, 'unreadable-file');
          return true;
        }
        // Its transaction rolled back: read again from the cursor.
        await this.closeReader(next.id).catch(() => undefined);
        this.logger.warn(
          `Bulk Import ${next.id} failed a step (attempt ${attempt} of ${ATTEMPTS}): ${failureCodeOf(error)}`,
        );
        // Stopping, what failed may be the service going away: it goes on at the next start.
        if (this.stopping) return false;
        if (attempt === ATTEMPTS) {
          await this.fail(next, failureCodeOf(error));
          return true;
        }
      }
    }
  }

  /**
   * The storage guard: every import being advanced pauses, until the API's
   * hourly check finds the database below its threshold again. The
   * Administrators are told when the first ones pause, not again for those
   * that join them.
   */
  private async pauseAll(): Promise<void> {
    const paused = await this.db.transaction(async (tx) => {
      const [already] = await tx
        .select({ id: bulkImports.id })
        .from(bulkImports)
        .where(eq(bulkImports.status, 'paused'))
        .limit(1);
      const pausing = await tx
        .update(bulkImports)
        .set({ status: 'paused', stalled: false })
        .where(advancing)
        .returning({ id: bulkImports.id });
      return already ? 0 : pausing.length;
    });
    await this.closeReaders();
    if (paused > 0) {
      await this.administratorsEmail.storageReached({
        paused,
        used: await this.storage.used(),
        threshold: this.storage.threshold,
      });
    }
  }

  /**
   * Ends an import that keeps failing: what it added stays, its files are
   * kept for a retry, and its Importer and the Administrators are told.
   */
  private async fail(record: BulkImport, failureCode: string): Promise<void> {
    const now = this.clock.now();
    const [failed] = await this.db
      .update(bulkImports)
      .set({ status: 'failed', failureCode, finishedAt: now })
      // Not one cancelled meanwhile.
      .where(and(eq(bulkImports.id, record.id), advancing))
      .returning({ id: bulkImports.id });
    if (!failed) return;
    await this.importerEmail.send(record.id);
    await this.administratorsEmail.importFailed(record.id);
  }

  /**
   * The first pass: how many Hands the files hold, for progress, and the
   * runs of text that are none. Past the limit, the import ends adding none.
   */
  private async count(record: BulkImport): Promise<void> {
    await this.db
      .update(bulkImports)
      .set({ status: 'counting' })
      .where(and(eq(bulkImports.id, record.id), advancing));
    const counted = await countHands(this.filesOf(record), this.limit);
    if (counted.overLimit) {
      await this.end(record, 'too-many-hands');
      return;
    }
    const notImported: Record<string, number> =
      counted.unrecognised > 0
        ? { 'unrecognised-format': counted.unrecognised }
        : {};
    if (counted.hands === 0) {
      // Nothing in the files is a Hand any format recognises.
      await this.end(record, 'unrecognised-format', { total: 0, notImported });
      return;
    }
    await this.db
      .update(bulkImports)
      .set({ status: 'running', total: counted.hands, notImported })
      // Cancelled while counting, it stays so.
      .where(and(eq(bulkImports.id, record.id), advancing));
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
      // Past what fits in the Library, nothing more is added: neither these
      // nor the Hands not yet gone through.
      const spaceLeft = await this.spaceLeftIn(tx, record.identityId);
      const full = kept.length > spaceLeft;
      const notFit = full
        ? kept.length - spaceLeft + Math.max(0, (record.total ?? 0) - to)
        : 0;
      const now = this.clock.now();
      const added = await addToLibrary(
        tx,
        this.heroResults,
        record.identityId,
        withHistories(kept.slice(0, spaceLeft), texts.slice(0, spaceLeft)),
        now,
      );
      await tx
        .update(bulkImports)
        .set({
          processed: to,
          imported: sql`${bulkImports.imported} + ${added.length}`,
          duplicates: sql`${bulkImports.duplicates} + ${batch.length - added.length - (full ? kept.length - spaceLeft : 0)}`,
          notImported: plus(
            locked.notImported,
            full ? { ...discarded, 'library-full': notFit } : discarded,
          ),
          lastAdvancedAt: now,
          // An advance: no longer stalled, and a later stall is told again.
          stalled: false,
          ...(full
            ? { status: 'completed', reason: 'library-full', finishedAt: now }
            : done
              ? { status: 'completed', finishedAt: now }
              : {}),
        })
        .where(eq(bulkImports.id, record.id));
      return { full };
    });

    if (!committed) {
      await this.closeReader(record.id);
      return;
    }
    reader.position = to;
    if (done || committed.full) {
      await this.closeReader(record.id);
      await this.deleteFiles(record);
      await this.importerEmail.send(record.id);
    }
  }

  /**
   * How many more Hands the Account's Library holds. Takes the Account's
   * lock until the batch commits, as a small import does, so that the two
   * cannot both fit at once.
   */
  private async spaceLeftIn(
    tx: Transaction,
    accountId: string,
  ): Promise<number> {
    await tx
      .select({ id: identities.id })
      .from(identities)
      .where(eq(identities.id, accountId))
      .for('update');
    const [{ held }] = await tx
      .select({ held: count() })
      .from(libraryEntries)
      .where(eq(libraryEntries.identityId, accountId));
    return Math.max(0, this.capacity - held);
  }

  /** Ends an import short of adding its Hands, saying why, and lets its files go. */
  private async end(
    record: BulkImport,
    reason: BulkImportReason,
    counts: Partial<Pick<BulkImport, 'total' | 'notImported'>> = {},
  ): Promise<void> {
    const now = this.clock.now();
    const [ended] = await this.db
      .update(bulkImports)
      .set({
        ...counts,
        status: 'completed',
        reason,
        finishedAt: now,
        lastAdvancedAt: now,
        stalled: false,
      })
      .where(and(eq(bulkImports.id, record.id), advancing))
      .returning({ id: bulkImports.id });
    await this.closeReader(record.id);
    await this.deleteFiles(record);
    if (ended) await this.importerEmail.send(record.id);
  }

  /** The import's reader, where its last batch left it; opened again after a restart. */
  private async readerAt(record: BulkImport): Promise<OpenReader> {
    const open = this.readers.get(record.id);
    if (open?.position === record.processed) return open;
    await this.closeReader(record.id);
    // Where it had got to: past every Hand already gone through.
    const reader: OpenReader = {
      hands: readHands(this.filesOf(record), { after: record.processed }),
      position: record.processed,
    };
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

/**
 * A failure as Administrators are told it: Postgres's SQLSTATE or Node's
 * error code when it has one, else the error's name. Never its message,
 * which may quote a Hand.
 */
function failureCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code !== '') return code;
  return error instanceof Error ? error.name : 'unknown';
}
