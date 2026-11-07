import { libraryFilterFromSearch, libraryFilterQuery } from './libraryFilter'
import { librarySortFromSearch, librarySortQuery } from './librarySort'

/*
 * Replaying several Hands from the Library one after another: the Hand's
 * address says which list it is in, `replay=<id>,<id>…` for Hands that were
 * selected, or `replay=filter` beside a filter and sort for every Hand they
 * keep. Where in the list the Hand is comes from its own id.
 */
const REPLAY = 'replay'
const REPLAY_FILTER = 'filter'

/** The list of Hands a Library Hand's address replays, or null for a Hand opened on its own. */
export type ReplayList = { kind: 'selected'; ids: string[] } | { kind: 'filter'; query: string }

/** The search that replays these selected Hands, in this order. */
export function replaySelectedSearch(ids: string[]): string {
  return `?${REPLAY}=${ids.map(encodeURIComponent).join(',')}`
}

/** The search that replays every Hand the Library's search keeps, in its order: its page is left out. */
export function replayFilterSearch(librarySearch: string): string {
  const query = new URLSearchParams(librarySearch)
  query.delete('page')
  query.delete(REPLAY)
  const rest = query.toString()
  return `?${REPLAY}=${REPLAY_FILTER}${rest && `&${rest}`}`
}

/** The list a Library Hand's search replays, or null. */
export function replayFromSearch(search: string): ReplayList | null {
  const query = new URLSearchParams(search)
  const replay = query.get(REPLAY)
  if (!replay) return null
  if (replay === REPLAY_FILTER) {
    query.delete(REPLAY)
    return { kind: 'filter', query: query.toString() }
  }
  return { kind: 'selected', ids: replay.split(',').filter(Boolean) }
}

/**
 * What the server is asked for the Hands a Library address keeps, in its
 * order: the address keeps the viewer's days, the server takes instants.
 */
export function replayServerQuery(addressQuery: string): string {
  const query = libraryFilterQuery(libraryFilterFromSearch(addressQuery))
  librarySortQuery(librarySortFromSearch(addressQuery)).forEach((value, key) => query.append(key, value))
  return query.toString()
}
