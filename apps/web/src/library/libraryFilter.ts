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
  /** Tag ids: a Hand carrying any of them is kept. */
  tags: string[]
}

/** Every Hand of the Library: nothing narrows it, not even the period. */
export const EMPTY_LIBRARY_FILTER: LibraryFilter = {
  from: null,
  to: null,
  site: null,
  hero: null,
  stake: null,
  markedOnly: false,
  tags: [],
}

export type QuickRange = 'today' | 'this-week' | 'this-month' | 'this-year' | 'all-time'

/** The period the Library starts on, and the one a bare address means. */
export const DEFAULT_PERIOD: QuickRange = 'today'

/** How the address says all time, since leaving the period out means the default one. */
const ALL_TIME_PARAM = { name: 'period', value: 'all' } as const

/** What the Library shows until the viewer changes it: the default period's Hands, nothing else narrowed. */
export function defaultLibraryFilter(now: Date = new Date()): LibraryFilter {
  return { ...EMPTY_LIBRARY_FILTER, ...quickRange(DEFAULT_PERIOD, now) }
}

/** Shortest first, so days two of them share are named by the shorter. */
export const QUICK_RANGES: QuickRange[] = ['today', 'this-week', 'this-month', 'this-year', 'all-time']

/** The quick range's days, up to today in the viewer's time zone. Weeks start on Monday. */
export function quickRange(range: QuickRange, now: Date = new Date()): Pick<LibraryFilter, 'from' | 'to'> {
  const today = localDay(now)
  switch (range) {
    case 'today':
      return { from: today, to: today }
    case 'this-week': {
      const sinceMonday = (now.getDay() + 6) % 7
      return { from: localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday)), to: today }
    }
    case 'this-month':
      return { from: localDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
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

/** Whether any part of the filter differs from the default, the period included. */
export function differsFromDefault(filter: LibraryFilter, now: Date = new Date()): boolean {
  const byDefault = defaultLibraryFilter(now)
  return (Object.keys(filter) as (keyof LibraryFilter)[]).some((key) =>
    key === 'tags' ? filter.tags.length > 0 : filter[key] !== byDefault[key],
  )
}

/** Whether every part of the filter but the period is the default. */
export function isDefaultBesidesPeriod(filter: LibraryFilter, now: Date = new Date()): boolean {
  return !differsFromDefault({ ...filter, ...quickRange(DEFAULT_PERIOD, now) }, now)
}

/** The filter as the server's query: the viewer's days become instants, `to` exclusive. */
export function libraryFilterQuery(filter: LibraryFilter): URLSearchParams {
  return writeFilter(filter, (day, end) => startOf(day, end === 'to' ? 1 : 0))
}

/**
 * The filter as the Library's address keeps it, so a view switch, a reload
 * or a shared link keeps the same Hands: `?site=pokerstars&tag=t1`. Days stay
 * the viewer's days, unlike the server's query. The default period is left
 * out, so a bare address follows the day it is opened; all time is `period=all`.
 */
export function librarySearch(filter: LibraryFilter, now: Date = new Date()): string {
  const byDefault = quickRange(DEFAULT_PERIOD, now)
  const isDefaultPeriod = filter.from === byDefault.from && filter.to === byDefault.to
  const query = new URLSearchParams()
  if (!filter.from && !filter.to) query.set(ALL_TIME_PARAM.name, ALL_TIME_PARAM.value)
  writeFilter(isDefaultPeriod ? { ...filter, from: null, to: null } : filter, (day) => day).forEach((value, key) =>
    query.append(key, value),
  )
  const search = query.toString()
  return search && `?${search}`
}

/** The filter an address keeps, as `librarySearch` writes it; anything else in it is left out. */
export function libraryFilterFromSearch(search: string, now: Date = new Date()): LibraryFilter {
  const query = new URLSearchParams(search)
  const day = (key: string) => {
    const value = query.get(key)
    return value && isDay(value) ? value : null
  }
  const days = { from: day('from'), to: day('to') }
  const allTime = query.get(ALL_TIME_PARAM.name) === ALL_TIME_PARAM.value
  const period = days.from || days.to || allTime ? days : quickRange(DEFAULT_PERIOD, now)
  return {
    ...period,
    site: query.get('site') || null,
    hero: query.get('hero') || null,
    stake: query.get('stake') || null,
    markedOnly: query.get('marked') === 'true',
    tags: query.getAll('tag').filter(Boolean),
  }
}

/** The filter's parameters, in one order for the server and the address alike; only the days are written differently. */
function writeFilter(filter: LibraryFilter, writeDay: (day: string, end: 'from' | 'to') => string): URLSearchParams {
  const query = new URLSearchParams()
  if (filter.from) query.set('from', writeDay(filter.from, 'from'))
  if (filter.to) query.set('to', writeDay(filter.to, 'to'))
  if (filter.site) query.set('site', filter.site)
  if (filter.hero) query.set('hero', filter.hero)
  if (filter.stake) query.set('stake', filter.stake)
  if (filter.markedOnly) query.set('marked', 'true')
  for (const tag of filter.tags) query.append('tag', tag)
  return query
}

/** Whether the text is a real `YYYY-MM-DD` day. */
function isDay(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const [year, month, date] = text.split('-').map(Number)
  return localDay(new Date(year, month - 1, date)) === text
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
