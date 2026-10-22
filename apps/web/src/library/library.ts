import type { QueueEntry } from '../room/roomClient'
import { roomPath } from '../room/roomCode'

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

/** Where a Participant picks Hands of their Library to add to the Room's Queue, still in the Room. */
export function roomLibraryPath(code: string): string {
  return `${roomPath(code)}${libraryPath}`
}

/** The Room Code in a Room's Library path, or null for any other path. */
export function roomCodeFromLibraryPath(path: string): string | null {
  return path.match(/^\/room\/([^/]+)\/library\/?$/)?.[1] ?? null
}

/** One Library row: what tells the spot apart at a glance. */
export type LibraryHand = Pick<QueueEntry, 'site' | 'siteHandId' | 'playedAt' | 'stake' | 'summary'> & {
  id: string
  /** The Hero's Screen Name, from the Hand History. */
  hero: string
  holeCards: string[]
  /** The Hero's Result, as an Amount: what they collected minus what they put in. */
  result: number
  /** Whether this person has Marked it. Nobody else is ever told. */
  marked: boolean
  /** This person's Tags on it, sorted by name. Nobody else is ever told. */
  tags: Pick<Tag, 'id' | 'name'>[]
}

/** One of the Account's Tags, with how many Hands of its Library carry it. */
export interface Tag {
  id: string
  name: string
  hands: number
}

/** One page of the Hands a Library filter keeps, newest first, with how many it keeps. */
export interface LibraryPage {
  total: number
  /** From 1. */
  page: number
  pageSize: number
  hands: LibraryHand[]
  /** What the whole Library holds to filter by, whatever the filter. */
  options: {
    sites: LibraryHand['site'][]
    heroes: string[]
    stakes: LibraryHand['stake'][]
    /** Every one of the Account's Tags, sorted by name. */
    tags: Tag[]
  }
  /** The whole Library's Hands, and how many of them are Marked. */
  counts: { all: number; marked: number }
}

/** How many Hands one Library page shows. */
export const LIBRARY_PAGE_SIZE = 50
