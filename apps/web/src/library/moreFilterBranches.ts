import type { MessageKey } from '../i18n/catalogue'
import type { Translator } from '../i18n/translator'
import { POT_TYPES, POSITIONS, type FactCriterion, type FactKey, type PotType } from './facts'

/*
 * What the Más filtros panel offers, branch by branch, as the "Biblioteca ·
 * Más filtros" board draws it. Each branch is a list of criteria, and each
 * criterion says which fact it narrows, under which heading, with which
 * control, and how it reads in the chip. A branch's ticket fills its list
 * here; the panel, the chip and the address need nothing else.
 */

/** The panel's branches, in the order the rail and the chip's summary follow. */
export const BRANCHES = ['table', 'preflop', 'flop', 'turn', 'river', 'cards', 'board', 'result', 'stat'] as const

export type Branch = (typeof BRANCHES)[number]

/**
 * How a criterion is set:
 * - `options`: one button per value, any number of them pressed, any of which keeps a Hand;
 * - `range`: a from and a to, both included, either left open.
 */
export type CriterionControl =
  | { kind: 'options'; values: readonly string[]; label: (value: string, t: Translator['t']) => string }
  | { kind: 'range'; min: number; max: number }

export interface CriterionDefinition {
  fact: FactKey
  /** The heading it sits under in its branch; criteria sharing one are grouped under it, in this order. */
  section: Section
  control: CriterionControl
  /**
   * Why the criterion keeps no Hand alongside the others, as a message, or
   * null when it may keep some: a turn criterion in a walk, a 3-bettor in a
   * single-raised pot. The panel says it rather than leave the list empty.
   */
  inapplicable?: (criterion: FactCriterion, criteria: FactCriterion[]) => MessageKey | null
}

/** The headings a branch's criteria sit under. Its label is `library.moreFilters.section.<section>`. */
export type Section = 'pot' | 'positions'

/** A Position reads as players write it, in every language. */
const asWritten = (value: string) => value

const potTypeLabel = (value: string, t: Translator['t']) => t(`library.moreFilters.value.pot-type.${value as PotType}`)

/**
 * A Position criterion keeps no Hand when every pot type it is required in
 * has nobody in that seat: no opener in a walk or a limped pot, no 3-bettor
 * below a 3-bet pot. An excluded one keeps the Hands where the seat is empty.
 */
function needsPot(fewest: PotType) {
  return (criterion: FactCriterion, criteria: FactCriterion[]): MessageKey | null => {
    if (criterion.exclude) return null
    const potTypes = criteria.find((other) => other.fact === 'pot-type' && !other.exclude)
    if (!potTypes || !('values' in potTypes)) return null
    const enough = potTypes.values.some((value) => POT_TYPES.indexOf(value as PotType) >= POT_TYPES.indexOf(fewest))
    return enough ? null : `library.moreFilters.inapplicable.${criterion.fact as PositionFact}`
  }
}

type PositionFact = 'opener-position' | 'three-bettor-position' | 'four-bettor-position' | 'aggressor-position'

const position = (fact: FactKey, inapplicable?: CriterionDefinition['inapplicable']): CriterionDefinition => ({
  fact,
  section: 'positions',
  control: { kind: 'options', values: POSITIONS, label: asWritten },
  inapplicable,
})

/** Each branch's criteria, in the order the panel lists them and the chip names them. */
export const BRANCH_CRITERIA: Record<Branch, CriterionDefinition[]> = {
  table: [
    { fact: 'pot-type', section: 'pot', control: { kind: 'options', values: POT_TYPES, label: potTypeLabel } },
    { fact: 'players', section: 'pot', control: { kind: 'range', min: 2, max: 10 } },
    position('hero-position'),
    position('opener-position', needsPot('single-raised')),
    position('three-bettor-position', needsPot('3-bet')),
    position('four-bettor-position', needsPot('4-bet')),
    position('aggressor-position', needsPot('single-raised')),
  ],
  preflop: [],
  flop: [],
  turn: [],
  river: [],
  cards: [],
  board: [],
  result: [],
  stat: [],
}

/** Every criterion the panel offers, in branch order, with its branch. */
const ORDERED = BRANCHES.flatMap((branch) => BRANCH_CRITERIA[branch].map((definition) => ({ branch, definition })))

/** The panel's definition of a fact, and its branch. */
export function definitionOf(fact: FactKey): { branch: Branch; definition: CriterionDefinition } | undefined {
  return ORDERED.find(({ definition }) => definition.fact === fact)
}

/** The criteria in branch order, those the panel doesn't offer left out. */
export function inBranchOrder(criteria: FactCriterion[]): FactCriterion[] {
  return ORDERED.flatMap(({ definition }) => criteria.filter((criterion) => criterion.fact === definition.fact))
}

/** How many criteria each branch holds, for its rail. */
export function branchCounts(criteria: FactCriterion[]): Record<Branch, number> {
  const counts = Object.fromEntries(BRANCHES.map((branch) => [branch, 0])) as Record<Branch, number>
  for (const criterion of criteria) {
    const found = definitionOf(criterion.fact)
    if (found) counts[found.branch] += 1
  }
  return counts
}

/** What a criterion's values read as: `BTN, CO`, `3-bet, SRP`, `3–6`, `6+`, `≤4`. */
export function valuesSummary(criterion: FactCriterion, t: Translator['t']): string {
  if ('range' in criterion) {
    const { min, max } = criterion.range
    if (min !== null && max !== null) return min === max ? String(min) : `${min}–${max}`
    return min !== null ? `${min}+` : `≤${max}`
  }
  const control = definitionOf(criterion.fact)?.definition.control
  const label = control?.kind === 'options' ? control.label : asWritten
  return criterion.values.map((value) => label(value, t)).join(', ')
}

/** One line per criterion, in branch order, as the chip and its list name them: `Bote 3-bet`, `Excepto Hero BB`. */
export function criterionSummaries(criteria: FactCriterion[], t: Translator['t']): string[] {
  return inBranchOrder(criteria).map((criterion) => {
    const summary = t(`library.moreFilters.summary.${criterion.fact}`, { values: valuesSummary(criterion, t) })
    return criterion.exclude ? t('library.moreFilters.summary.excluded', { criterion: summary }) : summary
  })
}

/**
 * The chip's summary: as many lines as fit in `budget` characters, joined
 * with " · ", and how many are left for "+N". The first is always shown;
 * the chip cuts it if it is still too long.
 */
export function chipSummary(summaries: string[], budget: number): { text: string; more: number } {
  let shown = 0
  let length = 0
  for (const summary of summaries) {
    const next = length + (shown > 0 ? 3 : 0) + summary.length
    if (shown > 0 && next > budget) break
    shown += 1
    length = next
  }
  return { text: summaries.slice(0, shown).join(' · '), more: summaries.length - shown }
}

/** Why a criterion keeps no Hand alongside the others, or null when it may keep some. */
export function inapplicableReason(criterion: FactCriterion, criteria: FactCriterion[]): MessageKey | null {
  return definitionOf(criterion.fact)?.definition.inapplicable?.(criterion, criteria) ?? null
}
