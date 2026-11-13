/*
 * An Account's Bulk Imports as the server's `GET /library/bulk-imports`
 * sends them. Shapes mirror the server's (ADR 0001: no shared code).
 */

export type BulkImportStatus =
  | 'uploading'
  | 'waiting'
  | 'counting'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

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
