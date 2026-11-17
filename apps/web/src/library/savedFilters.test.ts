import { describe, expect, it } from 'vitest'
import { EMPTY_LIBRARY_FILTER, type LibraryFilter } from './libraryFilter'
import { applySavedFilter, appliedSavedFilter, savedCriteriaOf, type SavedFilter } from './savedFilters'

const threeBet: SavedFilter = {
  id: 'sf1',
  name: '3-bet OOP como caller',
  criteria: { facts: ['pot-type:3-bet', '!hero-position:BTN,CO'], stat: null },
  dropped: 0,
}

const rest: LibraryFilter = {
  ...EMPTY_LIBRARY_FILTER,
  from: '2026-10-01',
  to: '2026-10-21',
  sites: ['pokerstars'],
  heroes: ['iMapleAA'],
  stakes: ['no-limit:5:10:EUR'],
  markedOnly: true,
  tags: ['t1'],
}

describe('Saved Filters', () => {
  it('saves the Más filtros criteria and the Stat criterion, as the address writes them', () => {
    expect(
      savedCriteriaOf({
        ...rest,
        stat: { key: 'vpip', side: 'taken' },
        facts: [
          { fact: 'pot-type', exclude: false, values: ['3-bet', '4-bet'] },
          { fact: 'players', exclude: false, range: { min: null, max: 4 } },
        ],
      }),
    ).toEqual({ facts: ['pot-type:3-bet,4-bet', 'players:..4'], stat: 'vpip:taken' })
  })

  it('applying one replaces the Más filtros criteria and keeps the rest of the filter', () => {
    const before: LibraryFilter = {
      ...rest,
      stat: { key: 'pfr', side: 'opportunity' },
      facts: [{ fact: 'players', exclude: false, range: { min: 3, max: null } }],
    }

    expect(applySavedFilter(before, threeBet)).toEqual({
      ...rest,
      stat: null,
      facts: [
        { fact: 'pot-type', exclude: false, values: ['3-bet'] },
        { fact: 'hero-position', exclude: true, values: ['BTN', 'CO'] },
      ],
      saved: 'sf1',
    })
  })

  it('applying the one applied drops it, and its criteria with it', () => {
    expect(applySavedFilter(applySavedFilter(rest, threeBet), threeBet)).toEqual(rest)
  })

  it('is the applied one while the filter holds its criteria unchanged', () => {
    const applied = applySavedFilter(rest, threeBet)

    expect(appliedSavedFilter(applied, [threeBet])).toBe(threeBet)
    expect(appliedSavedFilter({ ...applied, sites: [] }, [threeBet])).toBe(threeBet)
    expect(appliedSavedFilter({ ...applied, facts: applied.facts.slice(1) }, [threeBet])).toBeNull()
    expect(appliedSavedFilter(applied, [])).toBeNull()
    expect(appliedSavedFilter(rest, [threeBet])).toBeNull()
  })
})
