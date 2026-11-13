import { api } from '../backend/api'
import type { BulkImport } from './bulkImports'

/*
 * Uploading a Bulk Import's files straight to storage, in parts, through the
 * URLs the API hands out. Choosing the same files again (by name and size)
 * gives back the import still uploading them, so that only the parts not yet
 * in storage go up. Limits mirror the server's (ADR 0001: no shared code).
 */

/** The most one Bulk Import may upload, all its files together. */
export const MAX_BULK_IMPORT_BYTES = 2.5 * 1024 ** 3

/** The most files one Bulk Import may take; more go in a .zip. */
export const MAX_BULK_IMPORT_FILES = 100

/** What a Bulk Import reads: Hand Histories as text, or zipped. */
export function isImportableFile(name: string): boolean {
  return /\.(txt|zip)$/i.test(name)
}

/**
 * Each part's size. Fixed, so that an upload continued later splits the file
 * the same way; at 2.5 GB that is 320 parts, well under storage's 10,000.
 */
export const PART_BYTES = 8 * 1024 * 1024

/** How many parts go up at once. */
const PARALLEL_PARTS = 4

/** Part URLs asked for at once. */
const URLS_PER_REQUEST = 50

interface Part {
  partNumber: number
  etag: string
}

/** Thrown when storage refuses a part or answers without its ETag. */
/** How far an upload has got, in whole percent. */
export function percentOf({ sent, total }: { sent: number; total: number }): number {
  return total > 0 ? Math.floor((sent / total) * 100) : 0
}

export class UploadFailed extends Error {}

/**
 * Starts (or continues) a Bulk Import of `files` and uploads every part not
 * yet in storage, reporting the bytes in storage so far; resolves once the
 * API has marked the upload complete.
 */
export async function uploadBulkImport(
  files: File[],
  { token, onProgress }: { token: string | undefined; onProgress: (sent: number, total: number) => void },
): Promise<void> {
  const started = await api<BulkImport>('/library/bulk-imports', {
    token,
    method: 'POST',
    body: { files: files.map(({ name, size }) => ({ name, size })) },
  })
  const path = `/library/bulk-imports/${started.id}`
  const total = files.reduce((sum, file) => sum + file.size, 0)
  let sent = 0
  onProgress(sent, total)

  const uploaded: Part[][] = []
  for (const [index, file] of files.entries()) {
    const filePath = `${path}/files/${index}/parts`
    const { parts: kept } = await api<{ parts: Part[] }>(filePath, { token })
    const parts = new Map(kept.map((part) => [part.partNumber, part]))
    for (const { partNumber } of kept) sent += partSize(file, partNumber)
    onProgress(sent, total)

    const missing = partNumbers(file).filter((partNumber) => !parts.has(partNumber))
    for (let from = 0; from < missing.length; from += URLS_PER_REQUEST) {
      const { parts: urls } = await api<{ parts: { partNumber: number; url: string }[] }>(filePath, {
        token,
        method: 'POST',
        body: { parts: missing.slice(from, from + URLS_PER_REQUEST) },
      })
      await inParallel(urls, PARALLEL_PARTS, async ({ partNumber, url }) => {
        parts.set(partNumber, { partNumber, etag: await putPart(url, partOf(file, partNumber)) })
        sent += partSize(file, partNumber)
        onProgress(sent, total)
      })
    }
    uploaded.push([...parts.values()].sort((a, b) => a.partNumber - b.partNumber))
  }

  await api(`${path}/complete`, {
    token,
    method: 'POST',
    body: { files: uploaded.map((parts) => ({ parts })) },
  })
}

/** Every part number of `file`; an empty file still has one. */
function partNumbers(file: File): number[] {
  const count = Math.max(1, Math.ceil(file.size / PART_BYTES))
  return Array.from({ length: count }, (_, index) => index + 1)
}

function partSize(file: File, partNumber: number): number {
  return Math.max(0, Math.min(PART_BYTES, file.size - (partNumber - 1) * PART_BYTES))
}

function partOf(file: File, partNumber: number): Blob {
  const start = (partNumber - 1) * PART_BYTES
  return file.slice(start, start + PART_BYTES)
}

/** PUTs a part to its presigned URL; storage answers with the part's ETag. */
async function putPart(url: string, bytes: Blob): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, { method: 'PUT', body: bytes })
  } catch {
    throw new UploadFailed()
  }
  const etag = response.headers.get('ETag')
  if (!response.ok || !etag) throw new UploadFailed()
  return etag
}

async function inParallel<T>(items: T[], width: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const lane = async () => {
    while (next < items.length) await run(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, lane))
}
