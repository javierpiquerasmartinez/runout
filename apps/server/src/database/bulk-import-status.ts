import { inArray, notInArray } from 'drizzle-orm';
import { bulkImports, type BulkImportStatus } from './schema.js';

/*
 * How the server tells a Bulk Import's statuses apart, beside the schema
 * that lists them.
 */

/** Ended, one way or another: it no longer changes. Any other is unfinished. */
export const ENDED: BulkImportStatus[] = ['completed', 'failed', 'cancelled'];

/** The import service's to advance. Not a paused one, which waits on purpose. */
export const ADVANCING: BulkImportStatus[] = ['waiting', 'counting', 'running'];

/** An unfinished import, as a condition on `bulk_imports`. */
export const unfinished = notInArray(bulkImports.status, ENDED);

/**
 * An import the import service is to advance, as a condition on
 * `bulk_imports`. The import engine asks for it on every write outside a
 * batch, so that one cancelled meanwhile stays cancelled.
 */
export const advancing = inArray(bulkImports.status, ADVANCING);
