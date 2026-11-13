import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import {
  bulkImports,
  identities,
  type BulkImportStatus,
} from '../database/schema.js';
import { ENDED } from '../bulk-imports/bulk-imports.service.js';
import type { PersonView } from '../identity/invitations.service.js';
import { adminPage, oneOf } from './admin-query.js';
import { person } from './accounts.service.js';

/** A Bulk Import as the Importaciones tab lists it. Never the text of a Hand. */
export interface AdminBulkImportView {
  id: string;
  account: PersonView;
  status: BulkImportStatus;
  /** No advance for a long while: Atascada. */
  stalled: boolean;
  files: { name: string; size: number }[];
  total: number | null;
  processed: number;
  imported: number;
  duplicates: number;
  notImported: Record<string, number>;
  /** The technical reason it ended short or failed, when it did. */
  reason: string | null;
  createdAt: string;
  /** When it last moved: ended, advanced, or started. */
  lastActivityAt: string;
  finishedAt: string | null;
}

/** The tab's filters: Todas, En curso, Fallidas and Atascadas. */
export const BULK_IMPORT_FILTERS = [
  'all',
  'active',
  'failed',
  'stalled',
] as const;

/** The Importaciones tab: every Account's Bulk Imports, newest first. */
@Injectable()
export class BulkImportsAdminService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(query: {
    status?: unknown;
    page?: unknown;
    pageSize?: unknown;
  }): Promise<{
    total: number;
    page: number;
    pageSize: number;
    imports: AdminBulkImportView[];
  }> {
    const filter = oneOf(query.status, BULK_IMPORT_FILTERS);
    const { page, pageSize } = adminPage(query);
    const where = {
      all: undefined,
      active: notInArray(bulkImports.status, ENDED),
      failed: inArray(bulkImports.status, ['failed']),
      stalled: and(
        eq(bulkImports.stalled, true),
        notInArray(bulkImports.status, ENDED),
      ),
    }[filter];
    const [[{ total }], rows] = await Promise.all([
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(bulkImports)
        .where(where),
      this.db
        .select({ record: bulkImports, account: identities })
        .from(bulkImports)
        .innerJoin(identities, eq(identities.id, bulkImports.identityId))
        .where(where)
        .orderBy(sql`${bulkImports.createdAt} desc, ${bulkImports.id}`)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    return {
      total,
      page,
      pageSize,
      imports: rows.map(({ record, account }) => ({
        id: record.id,
        account: person(account),
        status: record.status,
        stalled: record.stalled,
        files: record.files.map(({ name, size }) => ({ name, size })),
        total: record.total,
        processed: record.processed,
        imported: record.imported,
        duplicates: record.duplicates,
        notImported: record.notImported,
        reason: record.reason,
        createdAt: record.createdAt.toISOString(),
        lastActivityAt: (
          record.finishedAt ??
          record.lastAdvancedAt ??
          record.createdAt
        ).toISOString(),
        finishedAt: record.finishedAt?.toISOString() ?? null,
      })),
    };
  }
}
