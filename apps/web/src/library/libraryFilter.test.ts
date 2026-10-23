import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  defaultLibraryFilter,
  EMPTY_LIBRARY_FILTER,
  isFiltering,
  libraryFilterFromSearch,
  libraryFilterQuery,
  librarySearch,
  periodOf,
  quickRange,
  type LibraryFilter,
} from './libraryFilter'

// The viewer's time zone: Madrid is UTC+2 in summer, UTC+1 in winter.
beforeAll(() => {
  vi.stubEnv('TZ', 'Europe/Madrid')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

// A Wednesday afternoon in Madrid.
const now = new Date('2026-10-21T15:30:00+02:00')

describe('quickRange', () => {
  it('is just today for today', () => {
    expect(quickRange('today', now)).toEqual({ from: '2026-10-21', to: '2026-10-21' })
  })

  it('starts this week on Monday, whatever the language', () => {
    expect(quickRange('this-week', now)).toEqual({ from: '2026-10-19', to: '2026-10-21' })
    // A Sunday: the week began in the month before.
    expect(quickRange('this-week', new Date('2026-11-01T12:00:00+01:00'))).toEqual({ from: '2026-10-26', to: '2026-11-01' })
  })

  it('starts this month on its first day, and this year on 1 January', () => {
    expect(quickRange('this-month', now)).toEqual({ from: '2026-10-01', to: '2026-10-21' })
    expect(quickRange('this-year', now)).toEqual({ from: '2026-01-01', to: '2026-10-21' })
  })

  it('leaves all time open at both ends', () => {
    expect(quickRange('all-time', now)).toEqual({ from: null, to: null })
  })
})

describe('periodOf', () => {
  it('names the quick range the dates match, or calls them custom', () => {
    expect(periodOf({ from: null, to: null }, now)).toBe('all-time')
    expect(periodOf({ from: '2026-10-19', to: '2026-10-21' }, now)).toBe('this-week')
    expect(periodOf({ from: '2026-10-14', to: '2026-10-21' }, now)).toBe('custom')
    expect(periodOf({ from: null, to: '2026-10-21' }, now)).toBe('custom')
  })

  it('names the shortest when two quick ranges are the same days', () => {
    const monday = new Date('2026-10-19T10:00:00+02:00')

    expect(periodOf({ from: '2026-10-19', to: '2026-10-19' }, monday)).toBe('today')
  })
})

describe('libraryFilterQuery', () => {
  it('turns the viewer’s days into instants, the last day included', () => {
    const query = libraryFilterQuery({ ...EMPTY_LIBRARY_FILTER, from: '2026-10-15', to: '2026-10-25' })

    expect(query.get('from')).toBe('2026-10-14T22:00:00.000Z')
    // The next local midnight, after the clocks went back on the 25th.
    expect(query.get('to')).toBe('2026-10-25T23:00:00.000Z')
  })

  it('writes each chosen value, and nothing for what is left open', () => {
    const query = libraryFilterQuery({
      ...EMPTY_LIBRARY_FILTER,
      site: 'pokerstars',
      hero: 'iMapleAA',
      stake: 'no-limit:5:10:EUR',
      markedOnly: true,
    })

    expect(query.toString()).toBe('site=pokerstars&hero=iMapleAA&stake=no-limit%3A5%3A10%3AEUR&marked=true')
    expect(libraryFilterQuery(EMPTY_LIBRARY_FILTER).toString()).toBe('')
  })

  it('writes every chosen Tag, any of which keeps a Hand', () => {
    const query = libraryFilterQuery({ ...EMPTY_LIBRARY_FILTER, tags: ['t1', 't2'] })

    expect(query.toString()).toBe('tag=t1&tag=t2')
  })
})

describe('isFiltering', () => {
  it('is false for the default, today and nothing else', () => {
    expect(defaultLibraryFilter(now)).toEqual({ ...EMPTY_LIBRARY_FILTER, from: '2026-10-21', to: '2026-10-21' })
    expect(isFiltering(defaultLibraryFilter(now), now)).toBe(false)
  })

  it('is true once any part narrows the Library otherwise, all time included', () => {
    const today = defaultLibraryFilter(now)

    expect(isFiltering(EMPTY_LIBRARY_FILTER, now)).toBe(true)
    expect(isFiltering({ ...today, from: '2026-10-19' }, now)).toBe(true)
    expect(isFiltering({ ...today, markedOnly: true }, now)).toBe(true)
    expect(isFiltering({ ...today, tags: [] }, now)).toBe(false)
    expect(isFiltering({ ...today, tags: ['t1'] }, now)).toBe(true)
  })
})

describe('the filter in the address', () => {
  const everything: LibraryFilter = {
    from: '2026-10-15',
    to: '2026-10-21',
    site: 'pokerstars',
    hero: 'iMapleAA',
    stake: 'no-limit:5:10:EUR',
    markedOnly: true,
    tags: ['t1', 't2'],
  }

  it('writes the viewer’s days as they are, and reads back the same filter', () => {
    const search = librarySearch(everything, now)

    expect(search).toBe('?from=2026-10-15&to=2026-10-21&site=pokerstars&hero=iMapleAA&stake=no-limit%3A5%3A10%3AEUR&marked=true&tag=t1&tag=t2')
    expect(libraryFilterFromSearch(search, now)).toEqual(everything)
  })

  it('leaves the address bare for the default, and a bare address is whatever day it is now', () => {
    expect(librarySearch(defaultLibraryFilter(now), now)).toBe('')
    expect(libraryFilterFromSearch('', new Date('2026-10-22T09:00:00+02:00'))).toEqual(
      defaultLibraryFilter(new Date('2026-10-22T09:00:00+02:00')),
    )
  })

  it('says all time out loud, since a bare address is today', () => {
    expect(librarySearch(EMPTY_LIBRARY_FILTER, now)).toBe('?period=all')
    expect(libraryFilterFromSearch('?period=all', now)).toEqual(EMPTY_LIBRARY_FILTER)
  })

  it('ignores what isn’t a filter, and days that aren’t days', () => {
    expect(libraryFilterFromSearch('?page=3&from=yesterday&to=2026-13-01&marked=yes&site=', now)).toEqual(defaultLibraryFilter(now))
  })
})
