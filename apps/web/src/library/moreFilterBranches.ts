import type { MessageKey } from '../i18n/catalogue'
import type { Translator } from '../i18n/translator'
import { categoryNameKey, MADE_HANDS, type Category } from '../lab/board'
import { EMPTY_RANGE, formatRange, HAND_CLASS_BY_NAME, HAND_CLASSES, handClassFrequency, parseRange, withHandClass } from '../lab/range'
import {
  ANSWERS,
  BOARD_PAIRINGS,
  BOARD_RANKS,
  FACED_PREFLOP_ACTIONS,
  FACTS,
  FLOP_SUITS,
  HAND_STREETS,
  KICKERS,
  LATER_SUITS,
  POT_TYPES,
  POSITIONS,
  PREFLOP_ACTIONS,
  PREFLOP_FACED_FIRST,
  PREFLOP_ROLES,
  STREET_ACTIONS,
  STREET_LINE,
  STREET_DRAWS,
  type FactCriterion,
  type FactKey,
  type PotType,
  type PreflopAction,
  type StreetAction,
} from './facts'
import type { StatCriterion } from './libraryFilter'
import { STAT_TILES } from './stats'

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

/** A range's ends, both included, either left open. */
export type Range = { min: number | null; max: number | null }

/** A range offered as one button, such as "Multiway" for 3 players or more, which reads as `summary`'s message. */
export type RangePreset = { label: MessageKey; summary: MessageKey; range: Range }

/** What a range's numbers count, said after its fields: `bb`, `% del bote`, `×`. */
export type Unit = 'bb' | 'pot' | 'times'

/**
 * How a criterion is set:
 * - `options`: one button per value, any number of them pressed, any of which keeps a Hand;
 * - `boolean`: "Sí" or "No", or its `labels`, one of them at most, for a fact that holds or doesn't;
 * - `range`: a from and a to, both included, either left open, whole or to `decimals` places, negative too when `signed`,
 *   in `unit`, with `presets` as buttons that fill both, one at a time;
 * - `hand-classes`: the Lab's 13×13 matrix, any number of Hand Classes picked, any of which keeps a Hand;
 * - `line`: the common lines as options, and any other typed, any of which keeps a Hand;
 * - `action`: a named Action, see `namedAction`.
 */
export type CriterionControl =
  | { kind: 'options'; values: readonly string[]; label: (value: string, t: Translator['t']) => string }
  | { kind: 'boolean'; labels?: { true: MessageKey; false: MessageKey } }
  | { kind: 'hand-classes' }
  /** With `signed`, its ends may be negative, and have any decimals unless `decimals` says. */
  | {
      kind: 'range'
      min: number
      max: number
      signed?: boolean
      decimals?: number
      unit?: Unit
      presets?: readonly RangePreset[]
    }
  | { kind: 'line'; common: readonly string[]; pattern: RegExp }
  | { kind: 'action'; action: ActionName; faced: boolean }

/** The Streets after the flop is dealt, in order. */
export const STREETS = ['flop', 'turn', 'river'] as const

export type Street = (typeof STREETS)[number]

/**
 * A fact about one Street is its own fact, named `<street>-<name>`
 * (`turn-suits`), so a Hand can be asked for it Street by Street. Its row is
 * labelled by the name alone, `library.moreFilters.fact.<name>`, as the
 * Street is already said by its section or branch; its summary is
 * `library.moreFilters.summary.<name>`, after the Street ("Turn: …").
 */
type NameOnStreet<F> = F extends `${Street}-${infer Name}` ? Name : never

/** A named Action's facts, whose row and summary are the Action's (`namedAction`), not their own. */
type ActionFactKey = Extract<FactKey, `${string}-${'did' | 'chance' | 'faced' | 'answer'}`>

/** The name a fact's row and summary go by: the fact's own, or without its Street. */
export type FactName = Exclude<FactKey, `${Street}-${string}` | ActionFactKey> | NameOnStreet<Exclude<FactKey, ActionFactKey>>

