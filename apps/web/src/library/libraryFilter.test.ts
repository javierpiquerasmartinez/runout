import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { EMPTY_LIBRARY_FILTER, isFiltering, libraryFilterQuery, periodOf, quickRange } from './libraryFilter'

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
  it('counts today among the last 7 and 30 days', () => {
    expect(quickRange('last-7-days', now)).toEqual({ from: '2026-10-15', to: '2026-10-21' })
    expect(quickRange('last-30-days', now)).toEqual({ from: '2026-09-22', to: '2026-10-21' })
  })

  it('starts this year on 1 January', () => {
    expect(quickRange('this-year', now)).toEqual({ from: '2026-01-01', to: '2026-10-21' })
  })

  it('leaves all time open at both ends', () => {
    expect(quickRange('all-time', now)).toEqual({ from: null, to: null })
  })
})

describe('periodOf', () => {
  it('names the quick range the dates match, or calls them custom', () => {
    expect(periodOf({ from: null, to: null }, now)).toBe('all-time')
    expect(periodOf({ from: '2026-10-15', to: '2026-10-21' }, now)).toBe('last-7-days')
    expect(periodOf({ from: '2026-10-14', to: '2026-10-21' }, now)).toBe('custom')
    expect(periodOf({ from: null, to: '2026-10-21' }, now)).toBe('custom')
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
})

describe('isFiltering', () => {
  it('is true once any part narrows the Library', () => {
    expect(isFiltering(EMPTY_LIBRARY_FILTER)).toBe(false)
    expect(isFiltering({ ...EMPTY_LIBRARY_FILTER, to: '2026-10-21' })).toBe(true)
    expect(isFiltering({ ...EMPTY_LIBRARY_FILTER, markedOnly: true })).toBe(true)
  })
})
