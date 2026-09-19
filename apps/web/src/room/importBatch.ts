import type { FailureReason } from '../backend/api'
import type { QueueEntry } from './roomClient'

/*
 * The files (and pastes) in the import dialog, each read by the server into a
 * preview, until the Importer confirms the batch. Pure: the dialog dispatches
 * what happened and renders what this derives.
 */

/** The formats the server reads. Mirrors the server's (ADR 0001: no shared code). */
export type SourceFormat = 'pokerstars' | 'ggpoker' | 'winamax'
export const SOURCE_FORMATS: SourceFormat[] = ['pokerstars', 'ggpoker', 'winamax']

export type DiscardReason = 'unrecognised-format' | 'not-cash-holdem' | 'too-many-seats' | 'no-hero' | 'malformed'

/** What the dialog shows of each Hand the server read. */
export type HandPreview = Pick<QueueEntry, 'playedAt' | 'stake' | 'summary'> & { board: string[] }

/** The server's reading of one file or paste. */
export interface ImportPreview {
  id: string
  /** `null` when detection recognised nothing. */
  format: SourceFormat | null
  /** The formats it was tried against, to pick one by hand from. */
  tried: SourceFormat[]
  hands: HandPreview[]
  discarded: { text: string; reason: DiscardReason }[]
}

/** The largest file the server takes. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024

export type ImportItem = {
  /** Tells items apart, even two files with the same name. */
  key: string
  name: string
} & (
  | { state: 'reading'; format?: SourceFormat }
  | { state: 'read'; preview: ImportPreview }
  | { state: 'failed'; reason: FailureReason }
)

export interface ImportBatch {
  items: ImportItem[]
}

export const emptyBatch: ImportBatch = { items: [] }

export type BatchEvent =
  | { type: 'added'; items: { key: string; name: string; size: number }[] }
  | { type: 'read'; key: string; preview: ImportPreview }
  | { type: 'failed'; key: string; reason: FailureReason }
  | { type: 'rereading'; key: string; format: SourceFormat }
  | { type: 'removed'; key: string }

export function reduceBatch(batch: ImportBatch, event: BatchEvent): ImportBatch {
  const update = (key: string, next: (item: ImportItem) => ImportItem) => ({
    items: batch.items.map((item) => (item.key === key ? next(item) : item)),
  })
  switch (event.type) {
    case 'added':
      return {
        items: [
          ...batch.items,
          ...event.items.map(({ key, name, size }): ImportItem =>
            size > MAX_FILE_BYTES ? { key, name, state: 'failed', reason: 'file-too-large' } : { key, name, state: 'reading' },
          ),
        ],
      }
    // An answer for an item removed meanwhile finds nothing to update.
    case 'read':
      return update(event.key, ({ key, name }) => ({ key, name, state: 'read', preview: event.preview }))
    case 'failed':
      return update(event.key, ({ key, name }) => ({ key, name, state: 'failed', reason: event.reason }))
    case 'rereading':
      return update(event.key, ({ key, name }) => ({ key, name, state: 'reading', format: event.format }))
    case 'removed':
      return { items: batch.items.filter((item) => item.key !== event.key) }
  }
}

export interface BatchTotals {
  /** Hands that confirming adds to the Queue. */
  ready: number
  /** Hands that will be left out. */
  discarded: number
  /** Whether any item is still being read; confirming waits for it. */
  reading: boolean
  /** What confirming sends, in the order the files were added. */
  previewIds: string[]
}

export function batchTotals(batch: ImportBatch): BatchTotals {
  const read = batch.items.flatMap((item) => (item.state === 'read' ? [item.preview] : []))
  return {
    ready: read.reduce((sum, preview) => sum + preview.hands.length, 0),
    discarded: read.reduce((sum, preview) => sum + preview.discarded.length, 0),
    reading: batch.items.some((item) => item.state === 'reading'),
    previewIds: read.filter((preview) => preview.hands.length > 0).map((preview) => preview.id),
  }
}

/** Every Hand ready to add, in the order they will join the Queue. */
export function batchHands(batch: ImportBatch): HandPreview[] {
  return batch.items.flatMap((item) => (item.state === 'read' ? item.preview.hands : []))
}
