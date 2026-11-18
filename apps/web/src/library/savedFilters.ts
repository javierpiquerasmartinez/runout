import { readFactCriterion, writeFactCriterion } from './facts'
import { statCriterion, type LibraryFilter } from './libraryFilter'

/**
 * A Saved Filter, as the server's `SavedFilter` lists it (ADR 0001): the Más
 * filtros part of a Filter (CONTEXT.md, Saved Filter) under a name. Its
 * criteria are written as the address writes them, `fact` and `stat` values;
 * `dropped` counts those on facts or Stats the Library no longer knows.
 */
export interface SavedFilter {
  id: string
  name: string
  criteria: SavedCriteria
  dropped: number
}

export interface SavedCriteria {
  facts: string[]
  stat: string | null
}

/** How long a Saved Filter's name may be, as the server allows. */
export const SAVED_FILTER_NAME_MAX = 40

/** What saving the filter keeps: its Más filtros criteria and its Stat criterion, nothing else. */
export function savedCriteriaOf(filter: LibraryFilter): SavedCriteria {
  return {
    facts: filter.facts.map(writeFactCriterion),
    stat: filter.stat && `${filter.stat.key}:${filter.stat.side}`,
  }
}

/** Whether the filter holds anything a Saved Filter would keep. */
export function hasSavedCriteria(filter: LibraryFilter): boolean {
  return filter.facts.length > 0 || filter.stat !== null
}

/**
 * The filter with the Saved Filter applied: its criteria replace the Más
 * filtros ones, and the period, Poker Sites, Heroes, Stakes, Marks and Tags
 * stay. Applying the one applied drops it, criteria and all.
 */
export function applySavedFilter(filter: LibraryFilter, saved: SavedFilter): LibraryFilter {
  if (filter.saved === saved.id) return withoutSavedCriteria(filter)
  return restoreSavedFilter(filter, saved)
}

/** The filter with the Saved Filter's criteria, as saved, in place of the Más filtros ones: applying it, or discarding changes to it. */
export function restoreSavedFilter(filter: LibraryFilter, saved: SavedFilter): LibraryFilter {
  return {
    ...filter,
    facts: saved.criteria.facts.flatMap((text) => readFactCriterion(text) ?? []),
    stat: statCriterion(saved.criteria.stat),
    saved: saved.id,
  }
}

/** The filter with no Más filtros criteria and no Saved Filter: what removing one, or finding it gone, leaves. */
export function withoutSavedCriteria(filter: LibraryFilter): LibraryFilter {
  return { ...filter, facts: [], stat: null, saved: null }
}

/**
 * The Saved Filter the filter names, and whether its criteria are no longer
 * the saved ones (the "· modificado" chip); null when it names none, or one
 * the list doesn't hold. The address keeps the id beside the criteria, so a
 * reload keeps a modified one modified, and undoing the change by hand, in
 * any order, makes it unchanged again.
 */
export function savedFilterState(
  filter: LibraryFilter,
  savedFilters: SavedFilter[],
): { saved: SavedFilter; modified: boolean } | null {
  const saved = savedFilters.find((each) => each.id === filter.saved)
  if (!saved) return null
  const current = comparable(savedCriteriaOf(filter))
  // As the Library reads them, so a criterion it can't read doesn't count as a change.
  const kept = comparable(savedCriteriaOf(restoreSavedFilter(filter, saved)))
  return { saved, modified: current !== kept }
}

/** The criteria as one text, the order left out. */
function comparable(criteria: SavedCriteria): string {
  return JSON.stringify([[...criteria.facts].sort(), criteria.stat])
}

/** How many of the Saved Filter's criteria are left out: those the server dropped reading it, and those the Library can't read. */
export function droppedCriteria(saved: SavedFilter): number {
  const unread = saved.criteria.facts.filter((text) => readFactCriterion(text) === null).length
  return saved.dropped + unread + (saved.criteria.stat !== null && statCriterion(saved.criteria.stat) === null ? 1 : 0)
}
