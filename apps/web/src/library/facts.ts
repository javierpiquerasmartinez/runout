import { COMBINATION_DRAWS, DRAWS, MADE_HANDS } from '@runout/poker'

/*
 * The Hero's facts a Más filtros criterion can name, as the server's
 * `FACTS` catalogue in `fact-criteria.ts` defines them (ADR 0001: no shared
 * code, so this is kept in step by hand). A fact the server doesn't know
 * would be refused, so the web drops one it doesn't know from an address.
 */

/** Every Position, in preflop acting order. */
export const POSITIONS = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const

/** What kind of pot the Hand was, by its preflop raises, from fewest to most. */
export const POT_TYPES = ['walk', 'limped', 'single-raised', '3-bet', '4-bet', '5-bet-plus'] as const

export type PotType = (typeof POT_TYPES)[number]

/** A flop's suits: three, two or one of them. */
export const FLOP_SUITS = ['rainbow', 'two-tone', 'monotone'] as const

/** The turn's or the river's Board, by the most cards of one suit on it. */
export const LATER_SUITS = ['no-flush', 'flush-possible', 'four-of-a-suit', 'five-of-a-suit'] as const

/** How the Board is paired, from none to four of a rank. */
export const BOARD_PAIRINGS = ['unpaired', 'paired', 'two-pair', 'trips', 'full-house', 'quads'] as const

/** Ranks from the highest down, as the Lab writes them. */
export const BOARD_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const

/** The Streets, in the order they are dealt. */
export const HAND_STREETS = ['preflop', 'flop', 'turn', 'river'] as const

/** What the Hero answered an Action with. */
export const ANSWERS = ['fold', 'call', 'raise'] as const

/** An amount in big blinds: negative or with decimals, any size. */
const BIG_BLINDS = { kind: 'range', min: -Infinity, max: Infinity, signed: true } as const

/** The Board's texture on a Street (facts catalogue §3.5), the same facts on each. */
const texture = (suits: readonly string[]) =>
  ({
    suits: { kind: 'set', values: suits },
    pairing: { kind: 'set', values: BOARD_PAIRINGS },
    'straight-possible': { kind: 'boolean' },
    connectedness: { kind: 'range', min: 1, max: 5 },
    'high-card': { kind: 'set', values: BOARD_RANKS },
  }) as const

/** Ranks from the highest down, as Hand Classes write them. */
const RANKS = 'AKQJT98765432'

/** The 169 Hand Classes the Hero can be dealt, as players write them: `AA`, `AKs`, `AKo`. */
export const HAND_CLASSES: readonly string[] = [...RANKS].flatMap((high, h) =>
  [...RANKS.slice(h)].flatMap((low, offset) => (offset === 0 ? [high + low] : [`${high}${low}s`, `${high}${low}o`])),
)

/** Every Draw and combination Draw the Hero's Combo can be in on the flop or the turn, in the Lab's order. */
export const STREET_DRAWS = [...DRAWS, ...COMBINATION_DRAWS] as const

/** How good the Hero's other card is when the Made Hand uses only one of them. */
export const KICKERS = ['top', 'second', 'weak'] as const

/** What the turn or the river card changed on the Board before it. */
const change = { kind: 'boolean' } as const

/** How a fact's values are written, and which ones it can take. */
export type FactDomain =
  | { kind: 'set'; values: readonly string[] }
  | { kind: 'boolean' }
  /** With `signed`, its ends may be negative or have decimals. */
  | { kind: 'range'; min: number; max: number; signed?: boolean }

