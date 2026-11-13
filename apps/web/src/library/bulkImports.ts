/*
 * An Account's Bulk Imports as the server's `GET /library/bulk-imports`
 * sends them. Shapes mirror the server's (ADR 0001: no shared code).
 */

/** How often the Library reads its Bulk Imports again while one is unfinished. */
export const BULK_IMPORTS_POLL_MS = 5_000

export type BulkImportStatus =
  | 'uploading'
  | 'waiting'
  | 'counting'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Why a Bulk Import ended short of adding its Hands. */
export type BulkImportReason = 'too-many-hands' | 'too-much-text' | 'unreadable-file' | 'unrecognised-format' | 'library-full'

export interface BulkImport {
  id: string
  status: BulkImportStatus
  files: { name: string; size: number }[]
  /** Null until its files are counted. */
  total: number | null
  processed: number
  imported: number
  duplicates: number
  /** Hands not imported, per reason. */
  notImported: Record<string, number>
  /**
   * Why it ended short of adding its Hands, when it did. A full Library
   * counts the Hands left unimported, read or not, in `notImported['library-full']`.
   */
  reason: BulkImportReason | null
  createdAt: string
  finishedAt: string | null
}

/** What the Importer is told of a status: waiting, counting and running all read "En curso". */
export type BulkImportStage = 'uploading' | 'inProgress' | 'paused' | 'completed' | 'failed' | 'cancelled'

export function stageOf(status: BulkImportStatus): BulkImportStage {
  switch (status) {
    case 'waiting':
    case 'counting':
    case 'running':
      return 'inProgress'
    default:
      return status
  }
}

/** Whether it has ended, one way or another: it no longer changes. */
export function isFinished(status: BulkImportStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

/**
 * Whether it is the import service's to add, now or once resumed: neither
 * still uploading, which the import dialog follows, nor ended.
 */
export function isUnderway(status: BulkImportStatus): boolean {
  return status !== 'uploading' && !isFinished(status)
}