/** A yes-or-no fact's name, whose "No" summary is `library.moreFilters.summary.<name>.no`. */
type BooleanName = {
  [F in Exclude<FactKey, ActionFactKey>]: (typeof FACTS)[F]['kind'] extends 'boolean' ? (F extends `${Street}-${infer Name}` ? Name : F) : never
}[Exclude<FactKey, ActionFactKey>]

/** The Street a fact is about, or null when it is about the whole Hand. */
export function streetOf(fact: FactKey): Street | null {
  return STREETS.find((street) => fact.startsWith(`${street}-`)) ?? null
}

/** The name a fact's row and summary go by: `suits` for `turn-suits`, `pot-type` for itself. */
export function factName(fact: FactKey): FactName {
  const street = streetOf(fact)
  return (street ? fact.slice(street.length + 1) : fact) as FactName
}

/**
 * The same criterion on each of `streets`, each on its own `<street>-<name>`
 * fact and under its Street's heading: Flop, Turn, River. `define` says the
 * rest, Street by Street (the flop's suits take other values).
 */
export function perStreet(
  streets: readonly Street[],
  name: NameOnStreet<FactKey>,
  define: (street: Street) => Omit<CriterionDefinition, 'fact' | 'section'>,
): CriterionDefinition[] {
  return streets.map((street) => {
    const fact = `${street}-${name}`
    if (!Object.hasOwn(FACTS, fact)) throw new Error(`No fact ${fact}`)
    return { ...define(street), fact: fact as FactKey, section: street }
  })
}

export interface CriterionDefinition {
  fact: FactKey
  /**
   * The other facts the same row sets, one at a time instead of `fact`: a
   * named Action's chance, faced and answer besides its did. The row holds
   * one criterion on any of them.
   */
  also?: FactKey[]
  /** The heading it sits under in its branch; criteria sharing one are grouped under it, in this order. */
  section: Section
  control: CriterionControl
  /** Its row's label and summary name, when not `library.moreFilters.fact.<name>`: a Street's players are just "Jugadores". */
  label?: MessageKey
  /**
   * Why the criterion keeps no Hand alongside the others, as a message, or
   * null when it may keep some: a turn criterion in a walk, a 3-bettor in a
   * single-raised pot. The panel says it rather than leave the list empty.
   */
  inapplicable?: (criterion: FactCriterion, criteria: FactCriterion[]) => MessageKey | null
}

/** The headings a branch's criteria sit under. Its label is `library.moreFilters.section.<section>`. */
export type Section = 'pot' | 'positions' | PreflopSection | 'hole-cards' | Street | `situation-${Street}` | ResultSection

/** Every fact a row sets: its own, and the others it may set instead. */
export function rowFacts(definition: CriterionDefinition): FactKey[] {
  return [definition.fact, ...(definition.also ?? [])]
}

/** A Position reads as players write it, in every language. */
const asWritten = (value: string) => value

const potTypeLabel = (value: string, t: Translator['t']) => t(`library.moreFilters.value.pot-type.${value as PotType}`)

type BoardSuits = (typeof FLOP_SUITS)[number] | (typeof LATER_SUITS)[number]
type BoardPairing = (typeof BOARD_PAIRINGS)[number]

const suitsLabel = (value: string, t: Translator['t']) => t(`library.moreFilters.value.suits.${value as BoardSuits}`)
const pairingLabel = (value: string, t: Translator['t']) => t(`library.moreFilters.value.pairing.${value as BoardPairing}`)

const yesOrNo: CriterionControl = { kind: 'boolean' }

/**
 * The Board branch: the Board's texture on each Street (facts catalogue
 * §3.5), then what the turn or the river card changed, Street by Street.
 */
