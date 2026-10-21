import type { QueueEntry } from '../room/roomClient'

/*
 * An Account's Library as the server's `GET /library/hands` sends it, one
 * page at a time. Shapes mirror the server's (ADR 0001: no shared code).
 */

export const libraryPath = '/library'

/** Where a Hand opened from the Library is replayed. */
export function libraryHandPath(handId: string): string {
  return `${libraryPath}/hands/${encodeURIComponent(handId)}`
}

/** The Hand id in a Library Hand's path, or null for any other path. */
export function libraryHandIdFromPath(path: string): string | null {
  const prefix = libraryHandPath('')
  const id = path.startsWith(prefix) ? path.slice(prefix.length) : ''
  return id && !id.includes('/') ? decodeURIComponent(id) : null
}

/** One Library row: what tells the spot apart at a glance. */
export type LibraryHand = Pick<QueueEntry, 'site' | 'siteHandId' | 'playedAt' | 'stake' | 'summary'> & {
  id: string
  /** The Hero's Screen Name, from the Hand History. */
  hero: string
  holeCards: string[]
}

/** One page of the Library, newest first, with how many Hands it holds. */
export interface LibraryPage {
  total: number
  /** From 1. */
  page: number
  pageSize: number
  hands: LibraryHand[]
}

/** How many Hands one Library page shows. */
export const LIBRARY_PAGE_SIZE = 50
