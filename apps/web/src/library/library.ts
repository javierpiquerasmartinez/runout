import type { QueueEntry } from '../room/roomClient'
import { roomPath } from '../room/roomCode'

/*
 * An Account's Library as the server's `GET /library/hands` sends it, one
 * page at a time. Shapes mirror the server's (ADR 0001: no shared code).
 */

export const libraryPath = '/library'

/** Where the Library shows its Results Graph instead of its Hands. */
export const libraryGraphPath = `${libraryPath}/graph`

/** What the Library shows under its filters: its Hands, or their Results Graph. */
export type LibraryView = 'list' | 'graph'

/** Where the Library shows this view. */
export function libraryViewPath(view: LibraryView): string {
  return view === 'graph' ? libraryGraphPath : libraryPath
}

/** The view a Library path shows, or null for any other path. */
export function libraryViewFromPath(path: string): LibraryView | null {
  if (path === libraryPath) return 'list'
  if (path === libraryGraphPath) return 'graph'
  return null
}

/** The list's page an address keeps: the first unless it says another. */
export function libraryPageFromSearch(search: string): number {
  const page = Number(new URLSearchParams(search).get('page'))
  return Number.isInteger(page) && page > 1 ? page : 1
}

/** The address's search with the page written in place of whichever it had; the first page is left out. */
export function withLibraryPage(search: string, page: number): string {
  const query = new URLSearchParams(search)
  query.delete('page')
  if (page > 1) query.set('page', String(page))
  const written = query.toString()
  return written && `?${written}`
}

/*
 * A Hand opened from the Library keeps, in its history entry, the Library's
 * address it was opened from, so "Volver" goes back there; the Library's own
 * entry keeps how far down it was scrolled, to land there again.
 */
const OPENED_FROM = 'openedFromLibrary'
const SCROLLED_TO = 'libraryScrollY'

/** The history state for a Hand opened from the Library at this address. */
export function openedFromLibrary(address: string): Record<string, unknown> {
  return { [OPENED_FROM]: address }
}

/** The Library's address a Hand's history entry was opened from, or null when it wasn't. */
export function libraryOpenedFrom(state: unknown): string | null {
  const address = isRecord(state) ? state[OPENED_FROM] : undefined
  return typeof address === 'string' ? address : null
}

/** The history state of the Library's entry, keeping how far down it is scrolled, or no longer keeping it (null). */
export function withLibraryScroll(state: unknown, scrollY: number | null): Record<string, unknown> {
  const { [SCROLLED_TO]: _kept, ...rest } = isRecord(state) ? state : {}
  return scrollY === null ? rest : { ...rest, [SCROLLED_TO]: scrollY }
}

/** How far down the Library's entry was scrolled when a Hand was opened from it, or null. */
export function libraryScroll(state: unknown): number | null {
  const scrollY = isRecord(state) ? state[SCROLLED_TO] : undefined
  return typeof scrollY === 'number' ? scrollY : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

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
