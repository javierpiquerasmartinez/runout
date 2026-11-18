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

/** The Board's texture on a Street (facts catalogue §3.5), the same facts on each. */
const texture = (suits: readonly string[]) =>
  ({
    suits: { kind: 'set', values: suits },
    pairing: { kind: 'set', values: BOARD_PAIRINGS },
    'straight-possible': { kind: 'boolean' },
    connectedness: { kind: 'range', min: 1, max: 5 },
    'high-card': { kind: 'set', values: BOARD_RANKS },
  }) as const

/** What the turn or the river card changed on the Board before it. */
const change = { kind: 'boolean' } as const

// The preflop facts (facts catalogue §1–2).

/** How the Hero answered an Action they faced. */
export const ANSWERS = ['fold', 'call', 'raise'] as const

/** Where the Hero's preflop ended, by their last voluntary Action: a raise, a call, or neither. */
export const PREFLOP_ROLES = [
  'opener',
  'isolator',
  '3-bettor',
  '4-bettor',
  '5-bettor-plus',
  'limper',
  'called-open',
  'called-3-bet',
  'called-4-bet-plus',
  'walk',
  'checked',
  'folded',
] as const

/** What the Hero faced at their first preflop Action. */
export const PREFLOP_FACED_FIRST = ['unopened', 'limps', 'open', '3-bet', '4-bet-plus'] as const

/** The named preflop Actions, in the order a hand meets them, by the prefix of their facts. */
export const PREFLOP_ACTIONS = [
  'vpip',
  'pfr',
  'open',
  'limp',
  'isolate',
  'steal',
  'three-bet',
  'squeeze',
  'cold-call',
  'four-bet',
  'five-bet',
  'resteal',
] as const

/** Those an opponent can make against the Hero, who then answers: they also have `-faced` and `-answer`. */
export const FACED_PREFLOP_ACTIONS = ['isolate', 'steal', 'three-bet', 'squeeze', 'four-bet', 'five-bet', 'resteal'] as const

export type PreflopAction = (typeof PREFLOP_ACTIONS)[number]

/** A named Action's facts: `-did` and `-chance`, yes or no, and for one faced `-faced` and `-answer`. */
type ActionFacts<A extends string, Faced extends boolean> = Record<`${A}-did` | `${A}-chance`, { kind: 'boolean' }> &
  (Faced extends true ? Record<`${A}-faced`, { kind: 'boolean' }> & Record<`${A}-answer`, { kind: 'set'; values: typeof ANSWERS }> : unknown)

function actionFacts<A extends string, Faced extends boolean>(action: A, faced: Faced): ActionFacts<A, Faced> {
  const yes = { kind: 'boolean' } as const
  return {
    [`${action}-did`]: yes,
    [`${action}-chance`]: yes,
    ...(faced ? { [`${action}-faced`]: yes, [`${action}-answer`]: { kind: 'set', values: ANSWERS } } : {}),
  } as ActionFacts<A, Faced>
}

/** A size or a stack, in big blinds or as a multiple, to two decimals. */
const AMOUNT = { kind: 'range', min: 0, max: 100_000, decimals: 2 } as const

const PREFLOP_FACTS = {
  ...actionFacts('vpip', false),
  ...actionFacts('pfr', false),
  ...actionFacts('open', false),
  ...actionFacts('limp', false),
  ...actionFacts('isolate', true),
  ...actionFacts('steal', true),
  ...actionFacts('three-bet', true),
  ...actionFacts('squeeze', true),
  ...actionFacts('cold-call', false),
  ...actionFacts('four-bet', true),
  ...actionFacts('five-bet', true),
  ...actionFacts('resteal', true),
  'preflop-role': { kind: 'set', values: PREFLOP_ROLES },
  'preflop-faced-first': { kind: 'set', values: PREFLOP_FACED_FIRST },
  limpers: { kind: 'range', min: 0, max: 9 },
  // X check, B bet, C call, R raise, F fold.
  'preflop-line': { kind: 'pattern', pattern: /^[XBCRF]{1,20}$/ },
  'open-size': AMOUNT,
  'three-bet-size': AMOUNT,
  'four-bet-size': AMOUNT,
  'hero-raise-size': AMOUNT,
  'hero-raise-multiple': AMOUNT,
  'hero-second-raise-size': AMOUNT,
  'hero-second-raise-multiple': AMOUNT,
  'size-faced': AMOUNT,
  'starting-stack': AMOUNT,
  'preflop-effective-stack': AMOUNT,
  straddle: { kind: 'boolean' },
  antes: { kind: 'boolean' },
} as const

