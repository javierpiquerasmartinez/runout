import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import {
  bulkImports,
  type BulkImportFile,
  type BulkImportStatus,
} from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import { FILE_STORE, type FileStore } from '../file-store/file-store.js';
import type { Identity } from '../identity/identity.service.js';
import { ImportServiceWaker } from '../import-service/import-service-waker.js';
import { Rejected } from '../rejection/rejection.js';

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

/**
 * Bulk Imports, as the Importer starts and follows them from the API. The
 * import service adds their Hands; this side records them, hands out the
 * upload's part URLs and wakes the service once the files are in.
 */
@Injectable()
export class BulkImportsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FILE_STORE) private readonly store: FileStore | null,
    private readonly waker: ImportServiceWaker,
  ) {}

  /** Records a Bulk Import of these files, `uploading`, and starts each file's upload. */
  async start(account: Identity, files: unknown): Promise<BulkImportView> {
    const store = this.requireStore();
    const chosen = validFiles(files);
    const id = randomUUID();
    const stored: BulkImportFile[] = await Promise.all(
      chosen.map(async ({ name, size }, index) => {
        const key = `bulk-imports/${id}/${index}`;
        return { name, size, key, uploadId: await store.startUpload(key) };
      }),
    );
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
      .set({ status: 'waiting' })
      .where(and(eq(bulkImports.id, id), eq(bulkImports.status, 'uploading')))
      .returning();
    if (!row) throw new Rejected('bulk-import-not-found');
    await this.waker.wake();
    return view(row);
  }

  /** The Account's Bulk Imports, newest first. */
  async list(account: Identity): Promise<BulkImportView[]> {
    const rows = await this.db
      .select()
      .from(bulkImports)
      .where(eq(bulkImports.identityId, account.id))
      .orderBy(desc(bulkImports.createdAt));
    return rows.map(view);
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
  return (files as ChosenFile[]).map(({ name, size }) => ({ name, size }));
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
