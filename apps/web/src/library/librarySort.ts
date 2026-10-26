/*
 * The order of the Library's list, as the server's `LibrarySort` reads it
 * from a query (ADR 0001: no shared code). It lives in the address next to
 * the filter, so a reload or a shared link keeps it, but only the list reads
 * it: the Results Graph always runs in played order.
 */

export type LibrarySortColumn = 'date' | 'result' | 'pot' | 'stake'

export interface LibrarySort {
  by: LibrarySortColumn
  dir: 'desc' | 'asc'
}

/** Newest first: what a bare address means. */
export const DEFAULT_LIBRARY_SORT: LibrarySort = { by: 'date', dir: 'desc' }

const COLUMNS: readonly string[] = ['date', 'result', 'pot', 'stake'] satisfies LibrarySortColumn[]

/** The sort an address keeps; anything it can't read is the default. */
export function librarySortFromSearch(search: string): LibrarySort {
  const query = new URLSearchParams(search)
  const by = query.get('sort') ?? DEFAULT_LIBRARY_SORT.by
  const dir = query.get('dir') ?? DEFAULT_LIBRARY_SORT.dir
  if (!COLUMNS.includes(by) || (dir !== 'desc' && dir !== 'asc')) return DEFAULT_LIBRARY_SORT
  return { by: by as LibrarySortColumn, dir }
}

/** The sort's parameters, for the server and the address alike; none for the default. */
export function librarySortQuery(sort: LibrarySort): URLSearchParams {
  const query = new URLSearchParams()
  if (sort.by === DEFAULT_LIBRARY_SORT.by && sort.dir === DEFAULT_LIBRARY_SORT.dir) return query
  query.set('sort', sort.by)
  query.set('dir', sort.dir)
  return query
}

/** The address's search with the sort written in place of whichever it had. */
export function withLibrarySort(search: string, sort: LibrarySort): string {
  const query = new URLSearchParams(search)
  query.delete('sort')
  query.delete('dir')
  librarySortQuery(sort).forEach((value, key) => query.append(key, value))
  const written = query.toString()
  return written && `?${written}`
}

/** What a column's header does: biggest first on a new column, the other way on the current one. */
export function nextLibrarySort(current: LibrarySort, by: LibrarySortColumn): LibrarySort {
  if (current.by !== by) return { by, dir: 'desc' }
  return { by, dir: current.dir === 'desc' ? 'asc' : 'desc' }
}