function boardOn(street: Street): CriterionDefinition[] {
  const on = (name: NameOnStreet<FactKey>, control: CriterionControl) => perStreet([street], name, () => ({ control }))
  return [
    ...on('suits', { kind: 'options', values: street === 'flop' ? FLOP_SUITS : LATER_SUITS, label: suitsLabel }),
    ...on('pairing', { kind: 'options', values: BOARD_PAIRINGS, label: pairingLabel }),
    ...on('straight-possible', yesOrNo),
    ...on('connectedness', { kind: 'range', min: 1, max: 5 }),
    ...on('high-card', { kind: 'options', values: BOARD_RANKS, label: asWritten }),
    ...(street === 'flop'
      ? []
      : [...on('pairs-board', yesOrNo), ...on('brings-flush', yesOrNo), ...on('brings-straight', yesOrNo), ...on('overcard', yesOrNo)]),
  ]
}

/*
 * The Cards branch: the Hero's hole cards on the Lab's matrix, then Street
 * by Street (facts catalogue §3.4) the Made Hand and the Draws in the Lab's
 * Categories, named and ordered as its tables have them, the kicker, the
 * nuts and the nut flush draw. The river has no Draws.
 */

/** A Made Hand or a Draw, as the Lab's tables name it. */
const categoryLabel = (value: string, t: Translator['t']) => t(categoryNameKey(value as Category))

const kickerLabel = (value: string, t: Translator['t']) => t(`library.moreFilters.value.kicker.${value as (typeof KICKERS)[number]}`)

function cardsOn(street: Street): CriterionDefinition[] {
  const on = (name: NameOnStreet<FactKey>, control: CriterionControl) => perStreet([street], name, () => ({ control }))
  return [
    ...on('made-hand', { kind: 'options', values: MADE_HANDS, label: categoryLabel }),
    ...on('kicker', { kind: 'options', values: KICKERS, label: kickerLabel }),
    ...on('nuts', yesOrNo),
    ...(street === 'river'
      ? []
      : [...on('draw', { kind: 'options', values: STREET_DRAWS, label: categoryLabel }), ...on('nut-flush-draw', yesOrNo)]),
  ]
}

/** How many of the chip's pieces a hole-card pick shows before it counts the rest's Hand Classes. */
const HOLE_CARD_PIECES = 2

/**
 * A hole-card pick as the Lab writes a Range, shortened for the chip: runs
 * as `QQ+`, a suited and an offsuit piece of the same cards as one (`AK`),
 * and past the first pieces the Hand Classes left, `QQ+, AK +3 clases`.
 */
function holeCardsSummary(names: readonly string[], t: Translator['t']): string {
  const range = names.reduce((picked, name) => {
    const handClass = HAND_CLASS_BY_NAME.get(name)
    return handClass ? withHandClass(picked, handClass, 100) : picked
  }, EMPTY_RANGE)
  // No rank is written with an `s` or an `o`: they only ever say suited or offsuit.
  const pieces = formatRange(range).split(',')
  const merged = pieces.flatMap((piece) => {
    if (piece.includes('o') && pieces.includes(piece.replaceAll('o', 's'))) return []
    if (piece.includes('s') && pieces.includes(piece.replaceAll('s', 'o'))) return [piece.replaceAll('s', '')]
    return [piece]
  })
  if (merged.length <= HOLE_CARD_PIECES) return merged.join(', ')
  const shown = merged.slice(0, HOLE_CARD_PIECES)
  const parsed = parseRange(shown.join(','))
  const covered = 'range' in parsed ? HAND_CLASSES.filter((handClass) => handClassFrequency(parsed.range, handClass).value > 0).length : 0
  const left = names.length - covered
  return `${shown.join(', ')} ${t(left === 1 ? 'library.moreFilters.value.hero-class.more.one' : 'library.moreFilters.value.hero-class.more.other', { count: left })}`
}

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

/** The Resultado branch's headings: how the Hand ended, the Showdown, and the amounts in big blinds. */
type ResultSection = 'ending' | 'showdown' | 'amounts'

const streetLabel = (value: string, t: Translator['t']) => t(`library.moreFilters.value.street.${value as (typeof HAND_STREETS)[number]}`)
const answerLabel = (value: string, t: Translator['t']) => t(`library.moreFilters.value.answer.${value as (typeof ANSWERS)[number]}`)

