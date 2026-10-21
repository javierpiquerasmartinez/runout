import type { QueueEntry } from '../room/roomClient'

type Stake = QueueEntry['stake']

/*
 * The Library filter, as the server's `LibraryFilter` reads it from a query
 * (ADR 0001: no shared code). The list, the Results Graph and the Room's
 * Library picker build their queries here, so they always describe the same
 * Hands.
 */

/**
 * Which Hands to look at. The period is in the viewer's own days
 * (`YYYY-MM-DD`, both ends included); null leaves that part open.
 */
export interface LibraryFilter {
  from: string | null
  to: string | null
  site: string | null
  hero: string | null
  /** A Stake as `stakeKey` writes it. */
  stake: string | null
  markedOnly: boolean
}

export const EMPTY_LIBRARY_FILTER: LibraryFilter = {
  from: null,
  to: null,
  site: null,
  hero: null,
  stake: null,
  markedOnly: false,
}

export type QuickRange = 'last-7-days' | 'last-30-days' | 'this-year' | 'all-time'

export const QUICK_RANGES: QuickRange[] = ['last-7-days', 'last-30-days', 'this-year', 'all-time']

/** The quick range's days, counted back from today in the viewer's time zone. */
export function quickRange(range: QuickRange, now: Date = new Date()): Pick<LibraryFilter, 'from' | 'to'> {
  const today = localDay(now)
  const daysBack = (days: number) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days))
  switch (range) {
    case 'last-7-days':
      return { from: daysBack(6), to: today }
    case 'last-30-days':
      return { from: daysBack(29), to: today }
    case 'this-year':
      return { from: `${now.getFullYear()}-01-01`, to: today }
    case 'all-time':
      return { from: null, to: null }
  }
}

/** The quick range these days are, or `custom`. */
export function periodOf(period: Pick<LibraryFilter, 'from' | 'to'>, now: Date = new Date()): QuickRange | 'custom' {
  const match = QUICK_RANGES.find((range) => {
    const days = quickRange(range, now)
    return days.from === period.from && days.to === period.to
  })
  return match ?? 'custom'
}

/** Whether any part of the filter narrows the Library. */
export function isFiltering(filter: LibraryFilter): boolean {
  return (Object.keys(filter) as (keyof LibraryFilter)[]).some((key) => filter[key] !== EMPTY_LIBRARY_FILTER[key])
}

/** The filter as the server's query: the viewer's days become instants, `to` exclusive. */
export function libraryFilterQuery(filter: LibraryFilter): URLSearchParams {
  const query = new URLSearchParams()
  if (filter.from) query.set('from', startOf(filter.from, 0))
  if (filter.to) query.set('to', startOf(filter.to, 1))
  if (filter.site) query.set('site', filter.site)
  if (filter.hero) query.set('hero', filter.hero)
  if (filter.stake) query.set('stake', filter.stake)
  if (filter.markedOnly) query.set('marked', 'true')
  return query
}

/** A Stake as the query writes it: `no-limit:5:10:EUR`. */
export function stakeKey(stake: Stake): string {
  return [stake.limit, stake.smallBlind, stake.bigBlind, stake.currency].join(':')
}

/** The viewer's local midnight `days` after the day, as an instant. */
function startOf(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date + days).toISOString()
}

function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
