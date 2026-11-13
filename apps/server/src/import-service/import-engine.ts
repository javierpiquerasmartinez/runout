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
import { importHandHistory } from '../hands/import/import.js';
import { readUpload } from '../hands/import/upload.js';
import { addToLibrary, inLibrary } from '../library/library-entries.js';

/** The most Hands one batch adds, in one transaction. */
const BATCH_SIZE = 1_000;

type BulkImport = typeof bulkImports.$inferSelect;

/** Every Hand an import's files hold, in order, with the text each was read from. */
interface ImportHands {
  hands: Hand[];
  texts: string[];
  /** Hands that could not be read, per reason. */
  notImported: Record<string, number>;
}

/**
 * Adds the Hands of every waiting Bulk Import to its Library, batch by batch.
 * Its one operation runs until nothing is left, and queries nothing once
 * there is nothing to do, so that the database can suspend. Each batch is one
 * transaction with the record's counters, so a batch run again after a crash
 * changes nothing.
 */
@Injectable()
export class ImportEngine implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImportEngine.name);
  private working: Promise<void> | null = null;
  /** Set when woken while working: look again before stopping. */
  private wokenAgain = false;
  /** The Hands of the import in hand, read once rather than per batch. */
  private read: { id: string; hands: ImportHands } | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FILE_STORE) private readonly store: FileStore,
    private readonly heroResults: HeroResults,
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
            // One batch at a time, until none is left.
          }
        } while (this.wokenAgain);
      } finally {
        this.working = null;
        this.read = null;
      }
    })();
    return this.working;
  }

  /** Resolves once the engine has nothing in hand. */
  async settled(): Promise<void> {
    while (this.working) await this.working.catch(() => undefined);
  }

  /** Adds one batch of the import that advanced longest ago; false when none is left. */
  private async advanceOne(): Promise<boolean> {
    const [next] = await this.db
      .select()
      .from(bulkImports)
      .where(inArray(bulkImports.status, ['waiting', 'running']))
      .orderBy(
        sql`${bulkImports.lastAdvancedAt} asc nulls first`,
        asc(bulkImports.createdAt),
      )
      .limit(1);
    if (!next) return false;
    await this.advance(next);
    return true;
  }

  private async advance(record: BulkImport): Promise<void> {
    const all = await this.handsOf(record);
    if (record.status === 'waiting') {
      await this.db
        .update(bulkImports)
        .set({
          status: 'running',
          total: all.hands.length,
          notImported: all.notImported,
        })
        .where(eq(bulkImports.id, record.id));
    }
    const from = record.processed;
    const to = Math.min(from + BATCH_SIZE, all.hands.length);
    const batch = all.hands.slice(from, to);
    const done = to >= all.hands.length;

    const committed = await this.db.transaction(async (tx) => {
      // Nobody else moved it meanwhile: same place, still running.
      const [locked] = await tx
        .select({ processed: bulkImports.processed })
        .from(bulkImports)
        .where(
          and(eq(bulkImports.id, record.id), eq(bulkImports.status, 'running')),
        )
        .for('update');
      if (locked?.processed !== from) return false;

      const held = await inLibrary(tx, record.identityId, batch);
      const kept: Hand[] = [];
      const texts: string[] = [];
      const taken = new Set<string>();
      batch.forEach((hand, index) => {
        const key = keyOf(hand);
        if (held.has(key) || taken.has(key)) return;
        taken.add(key);
        kept.push(hand);
        texts.push(all.texts[from + index]);
      });
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
          lastAdvancedAt: now,
          ...(done ? { status: 'completed', finishedAt: now } : {}),
        })
        .where(eq(bulkImports.id, record.id));
      return true;
    });

    if (committed && done) {
      this.read = null;
      await this.deleteFiles(record);
    }
  }

  /** Every Hand the import's files hold, read once per import. */
  private async handsOf(record: BulkImport): Promise<ImportHands> {
    if (this.read?.id === record.id) return this.read.hands;
    const hands: ImportHands = { hands: [], texts: [], notImported: {} };
    for (const file of record.files) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of this.store.read(file.key)) chunks.push(chunk);
      const result = importHandHistory(
        readUpload(file.name, Buffer.concat(chunks)),
      );
      hands.hands.push(...result.hands);
      hands.texts.push(...result.texts);
      for (const { reason } of result.discarded) {
        hands.notImported[reason] = (hands.notImported[reason] ?? 0) + 1;
      }
    }
    this.read = { id: record.id, hands };
    return hands;
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
