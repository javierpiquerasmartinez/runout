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
  if (filter.saved === saved.id) return { ...filter, facts: [], stat: null, saved: null }
  return {
    ...filter,
    facts: saved.criteria.facts.flatMap((text) => readFactCriterion(text) ?? []),
    stat: statCriterion(saved.criteria.stat),
    saved: saved.id,
  }
}

/** The Saved Filter the filter names, while it still holds that one's criteria unchanged; otherwise null. */
export function appliedSavedFilter(filter: LibraryFilter, savedFilters: SavedFilter[]): SavedFilter | null {
  const saved = savedFilters.find((each) => each.id === filter.saved)
  if (!saved) return null
  const current = savedCriteriaOf(filter)
  const same =
    current.stat === saved.criteria.stat &&
    current.facts.length === saved.criteria.facts.length &&
    current.facts.every((fact, index) => fact === saved.criteria.facts[index])
  return same ? saved : null
}