/** In big blinds, negative or with decimals, either end open. */
const bigBlinds: CriterionControl = { kind: 'range', min: -Infinity, max: Infinity, signed: true }

/** The Resultado branch: how the Hand ended for the Hero (facts catalogue §4). */
const RESULT: CriterionDefinition[] = [
  { fact: 'hero-folded-on', section: 'ending', control: { kind: 'options', values: HAND_STREETS, label: streetLabel } },
  { fact: 'hero-all-in-on', section: 'ending', control: { kind: 'options', values: HAND_STREETS, label: streetLabel } },
  { fact: 'faced-all-in-on', section: 'ending', control: { kind: 'options', values: HAND_STREETS, label: streetLabel } },
  { fact: 'faced-all-in-answer', section: 'ending', control: { kind: 'options', values: ANSWERS, label: answerLabel } },
  { fact: 'reached-showdown', section: 'showdown', control: yesOrNo },
  { fact: 'won-money', section: 'showdown', control: yesOrNo },
  { fact: 'won-at-showdown', section: 'showdown', control: yesOrNo },
  { fact: 'result', section: 'amounts', control: bigBlinds },
  { fact: 'all-in-ev', section: 'amounts', control: bigBlinds },
]

// The Preflop branch (facts catalogue §1–2), and the named Actions every Street's branch shares.

/** A named Action, as its row and summary name it: `library.moreFilters.action.<name>`. */
export type ActionName = PreflopAction | StreetAction

/** One an opponent can make against the Hero; `library.moreFilters.action.<name>.faced` says it with its article. */
type FacedActionName = (typeof FACED_PREFLOP_ACTIONS)[number] | StreetAction

/** What the Hero did with a named Action: made it, had the chance, faced it, or faced it and answered. */
export const ACTION_SIDES = ['did', 'chance', 'faced', 'answer'] as const

export type ActionSide = (typeof ACTION_SIDES)[number]

/** Which of a named Action's facts `fact` is, by its last word: `three-bet-answer` is the answer. */
export function actionSide(fact: FactKey): ActionSide {
  return ACTION_SIDES.find((side) => fact.endsWith(`-${side}`)) ?? 'did'
}

/**
 * A named Action as one row: "La hice", "Tuve la oportunidad" or, for one
 * an opponent can make, "Me enfrenté", one at a time, and once faced,
 * "Respondí" fold, call or raise. Its facts are `<prefix>-did`, `-chance`,
 * `-faced` and `-answer`, and the row holds one criterion on one of them:
 * `<prefix>-did:true`, `<prefix>-chance:true`, `<prefix>-faced:true`, or,
 * with an answer picked, `<prefix>-answer:fold,call` alone, since an answer
 * is only there when the Hero faced it. `prefix` is the Action's own name
 * preflop (`three-bet`) and carries its Street after (`flop-cbet`).
 */
export function namedAction(prefix: string, action: ActionName, faced: boolean, section: Section): CriterionDefinition {
  const facts = ACTION_SIDES.filter((side) => faced || side === 'did' || side === 'chance').map((side) => `${prefix}-${side}`)
  for (const fact of facts) if (!Object.hasOwn(FACTS, fact)) throw new Error(`No fact ${fact}`)
  const [fact, ...also] = facts as FactKey[]
  return { fact, also, section, control: { kind: 'action', action, faced } }
}

/** How a named Action criterion reads: `Hice steal`, `Me enfrenté a un 3-bet → fold`. */
function actionSummary(criterion: FactCriterion, action: ActionName, t: Translator['t']): string {
  const side = actionSide(criterion.fact)
  const values = 'values' in criterion ? criterion.values : []
  const name = t(`library.moreFilters.action.${action}`)
  if (side === 'answer') {
    const faced = t(`library.moreFilters.action.${action as FacedActionName}.faced`)
    return t('library.moreFilters.summary.action.answer', { action: faced, values: values.join(', ') })
  }
  const said = side === 'faced' ? t(`library.moreFilters.action.${action as FacedActionName}.faced`) : name
  return values
    .map((value) => t(value === 'true' ? `library.moreFilters.summary.action.${side}` : `library.moreFilters.summary.action.${side}.no`, { action: said }))
    .join(', ')
}

