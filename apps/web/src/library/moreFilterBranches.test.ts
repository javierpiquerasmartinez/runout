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

describe('the Cards branch', () => {
  const heroClass = (values: string[], exclude = false): FactCriterion => ({ fact: 'hero-class', exclude, values })

  it('sums up a hole-card pick compactly, a suited and offsuit pair of a kind as one, and counts the rest as Hand Classes', () => {
    expect(criterionSummaries([heroClass(['AKs', 'AKo'])], t)).toEqual(['AK'])
    expect(criterionSummaries([heroClass(['AA', 'KK', 'QQ', 'AKs'])], t)).toEqual(['QQ+, AKs'])
    expect(criterionSummaries([heroClass(['AKs', 'AKo', 'AA', 'KK', 'QQ', 'T9s', '98s', '76o'])], t)).toEqual([
      'QQ+, AK +3 clases',
    ])
    expect(criterionSummaries([heroClass(['AA', 'AKs', 'T9s', '72o'], true)], en)).toEqual(['Not AA, AKs +2 classes'])
    expect(criterionSummaries([heroClass(['AA', 'AKs', 'T9s'])], en)).toEqual(['AA, AKs +1 class'])
  })

  it('names Made Hands and Draws as the Lab does, and the nuts, the kicker and the nut flush draw, Street by Street', () => {
    const criteria: FactCriterion[] = [
      { fact: 'turn-nut-flush-draw', exclude: false, values: ['true'] },
      { fact: 'flop-made-hand', exclude: false, values: ['top-pair', 'overpair'] },
      { fact: 'flop-kicker', exclude: false, values: ['top'] },
      { fact: 'flop-draw', exclude: false, values: ['flush-draw', 'flush-draw-gutshot'] },
      { fact: 'river-nuts', exclude: false, values: ['false'] },
    ]

    expect(criterionSummaries(criteria, en)).toEqual([
      'Flop: Top pair, Overpair',
      'Flop: top kicker',
      'Flop: Flush draw, Flush draw + gutshot',
      'Turn: nut flush draw',
      'River: not the nuts',
    ])
  })

  it('counts its criteria in the Cards branch, not the Street’s', () => {
    const counts = branchCounts([heroClass(['AA']), { fact: 'flop-nuts', exclude: false, values: ['true'] }])

    expect(counts.cards).toBe(2)
    expect(counts.flop).toBe(0)
  })
})

describe('criterionSummaries on the Result', () => {
  it('says how the Hand ended, the amounts in big blinds, after every other branch', () => {
    const criteria: FactCriterion[] = [
      { fact: 'result', exclude: false, range: { min: null, max: -20.5 } },
      { fact: 'won-at-showdown', exclude: false, values: ['false'] },
      { fact: 'faced-all-in-answer', exclude: false, values: ['call'] },
      { fact: 'hero-folded-on', exclude: true, values: ['turn', 'river'] },
      { fact: 'all-in-ev', exclude: false, range: { min: -3, max: 12.25 } },
      potType(['3-bet']),
    ]

    expect(criterionSummaries(criteria, en)).toEqual([
      '3-bet pot',
      'Not Folded on turn, river',
      'Answered an all-in with call',
      'Didn’t win at Showdown',
      'Result ≤-20.5 bb',
      'All-in EV -3–12.25 bb',
    ])
    expect(criterionSummaries([{ fact: 'reached-showdown', exclude: false, values: ['true'] }], t)).toEqual(['Llegué a showdown'])
    expect(branchCounts(criteria).result).toBe(5)
  })
})
