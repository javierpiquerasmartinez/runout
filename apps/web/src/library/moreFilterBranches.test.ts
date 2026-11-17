import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator'
import type { FactCriterion } from './facts'
import { branchCounts, chipSummary, criterionSummaries, inapplicableReason } from './moreFilterBranches'

const { t } = createTranslator('es')
const en = createTranslator('en').t

const potType = (values: string[], exclude = false): FactCriterion => ({ fact: 'pot-type', exclude, values })

describe('criterionSummaries', () => {
  it('lists the criteria in branch order, whatever order they were set in, with the abbreviations players use', () => {
    const criteria: FactCriterion[] = [
      { fact: 'players', exclude: false, range: { min: 3, max: 6 } },
      { fact: 'hero-position', exclude: false, values: ['BTN', 'CO'] },
      potType(['3-bet', 'single-raised']),
    ]

    expect(criterionSummaries(criteria, t)).toEqual(['Bote 3-bet, SRP', '3–6 jugadores', 'Hero BTN, CO'])
    expect(criterionSummaries(criteria, en)).toEqual(['3-bet, SRP pot', '3–6 players', 'Hero BTN, CO'])
  })

  it('says an exclusion, and a range open at one end', () => {
    expect(
      criterionSummaries(
        [potType(['walk'], true), { fact: 'players', exclude: false, range: { min: null, max: 4 } }],
        en,
      ),
    ).toEqual(['Not walk pot', '≤4 players'])
    expect(criterionSummaries([{ fact: 'players', exclude: false, range: { min: 6, max: null } }], t)).toEqual(['6+ jugadores'])
  })
})

describe('criterionSummaries on a Street', () => {
  it('names the Street, then the criterion, an exclusion and a yes-or-no fact’s No included', () => {
    const criteria: FactCriterion[] = [
      { fact: 'river-overcard', exclude: false, values: ['false'] },
      { fact: 'flop-connectedness', exclude: false, range: { min: 3, max: null } },
      { fact: 'turn-suits', exclude: true, values: ['flush-possible'] },
      { fact: 'flop-high-card', exclude: false, values: ['A', 'K'] },
    ]

    expect(criterionSummaries(criteria, t)).toEqual([
      'Flop: conexión 3+',
      'Flop: carta alta A, K',
      'Turn: Excepto color posible',
      'River: sin sobrecarta',
    ])
  })
})

describe('chipSummary', () => {
  it('keeps what fits and counts the rest as +N', () => {
    expect(chipSummary(['Bote 3-bet', 'Hero BB'], 40)).toEqual({ text: 'Bote 3-bet · Hero BB', more: 0 })
    expect(chipSummary(['Bote 3-bet', 'Hero BB', 'Abre BTN, CO', '3–6 jugadores'], 30)).toEqual({ text: 'Bote 3-bet · Hero BB', more: 2 })
  })

  it('always shows the first, however long', () => {
    expect(chipSummary(['Hero UTG, UTG+1, MP, LJ, HJ, CO, BTN', 'Bote 3-bet'], 10)).toEqual({
      text: 'Hero UTG, UTG+1, MP, LJ, HJ, CO, BTN',
      more: 1,
    })
  })
})

describe('branchCounts', () => {
  it('counts each branch’s criteria', () => {
    const counts = branchCounts([potType(['3-bet']), { fact: 'hero-position', exclude: true, values: ['BB'] }])

    expect(counts.table).toBe(2)
    expect(counts.flop).toBe(0)
  })
})

describe('inapplicableReason', () => {
  it('explains a Position the pot types picked never have', () => {
    const threeBettor: FactCriterion = { fact: 'three-bettor-position', exclude: false, values: ['SB'] }

    expect(inapplicableReason(threeBettor, [potType(['single-raised', 'limped']), threeBettor])).toBe(
      'library.moreFilters.inapplicable.three-bettor-position',
    )
    expect(inapplicableReason(threeBettor, [potType(['single-raised', '3-bet']), threeBettor])).toBeNull()
    // An exclusion keeps the Hands with nobody in that seat, so it still keeps some.
    expect(inapplicableReason({ ...threeBettor, exclude: true }, [potType(['limped'])])).toBeNull()
    expect(inapplicableReason(threeBettor, [potType(['limped'], true), threeBettor])).toBeNull()
  })

  it('explains an opener or an aggressor in a walk or a limped pot', () => {
    const opener: FactCriterion = { fact: 'opener-position', exclude: false, values: ['BTN'] }

    expect(inapplicableReason(opener, [potType(['walk', 'limped']), opener])).toBe('library.moreFilters.inapplicable.opener-position')
    expect(inapplicableReason(opener, [opener])).toBeNull()
  })
})

describe('criterionSummaries on preflop', () => {
  it('names a named Action by what the Hero did with it, and the answer to one faced', () => {
    const criteria: FactCriterion[] = [
      { fact: 'three-bet-answer', exclude: false, values: ['fold'] },
      { fact: 'steal-did', exclude: false, values: ['true'] },
      { fact: 'squeeze-chance', exclude: true, values: ['true'] },
      { fact: 'four-bet-faced', exclude: false, values: ['true'] },
    ]

    expect(criterionSummaries(criteria, t)).toEqual([
      'Hice steal',
      'Me enfrenté a un 3-bet → fold',
      'Excepto Pude hacer squeeze',
      'Me enfrenté a un 4-bet',
    ])
    expect(criterionSummaries(criteria, en)).toEqual(['Steal made', 'Faced a 3-bet → fold', 'Not Squeeze chance', 'Faced a 4-bet'])
  })

  it('reads sizes and stacks with their unit, and the role and the line as players say them', () => {
    const criteria: FactCriterion[] = [
      { fact: 'starting-stack', exclude: false, range: { min: 20, max: 40.5 } },
      { fact: 'three-bet-size', exclude: false, range: { min: null, max: 3.5 } },
      { fact: 'open-size', exclude: false, range: { min: 2, max: 3 } },
      { fact: 'preflop-line', exclude: false, values: ['RC', 'RF'] },
      { fact: 'preflop-role', exclude: false, values: ['called-3-bet'] },
      { fact: 'straddle', exclude: false, values: ['false'] },
    ]

    expect(criterionSummaries(criteria, en)).toEqual([
      'Role: called a 3-bet',
      'Preflop line RC, RF',
      'Open 2–3 bb',
      '3-bet ≤3.5×',
      'Stack 20–40.5 bb',
      'No straddle',
    ])
  })
})

describe('branchCounts on preflop', () => {
  it('counts a named Action’s did, chance, faced and answer in the Preflop branch', () => {
    const counts = branchCounts([
      { fact: 'vpip-did', exclude: false, values: ['true'] },
      { fact: 'resteal-answer', exclude: false, values: ['call'] },
      { fact: 'hero-aggressor', exclude: false, values: ['true'] },
    ])

    expect(counts.preflop).toBe(3)
  })
})
