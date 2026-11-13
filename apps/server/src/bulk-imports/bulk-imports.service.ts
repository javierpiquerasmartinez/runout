import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import {
  bulkImports,
  type BulkImportFile,
  type BulkImportStatus,
} from '../database/schema.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { isUuid } from '../database/uuid.js';
import {
  FILE_STORE,
  type FileStore,
  type UploadedPart,
} from '../file-store/file-store.js';
import {
  refuseImpersonation,
  type Identity,
} from '../identity/identity.service.js';
import { ImportServiceWaker } from '../import-service/import-service-waker.js';
import { Rejected } from '../rejection/rejection.js';
import { StallCheck } from './stall-check.js';

/** What the Importer sees of a Bulk Import. */
export interface BulkImportView {
  id: string;
  status: BulkImportStatus;
  files: { name: string; size: number }[];
  /** Null until its files are counted. */
  total: number | null;
  processed: number;
  imported: number;
  duplicates: number;
  /** Hands not imported, per reason. */
  notImported: Record<string, number>;
  /** Why it ended short of adding its Hands, when it did. */
  reason: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** A file as the browser names it when starting. */
interface ChosenFile {
  name: string;
  size: number;
}

/** S3 and R2 number parts from 1 to 10,000. */
const MAX_PART_NUMBER = 10_000;
const MAX_FILES = 100;
/** How long an upload may go uncompleted before it is discarded. */
export const UPLOAD_EXPIRES_MS = 24 * 60 * 60_000;
/**
 * How often the API checks Bulk Imports: an expired upload goes, and a
 * stalled import is found, within this much.
 */
const CHECK_EVERY_MS = 60 * 60_000;
/** The most one Bulk Import may upload, all its files together. */
export const MAX_BULK_IMPORT_BYTES = 2.5 * 1024 ** 3;
/** What a Bulk Import reads: Hand Histories as text, or zipped. */
const IMPORTABLE_FILE = /\.(txt|zip)$/i;
/** An import in one of these has ended; any other is unfinished. */
export const ENDED: BulkImportStatus[] = ['completed', 'failed', 'cancelled'];
/** How long a failed import's files are kept for a retry. */
export const FAILED_FILES_KEPT_MS = 7 * 24 * 60 * 60_000;
/** How long an ended import is kept, and listed, before it is deleted. */
const ENDED_KEPT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Bulk Imports, as the Importer starts and follows them from the API. The
 * import service adds their Hands; this side records them, hands out the
 * upload's part URLs and wakes the service once the files are in.
 */
@Injectable()
export class BulkImportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkImportsService.name);
  private cancelCheck: (() => void) | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FILE_STORE) private readonly store: FileStore | null,
    private readonly waker: ImportServiceWaker,
    private readonly stallCheck: StallCheck,
  ) {}

  /**
   * Checks Bulk Imports now, then once an hour: discards expired uploads,
   * deletes the ended ones kept their 30 days, and finds the stalled.
   * Without a store there are none.
   */
  onModuleInit(): void {
    if (this.store) this.checkEvery(0);
  }

  onModuleDestroy(): void {
    this.cancelCheck?.();
    this.cancelCheck = null;
  }

  private checkEvery(delayMs: number): void {
    this.cancelCheck = this.clock.schedule(delayMs, async () => {
      try {
        await this.discardExpiredUploads();
      } catch (error) {
        this.logger.error('Could not discard expired uploads', error);
      }
      try {
        await this.deleteExpiredFailedFiles();
      } catch (error) {
        this.logger.error(
          'Could not delete the files of failed imports',
          error,
        );
      }
      try {
        await this.deleteExpiredEnded();
      } catch (error) {
        this.logger.error('Could not delete the ended Bulk Imports', error);
      }
      try {
        await this.stallCheck.run();
      } catch (error) {
        this.logger.error('Could not check for stalled Bulk Imports', error);
      }
      if (this.cancelCheck) this.checkEvery(CHECK_EVERY_MS);
    });
  }

  /**
   * Discards the Bulk Imports still uploading 24 hours after they started,
   * with whatever parts they had uploaded. A file the store could not let go
   * of keeps its import, to be tried again at the next check.
   */
  private async discardExpiredUploads(): Promise<void> {
    const store = this.requireStore();
    const cutoff = new Date(this.clock.now().getTime() - UPLOAD_EXPIRES_MS);
    const expired = await this.db
      .select()
      .from(bulkImports)
      .where(
        and(
          eq(bulkImports.status, 'uploading'),
          lt(bulkImports.createdAt, cutoff),
        ),
      );
    for (const row of expired) {
      await Promise.all(
        row.files.map(({ key, uploadId }) => store.delete(key, uploadId)),
      );
      await this.db
        .delete(bulkImports)
        .where(
          and(eq(bulkImports.id, row.id), eq(bulkImports.status, 'uploading')),
        );
    }
  }

  /**
   * Lets go of the files of imports failed 7 days ago or more, kept until
   * then for a retry, and records it, so that they are no longer retried.
   * A file the store could not let go of is tried again at the next check.
   */
  private async deleteExpiredFailedFiles(): Promise<void> {
    const store = this.requireStore();
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - FAILED_FILES_KEPT_MS);
    const expired = await this.db
      .select()
      .from(bulkImports)
      .where(
        and(
          eq(bulkImports.status, 'failed'),
          isNull(bulkImports.filesDeletedAt),
          lte(bulkImports.finishedAt, cutoff),
        ),
      );
    for (const row of expired) {
      await Promise.all(row.files.map(({ key }) => store.delete(key)));
      await this.db
        .update(bulkImports)
        .set({ filesDeletedAt: now })
        .where(
          and(eq(bulkImports.id, row.id), eq(bulkImports.status, 'failed')),
        );
    }
  }

  /**
   * Deletes the imports ended 30 days ago or more, no longer listed. Not a
   * failed one whose files the store has not let go of yet: it goes once
   * they have.
   */
  private async deleteExpiredEnded(): Promise<void> {
    const cutoff = new Date(this.clock.now().getTime() - ENDED_KEPT_MS);
    await this.db
      .delete(bulkImports)
      .where(
        and(
          inArray(bulkImports.status, ENDED),
          lte(bulkImports.finishedAt, cutoff),
          or(
            ne(bulkImports.status, 'failed'),
            isNotNull(bulkImports.filesDeletedAt),
          ),
        ),
      );
  }

  /**
   * Records a Bulk Import of these files, `uploading`, and starts each file's
   * upload. The same files chosen again, by name and size, give back the
   * import still uploading them, so that the upload continues. Otherwise an
   * Account has one unfinished at a time, so that each gets its share of the
   * import service (`bulk-import-unfinished` otherwise).
   * Refused during an Impersonation: it would launch hours of work, and
   * emails, in the Account's name.
   */
  async start(account: Identity, files: unknown): Promise<BulkImportView> {
    refuseImpersonation(account);
    const store = this.requireStore();
    const chosen = validFiles(files);
    const interrupted = await this.db
      .select()
      .from(bulkImports)
      .where(
        and(
          eq(bulkImports.identityId, account.id),
          eq(bulkImports.status, 'uploading'),
        ),
      )
      .orderBy(desc(bulkImports.createdAt));
    const same = interrupted.find((row) => sameFiles(row.files, chosen));
    if (same) return view(same);
    await this.refuseUnfinished(account);
    const id = randomUUID();
    const stored: BulkImportFile[] = await Promise.all(
      chosen.map(async ({ name, size }, index) => {
        const key = `bulk-imports/${id}/${index}`;
        return { name, size, key, uploadId: await store.startUpload(key) };
      }),
    );
    try {
      const [row] = await this.db
        .insert(bulkImports)
        .values({
          id,
          identityId: account.id,
          status: 'uploading',
          files: stored,
          createdAt: this.clock.now(),
        })
        .returning();
      return view(row);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another start of the same Account got in first: let these uploads go.
      await Promise.all(
        stored.map((file) =>
          store.delete(file.key, file.uploadId).catch(() => undefined),
        ),
      );
      throw new Rejected('bulk-import-unfinished');
    }
  }

  /** A URL to upload each of these parts of one file to. */
  async partUrls(
    account: Identity,
    id: string,
    fileIndex: string,
    parts: unknown,
  ): Promise<{ partNumber: number; url: string }[]> {
    const store = this.requireStore();
    const file = (await this.uploading(account, id)).files[
      validIndex(fileIndex)
    ];
    if (!file) throw new Rejected('bulk-import-not-found');
    return store.partUrls(file.key, file.uploadId, validPartNumbers(parts));
  }

  /** The parts of one file already uploaded, to continue its upload from. */
  async uploadedParts(
    account: Identity,
    id: string,
    fileIndex: string,
  ): Promise<UploadedPart[]> {
    const store = this.requireStore();
    const file = (await this.uploading(account, id)).files[
      validIndex(fileIndex)
    ];
    if (!file) throw new Rejected('bulk-import-not-found');
    return store.uploadedParts(file.key, file.uploadId);
  }

  /**
   * Completes every file's upload from the parts the browser uploaded, sets
   * the import `waiting` and wakes the import service. A wake that fails
   * leaves it waiting for the next one.
   */
  async complete(
    account: Identity,
    id: string,
    files: unknown,
  ): Promise<BulkImportView> {
    const store = this.requireStore();
    const record = await this.uploading(account, id);
    const uploaded = validUploadedFiles(files, record.files.length);
    try {
      await Promise.all(
        record.files.map((file, index) =>
          store.completeUpload(file.key, file.uploadId, uploaded[index]),
        ),
      );
    } catch {
      throw new Rejected('invalid-bulk-import');
    }
    const [row] = await this.db
      .update(bulkImports)
      .set({ status: 'waiting', waitingSince: this.clock.now() })
      .where(and(eq(bulkImports.id, id), eq(bulkImports.status, 'uploading')))
      .returning();
    if (!row) throw new Rejected('bulk-import-not-found');
    await this.waker.wake();
    return view(row);
  }

  /** The Account's Bulk Imports, newest first: unfinished, or ended in the last 30 days. */
  async list(account: Identity): Promise<BulkImportView[]> {
    const listedSince = new Date(this.clock.now().getTime() - ENDED_KEPT_MS);
    const rows = await this.db
      .select()
      .from(bulkImports)
      .where(
        and(
          eq(bulkImports.identityId, account.id),
          or(
            isNull(bulkImports.finishedAt),
            gt(bulkImports.finishedAt, listedSince),
          ),
        ),
      )
      .orderBy(desc(bulkImports.createdAt));
    return rows.map(view);
  }

  /**
   * Stops the Account's unfinished import `id` before its next batch. The
   * Hands already imported stay; its files go.
   */
  async cancel(account: Identity, id: string): Promise<BulkImportView> {
    return view(await this.cancelWhere(id, account.id));
  }

  /**
   * Stops any Account's unfinished import `id`, exactly as its Importer
   * cancelling would.
   */
  async cancelAsAdministrator(id: string): Promise<void> {
    await this.cancelWhere(id, null);
  }

  /**
   * Takes up any Account's failed import `id` again where it stopped, from
   * the files kept for it, and wakes the import service. Only while those
   * files are kept (`bulk-import-not-retryable` otherwise), and only while
   * the Account has no other unfinished (`bulk-import-unfinished`).
   */
  async retryAsAdministrator(id: string): Promise<void> {
    if (!isUuid(id)) throw new Rejected('bulk-import-not-found');
    const [found] = await this.db
      .select()
      .from(bulkImports)
      .where(eq(bulkImports.id, id));
    if (!found) throw new Rejected('bulk-import-not-found');
    if (!retryable(found, this.clock.now())) {
      throw new Rejected('bulk-import-not-retryable');
    }
    try {
      const [retried] = await this.db
        .update(bulkImports)
        .set({
          // Counted already, it goes on adding; otherwise it counts again.
          status: found.total === null ? 'waiting' : 'running',
          failureCode: null,
          finishedAt: null,
          // Waiting for the service from now: not stalled before it has had its time.
          stalled: false,
          waitingSince: this.clock.now(),
        })
        .where(
          and(
            eq(bulkImports.id, id),
            eq(bulkImports.status, 'failed'),
            isNull(bulkImports.filesDeletedAt),
          ),
        )
        .returning({ id: bulkImports.id });
      if (!retried) throw new Rejected('bulk-import-not-retryable');
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new Rejected('bulk-import-unfinished');
    }
    await this.waker.wake();
  }

  /** Cancels `id`, if unfinished and, given `identityId`, that Account's. */
  private async cancelWhere(id: string, identityId: string | null) {
    if (!isUuid(id)) throw new Rejected('bulk-import-not-found');
    const [row] = await this.db
      .update(bulkImports)
      .set({ status: 'cancelled', finishedAt: this.clock.now() })
      .where(
        and(
          eq(bulkImports.id, id),
          identityId === null
            ? undefined
            : eq(bulkImports.identityId, identityId),
          notInArray(bulkImports.status, ENDED),
        ),
      )
      .returning();
    if (!row) throw new Rejected('bulk-import-not-found');
    await this.deleteFiles(row.files);
    return row;
  }

  /** The files, or what was uploaded of them; one left behind is only a waste of space. */
  private async deleteFiles(files: BulkImportFile[]): Promise<void> {
    if (!this.store) return;
    for (const file of files) {
      await this.store
        .delete(file.key, file.uploadId)
        .catch((error: unknown) =>
          this.logger.error(
            `Could not delete ${file.key}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    }
  }

  private async refuseUnfinished(account: Identity): Promise<void> {
    const [unfinished] = await this.db
      .select({ id: bulkImports.id })
      .from(bulkImports)
      .where(
        and(
          eq(bulkImports.identityId, account.id),
          notInArray(bulkImports.status, ENDED),
        ),
      )
      .limit(1);
    if (unfinished) throw new Rejected('bulk-import-unfinished');
  }

  /** The Account's Bulk Import `id`, still uploading. */
  private async uploading(account: Identity, id: string) {
    if (!isUuid(id)) throw new Rejected('bulk-import-not-found');
    const [row] = await this.db
      .select()
      .from(bulkImports)
      .where(
        and(
          eq(bulkImports.id, id),
          eq(bulkImports.identityId, account.id),
          eq(bulkImports.status, 'uploading'),
        ),
      );
    if (!row) throw new Rejected('bulk-import-not-found');
    return row;
  }

  private requireStore(): FileStore {
    if (!this.store) throw new Rejected('bulk-import-unavailable');
    return this.store;
  }
}

/**
 * Whether a Bulk Import can be retried at `now`: failed, with its files still
 * kept, which they are for 7 days.
 */
export function retryable(
  row: typeof bulkImports.$inferSelect,
  now: Date,
): boolean {
  return (
    row.status === 'failed' &&
    row.filesDeletedAt === null &&
    row.finishedAt !== null &&
    now.getTime() - row.finishedAt.getTime() < FAILED_FILES_KEPT_MS
  );
}

function view(row: typeof bulkImports.$inferSelect): BulkImportView {
  return {
    id: row.id,
    status: row.status,
    files: row.files.map(({ name, size }) => ({ name, size })),
    total: row.total,
    processed: row.processed,
    imported: row.imported,
    duplicates: row.duplicates,
    notImported: row.notImported,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function validFiles(files: unknown): ChosenFile[] {
  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    files.length > MAX_FILES ||
    !files.every(
      (file: Partial<ChosenFile> | null) =>
        typeof file?.name === 'string' &&
        file.name.length > 0 &&
        file.name.length <= 255 &&
        Number.isSafeInteger(file.size) &&
        (file.size as number) > 0,
    )
  ) {
    throw new Rejected('invalid-bulk-import');
  }
  const chosen = (files as ChosenFile[]).map(({ name, size }) => ({
    name,
    size,
  }));
  if (!chosen.every(({ name }) => IMPORTABLE_FILE.test(name))) {
    throw new Rejected('unsupported-file');
  }
  const bytes = chosen.reduce((sum, { size }) => sum + size, 0);
  if (bytes > MAX_BULK_IMPORT_BYTES) {
    throw new Rejected('bulk-import-too-large');
  }
  return chosen;
}

function sameFiles(stored: BulkImportFile[], chosen: ChosenFile[]): boolean {
  return (
    stored.length === chosen.length &&
    stored.every(
      (file, index) =>
        file.name === chosen[index].name && file.size === chosen[index].size,
    )
  );
}

function validIndex(index: string): number {
  if (!/^\d{1,3}$/.test(index)) throw new Rejected('bulk-import-not-found');
  return Number(index);
}

function isPartNumber(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= MAX_PART_NUMBER
  );
}

function validPartNumbers(parts: unknown): number[] {
  if (
    !Array.isArray(parts) ||
    parts.length === 0 ||
    parts.length > MAX_PART_NUMBER ||
    !parts.every(isPartNumber)
  ) {
    throw new Rejected('invalid-bulk-import');
  }
  return parts;
}

/** Each file's uploaded parts, one entry per file in the import's order. */
function validUploadedFiles(
  files: unknown,
  count: number,
): { partNumber: number; etag: string }[][] {
  const valid =
    Array.isArray(files) &&
    files.length === count &&
    files.every(
      (file: { parts?: unknown } | null) =>
        Array.isArray(file?.parts) &&
        file.parts.length > 0 &&
        file.parts.every(
          (part: { partNumber?: unknown; etag?: unknown } | null) =>
            isPartNumber(part?.partNumber) &&
            typeof part.etag === 'string' &&
            part.etag.length > 0,
        ),
    );
  if (!valid) throw new Rejected('invalid-bulk-import');
  return (files as { parts: { partNumber: number; etag: string }[] }[]).map(
    (file) => file.parts.map(({ partNumber, etag }) => ({ partNumber, etag })),
  );
}