type PreflopSection = 'situation' | 'action' | 'sizes' | 'stacks'

const preflopRoleLabel = (value: string, t: Translator['t']) =>
  t(`library.moreFilters.value.preflop-role.${value as (typeof PREFLOP_ROLES)[number]}`)
const facedFirstLabel = (value: string, t: Translator['t']) =>
  t(`library.moreFilters.value.preflop-faced-first.${value as (typeof PREFLOP_FACED_FIRST)[number]}`)

/** The preflop lines most hands take, offered as buttons; any other is typed. */
const COMMON_PREFLOP_LINES = ['F', 'C', 'CF', 'CC', 'CR', 'R', 'RF', 'RC', 'RR', 'X', 'XF', 'XC', 'XR'] as const

/** A size or a stack, in big blinds or as a multiple, to two decimals. */
const amount = (fact: FactKey, section: PreflopSection): CriterionDefinition => ({
  fact,
  section,
  control: { kind: 'range', min: 0, max: 100_000, decimals: 2 },
})

/**
 * The Preflop branch: the Hero's situation and role, the named Actions and
 * their line, the sizes, and the stacks and forced bets.
 */
const PREFLOP_CRITERIA: CriterionDefinition[] = [
  { fact: 'preflop-faced-first', section: 'situation', control: { kind: 'options', values: PREFLOP_FACED_FIRST, label: facedFirstLabel } },
  { fact: 'limpers', section: 'situation', control: { kind: 'range', min: 0, max: 9 } },
  { fact: 'preflop-role', section: 'situation', control: { kind: 'options', values: PREFLOP_ROLES, label: preflopRoleLabel } },
  { fact: 'hero-aggressor', section: 'situation', control: yesOrNo },
  ...PREFLOP_ACTIONS.map((action) =>
    namedAction(action, action, (FACED_PREFLOP_ACTIONS as readonly string[]).includes(action), 'action'),
  ),
  { fact: 'preflop-line', section: 'action', control: { kind: 'line', common: COMMON_PREFLOP_LINES, pattern: /^[XBCRF]{1,20}$/ } },
  amount('open-size', 'sizes'),
  amount('three-bet-size', 'sizes'),
  amount('four-bet-size', 'sizes'),
  amount('hero-raise-size', 'sizes'),
  amount('hero-raise-multiple', 'sizes'),
  amount('hero-second-raise-size', 'sizes'),
  amount('hero-second-raise-multiple', 'sizes'),
  amount('size-faced', 'sizes'),
  amount('starting-stack', 'stacks'),
  amount('preflop-effective-stack', 'stacks'),
  { fact: 'straddle', section: 'stacks', control: yesOrNo },
  { fact: 'antes', section: 'stacks', control: yesOrNo },
]

/** The lines the board offers as buttons on a Street; any other is typed. */
const COMMON_STREET_LINES = ['X', 'XC', 'XR', 'XF', 'B', 'BC', 'BF'] as const

const HEADS_UP: RangePreset = {
  label: 'library.moreFilters.value.heads-up',
  summary: 'library.moreFilters.summary.heads-up',
  range: { min: 2, max: 2 },
}
const MULTIWAY: RangePreset = {
  label: 'library.moreFilters.value.multiway',
  summary: 'library.moreFilters.summary.multiway',
  range: { min: 3, max: null },
}

/**
 * A Street's branch (facts catalogue §3.1–3.3), as the board draws the
 * flop's: the situation as the Street begins; its named Actions, those of
 * that Street only, and the Hero's line; and the sizes bet and raised.
 */