export const FACTS = {
  players: { kind: 'range', min: 2, max: 10 },
  'hero-position': { kind: 'set', values: POSITIONS },
  'hero-class': { kind: 'set', values: HAND_CLASSES },
  'pot-type': { kind: 'set', values: POT_TYPES },
  'opener-position': { kind: 'set', values: POSITIONS },
  'three-bettor-position': { kind: 'set', values: POSITIONS },
  'four-bettor-position': { kind: 'set', values: POSITIONS },
  'aggressor-position': { kind: 'set', values: POSITIONS },
  'hero-aggressor': { kind: 'boolean' },
  'flop-suits': texture(FLOP_SUITS).suits,
  'flop-pairing': texture(FLOP_SUITS).pairing,
  'flop-straight-possible': texture(FLOP_SUITS)['straight-possible'],
  'flop-connectedness': texture(FLOP_SUITS).connectedness,
  'flop-high-card': texture(FLOP_SUITS)['high-card'],
  'turn-suits': texture(LATER_SUITS).suits,
  'turn-pairing': texture(LATER_SUITS).pairing,
  'turn-straight-possible': texture(LATER_SUITS)['straight-possible'],
  'turn-connectedness': texture(LATER_SUITS).connectedness,
  'turn-high-card': texture(LATER_SUITS)['high-card'],
  'turn-pairs-board': change,
  'turn-brings-flush': change,
  'turn-brings-straight': change,
  'turn-overcard': change,
  'river-suits': texture(LATER_SUITS).suits,
  'river-pairing': texture(LATER_SUITS).pairing,
  'river-straight-possible': texture(LATER_SUITS)['straight-possible'],
  'river-connectedness': texture(LATER_SUITS).connectedness,
  'river-high-card': texture(LATER_SUITS)['high-card'],
  'river-pairs-board': change,
  'river-brings-flush': change,
  'river-brings-straight': change,
  'river-overcard': change,
  // The Hero's cards on each Street (facts catalogue §3.4). The Draws are a
  // list on the server (`members`): a criterion keeps a Hand in any of them.
  'flop-made-hand': { kind: 'set', values: MADE_HANDS },
  'flop-draw': { kind: 'set', values: STREET_DRAWS },
  'flop-nuts': { kind: 'boolean' },
  'flop-kicker': { kind: 'set', values: KICKERS },
  'flop-nut-flush-draw': { kind: 'boolean' },
  'turn-made-hand': { kind: 'set', values: MADE_HANDS },
  'turn-draw': { kind: 'set', values: STREET_DRAWS },
  'turn-nuts': { kind: 'boolean' },
  'turn-kicker': { kind: 'set', values: KICKERS },
  'turn-nut-flush-draw': { kind: 'boolean' },
  'river-made-hand': { kind: 'set', values: MADE_HANDS },
  'river-nuts': { kind: 'boolean' },
  'river-kicker': { kind: 'set', values: KICKERS },
  // Showdown and Result (facts catalogue §4).
  'hero-folded-on': { kind: 'set', values: HAND_STREETS },
  'hero-all-in-on': { kind: 'set', values: HAND_STREETS },
  'faced-all-in-on': { kind: 'set', values: HAND_STREETS },
  'faced-all-in-answer': { kind: 'set', values: ANSWERS },
  'reached-showdown': { kind: 'boolean' },
  'won-money': { kind: 'boolean' },
  'won-at-showdown': { kind: 'boolean' },
  result: BIG_BLINDS,
  'all-in-ev': BIG_BLINDS,
} as const satisfies Record<string, FactDomain>

export type FactKey = keyof typeof FACTS

/**
 * A criterion on one fact: the values that keep a Hand, any one of them, or
 * for a number a range with both ends included and either left open. An
 * exclusion keeps the Hands it wouldn't, and those where the fact is empty.
 */
export type FactCriterion = { fact: FactKey; exclude: boolean } & (
  | { values: string[] }
  | { range: { min: number | null; max: number | null } }
)

/** As the query and the address write it: `pot-type:3-bet,4-bet`, `!hero-position:BB`, `players:..4`. */
export function writeFactCriterion(criterion: FactCriterion): string {
  const written =
    'range' in criterion ? `${criterion.range.min ?? ''}..${criterion.range.max ?? ''}` : criterion.values.join(',')
  return `${criterion.exclude ? '!' : ''}${criterion.fact}:${written}`
}

/** A criterion as `writeFactCriterion` writes it, or null for anything the server would refuse. */
export function readFactCriterion(text: string): FactCriterion | null {
  const exclude = text.startsWith('!')
  const [name, written, ...rest] = (exclude ? text.slice(1) : text).split(':')
  if (!Object.hasOwn(FACTS, name) || written === undefined || rest.length > 0) return null
  const fact = name as FactKey
  const domain: FactDomain = FACTS[fact]
  if (domain.kind === 'range') {
    const ends = written.split('..')
    if (ends.length !== 2) return null
    const number = domain.signed ? /^-?\d+(\.\d+)?$/ : /^\d+$/
    const [min, max] = ends.map((end) => (end === '' ? null : number.test(end) ? Number(end) : NaN))
    const inside = (end: number | null) => end === null || (end >= domain.min && end <= domain.max)
    if (Number.isNaN(min) || Number.isNaN(max) || !inside(min) || !inside(max)) return null
    if ((min === null && max === null) || (min !== null && max !== null && min > max)) return null
    return { fact, exclude, range: { min, max } }
  }
  const allowed: readonly string[] = domain.kind === 'boolean' ? ['true', 'false'] : domain.values
  const values = written.split(',')
  if (!values.every((value) => allowed.includes(value))) return null
  return { fact, exclude, values: [...new Set(values)] }
}
