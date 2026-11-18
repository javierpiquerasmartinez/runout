import { describe, expect, it } from 'vitest'
import { EMPTY_LIBRARY_FILTER, type LibraryFilter } from './libraryFilter'
import { applySavedFilter, droppedCriteria, restoreSavedFilter, savedCriteriaOf, savedFilterState, type SavedFilter } from './savedFilters'

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

  it('is applied while the filter names it, and modified once its criteria differ from the saved ones', () => {
    const applied = applySavedFilter(rest, threeBet)

    expect(savedFilterState(applied, [threeBet])).toEqual({ saved: threeBet, modified: false })
    expect(savedFilterState({ ...applied, sites: [] }, [threeBet])).toEqual({ saved: threeBet, modified: false })
    expect(savedFilterState({ ...applied, facts: applied.facts.slice(1) }, [threeBet])).toEqual({ saved: threeBet, modified: true })
    expect(savedFilterState({ ...applied, stat: { key: 'vpip', side: 'taken' } }, [threeBet])).toEqual({ saved: threeBet, modified: true })
    expect(savedFilterState(applied, [])).toBeNull()
    expect(savedFilterState(rest, [threeBet])).toBeNull()
  })

  it('is unchanged again once a change is undone by hand, whatever the order the criteria come back in', () => {
    const applied = applySavedFilter(rest, threeBet)
    const undone = { ...applied, facts: [applied.facts[1], applied.facts[0]] }

    expect(savedFilterState(undone, [threeBet])).toEqual({ saved: threeBet, modified: false })
  })

  it('discarding the changes goes back to the saved criteria and keeps it applied', () => {
    const changed: LibraryFilter = { ...applySavedFilter(rest, threeBet), facts: [], stat: { key: 'pfr', side: 'taken' } }

    expect(restoreSavedFilter(changed, threeBet)).toEqual(applySavedFilter(rest, threeBet))
  })

  it('counts the criteria dropped when it was read, by the server or by the Library', () => {
    expect(droppedCriteria(threeBet)).toBe(0)
    expect(droppedCriteria({ ...threeBet, dropped: 2 })).toBe(2)
    expect(droppedCriteria({ ...threeBet, criteria: { facts: ['pot-type:3-bet', 'no-such-fact:x'], stat: 'nope:taken' } })).toBe(2)
  })
})