function streetBranch(street: Street): CriterionDefinition[] {
  const fact = (name: string) => {
    const key = `${street}-${name}`
    if (!Object.hasOwn(FACTS, key)) throw new Error(`No fact ${key}`)
    return key as FactKey
  }
  const situation: Section = `situation-${street}`
  const sized = (name: string, section: Section, unit?: Unit): CriterionDefinition => {
    const domain = FACTS[fact(name)] as { min: number; max: number; decimals?: number }
    return { fact: fact(name), section, control: { kind: 'range', min: domain.min, max: domain.max, decimals: domain.decimals, unit } }
  }
  return [
    {
      fact: fact('ip'),
      section: situation,
      control: { kind: 'boolean', labels: { true: 'library.moreFilters.value.ip', false: 'library.moreFilters.value.oop' } },
    },
    {
      fact: fact('players'),
      section: situation,
      label: 'library.moreFilters.fact.street-players',
      control: { kind: 'range', min: 2, max: 10, presets: [HEADS_UP, MULTIWAY] },
    },
    { fact: fact('first'), section: situation, control: yesOrNo },
    sized('pot', situation, 'bb'),
    sized('effective-stack', situation, 'bb'),
    sized('spr', situation),
    { fact: fact('saw'), section: situation, control: yesOrNo },
    { fact: fact('all-in'), section: situation, control: yesOrNo },
    ...STREET_ACTIONS[street].map((action) => namedAction(`${street}-${action}`, action, true, 'action')),
    { fact: fact('line'), section: 'action', control: { kind: 'line', common: COMMON_STREET_LINES, pattern: STREET_LINE } },
    sized('bet-size', 'sizes', 'pot'),
    sized('raise-size', 'sizes', 'times'),
    sized('bet-size-faced', 'sizes', 'pot'),
    sized('raise-size-faced', 'sizes', 'times'),
  ]
}

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
  preflop: PREFLOP_CRITERIA,
  flop: streetBranch('flop'),
  turn: streetBranch('turn'),
  river: streetBranch('river'),
  cards: [{ fact: 'hero-class', section: 'hole-cards', control: { kind: 'hand-classes' } }, ...STREETS.flatMap(cardsOn)],
  board: STREETS.flatMap(boardOn),
  result: RESULT,
  // The Stat criterion is not a fact's: the panel draws its own branch (`StatBranch`).
  stat: [],
}

/** Every criterion the panel offers, in branch order, with its branch. */
const ORDERED = BRANCHES.flatMap((branch) => BRANCH_CRITERIA[branch].map((definition) => ({ branch, definition })))

/** The panel's definition of a fact, and its branch. */
export function definitionOf(fact: FactKey): { branch: Branch; definition: CriterionDefinition } | undefined {
  return ORDERED.find(({ definition }) => rowFacts(definition).includes(fact))
}