// The facts of each Street after the flop is dealt (facts catalogue §3.1–3.3).

/**
 * The named Actions on each Street, as the server names them: the flop's
 * seven, then on the turn a delayed C-bet, a probe and a float, and on the
 * river a probe and a float. Each can be faced, so each has all four facts.
 */
export const STREET_ACTIONS = {
  flop: ['cbet', 'donk-bet', 'bet', 'check-raise', 'raise', 'three-bet', 'four-bet'],
  turn: ['cbet', 'delayed-cbet', 'donk-bet', 'probe', 'float', 'bet', 'check-raise', 'raise', 'three-bet', 'four-bet'],
  river: ['cbet', 'donk-bet', 'probe', 'float', 'bet', 'check-raise', 'raise', 'three-bet', 'four-bet'],
} as const

export type StreetAction = (typeof STREET_ACTIONS)[keyof typeof STREET_ACTIONS][number]

/** The Hero's line on a Street: X check, B bet, C call, R raise, F fold, a fold only last. */
export const STREET_LINE = /^[XBCR]{0,30}[XBCRF]$/

const yes = { kind: 'boolean' } as const

/**
 * One Street's facts, named after it (`flop-ip`, `turn-line`,
 * `river-cbet-did`): the situation as it begins, its named Actions, the
 * Hero's line, and the sizes. Pot and stack are in big blinds, bet sizes a
 * whole % of the pot before the bet, raise sizes a multiple of the bet raised.
 */
function streetFacts<S extends keyof typeof STREET_ACTIONS>(street: S) {
  const situation = {
    saw: yes,
    players: { kind: 'range', min: 2, max: 10 },
    ip: yes,
    first: yes,
    pot: { kind: 'range', min: 0, max: 99_999_999, decimals: 2 },
    'effective-stack': { kind: 'range', min: 0, max: 99_999_999, decimals: 2 },
    spr: { kind: 'range', min: 0, max: 99_999_999, decimals: 1 },
    'all-in': yes,
    line: { kind: 'pattern', pattern: STREET_LINE },
    'bet-size': { kind: 'range', min: 0, max: 1_000_000 },
    'raise-size': { kind: 'range', min: 0, max: 999_999, decimals: 2 },
    'bet-size-faced': { kind: 'range', min: 0, max: 1_000_000 },
    'raise-size-faced': { kind: 'range', min: 0, max: 999_999, decimals: 2 },
  } as const
  const facts: Record<string, FactDomain> = { ...situation }
  for (const action of STREET_ACTIONS[street]) Object.assign(facts, actionFacts(action, true))
  return Object.fromEntries(Object.entries(facts).map(([name, domain]) => [`${street}-${name}`, domain])) as {
    [K in keyof typeof situation as `${S}-${K}`]: (typeof situation)[K]
  } & ActionFacts<`${S}-${(typeof STREET_ACTIONS)[S][number]}`, true>
}

/** How a fact's values are written, and which ones it can take. */
export type FactDomain =
  | { kind: 'set'; values: readonly string[] }
  | { kind: 'boolean' }
  /** Values matching `pattern`, too many to list, such as a line. */
  | { kind: 'pattern'; pattern: RegExp }
  /** Whole numbers, or with up to `decimals` decimal places. */
  | { kind: 'range'; min: number; max: number; decimals?: number }

export const FACTS = {
  players: { kind: 'range', min: 2, max: 10 },
  'hero-position': { kind: 'set', values: POSITIONS },
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
  ...PREFLOP_FACTS,
  ...streetFacts('flop'),
  ...streetFacts('turn'),
  ...streetFacts('river'),
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
    const number = domain.decimals ? new RegExp(`^\\d+(\\.\\d{1,${domain.decimals}})?$`) : /^\d+$/
    const [min, max] = ends.map((end) => (end === '' ? null : number.test(end) ? Number(end) : NaN))
    const inside = (end: number | null) => end === null || (end >= domain.min && end <= domain.max)
    if (Number.isNaN(min) || Number.isNaN(max) || !inside(min) || !inside(max)) return null
    if ((min === null && max === null) || (min !== null && max !== null && min > max)) return null
    return { fact, exclude, range: { min, max } }
  }
  const allowed = (value: string) =>
    domain.kind === 'boolean'
      ? value === 'true' || value === 'false'
      : domain.kind === 'pattern'
        ? domain.pattern.test(value)
        : domain.values.includes(value)
  const values = written.split(',')
  if (!values.every(allowed)) return null
  return { fact, exclude, values: [...new Set(values)] }
}