/** The criteria in branch order, those the panel doesn't offer left out. */
export function inBranchOrder(criteria: FactCriterion[]): FactCriterion[] {
  return ORDERED.flatMap(({ definition }) => criteria.filter((criterion) => rowFacts(definition).includes(criterion.fact)))
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

/** A criterion's row label: its name, without its Street, which its section or branch says. */
export function criterionLabel(fact: FactKey, t: Translator['t']): string {
  const definition = definitionOf(fact)?.definition
  if (definition?.control.kind === 'action') return t(`library.moreFilters.action.${definition.control.action}`)
  return t(definition?.label ?? `library.moreFilters.fact.${factName(fact)}`)
}

/** A criterion's label with its Street, for what is read away from its section: `Suits (turn)`. */
export function criterionFullLabel(fact: FactKey, t: Translator['t']): string {
  const street = streetOf(fact)
  const label = criterionLabel(fact, t)
  return street ? t('library.moreFilters.fact.onStreet', { criterion: label, street: t(`library.moreFilters.street.${street}`) }) : label
}

/** What a criterion's values read as: `BTN, CO`, `3-bet, SRP`, `3–6`, `6+`, `≤4`. */
export function valuesSummary(criterion: FactCriterion, t: Translator['t']): string {
  if ('range' in criterion) {
    const { min, max } = criterion.range
    if (min !== null && max !== null) return min === max ? String(min) : `${min}–${max}`
    return min !== null ? `${min}+` : `≤${max}`
  }
  const control = definitionOf(criterion.fact)?.definition.control
  if (control?.kind === 'hand-classes') return holeCardsSummary(criterion.values, t)
  const label = control?.kind === 'options' ? control.label : asWritten
  return criterion.values.map((value) => label(value, t)).join(', ')
}

/** One line per criterion, in branch order, as the chip and its list name them: `Bote 3-bet`, `Excepto Hero BB`. */
export function criterionSummaries(criteria: FactCriterion[], t: Translator['t']): string[] {
  return inBranchOrder(criteria).map((criterion) => {
    const name = factName(criterion.fact)
    const control = definitionOf(criterion.fact)?.definition.control
    const preset =
      control?.kind === 'range' && 'range' in criterion
        ? control.presets?.find(({ range }) => range.min === criterion.range.min && range.max === criterion.range.max)
        : undefined
    const summary =
      control?.kind === 'action'
        ? actionSummary(criterion, control.action, t)
        : preset
        ? t(preset.summary)
        : FACTS[criterion.fact].kind === 'boolean' && 'values' in criterion
        ? criterion.values
            .map((value) => t(value === 'true' ? `library.moreFilters.summary.${name as BooleanName}` : `library.moreFilters.summary.${name as BooleanName}.no`))
            .join(', ')
        : t(`library.moreFilters.summary.${name}`, { values: valuesSummary(criterion, t) })
    const kept = criterion.exclude ? t('library.moreFilters.summary.excluded', { criterion: summary }) : summary
    const street = streetOf(criterion.fact)
    return street ? t('library.moreFilters.summary.onStreet', { street: t(`library.moreFilters.branch.${street}`), criterion: kept }) : kept
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
  return definitionOf(criterion.fact)?.definition.inapplicable?.(criterion, criteria) ?? streetReason(criterion, criteria)
}

/**
 * A Street's criterion keeps no Hand when the Street is never reached: in a
 * walk nothing is dealt after preflop, and once the Hero folds, their facts
 * on the later Streets are empty, though the Board's are still dealt. Only
 * "didn't see it" applies there, and an exclusion keeps the empty ones.
 */
function streetReason(criterion: FactCriterion, criteria: FactCriterion[]): MessageKey | null {
  const street = streetOf(criterion.fact)
  if (!street || criterion.exclude) return null
  if (factName(criterion.fact) === 'saw' && 'values' in criterion && criterion.values.includes('false')) return null
  const only = (fact: FactKey, within: (value: string) => boolean) => {
    const other = criteria.find((candidate) => candidate.fact === fact && !candidate.exclude)
    return !!other && 'values' in other && other.values.length > 0 && other.values.every(within)
  }
  if (only('pot-type', (value) => value === 'walk')) return 'library.moreFilters.inapplicable.street-in-walk'
  const before = (value: string) => HAND_STREETS.indexOf(value as (typeof HAND_STREETS)[number]) < HAND_STREETS.indexOf(street)
  if (definitionOf(criterion.fact)?.branch !== 'board' && only('hero-folded-on', before)) {
    return 'library.moreFilters.inapplicable.street-after-fold'
  }
  return null
}

/*
 * The Estadística branch. Its one criterion is a Stat's: the Hands where the
 * Hero had its chance, or took it, as a Stat's tooltip links to them. It is
 * the filter's `stat`, which the server reads apart from the facts, so it is
 * one Stat at a time and can't be excluded.
 */

/** The Stat criterion as the chip and its list name it, after every fact's: `VPIP · lo hiciste`. */
export function statSummary(stat: StatCriterion, t: Translator['t']): string {
  const abbreviation = STAT_TILES.find((tile) => tile.key === stat.key)?.abbreviation ?? stat.key
  return t(`library.stats.chip.${stat.side}`, { stat: abbreviation })
}
