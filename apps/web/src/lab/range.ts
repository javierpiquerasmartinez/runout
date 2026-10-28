/*
 * A Range: a Frequency for each Combo it holds, edited by Hand Class
 * (ADR 0006). Pure: no React, no I/O. The Lab's screen is built on it.
 */

/** Ranks from the highest down: the matrix's rows and columns, in that order. */
export const RANKS = 'AKQJT98765432'
const SUITS = 'shdc'

/** Every Combo of two cards from one deck. */
export const TOTAL_COMBOS = 1326

/** The three areas of the matrix, in the order the stats list them. */
export const HAND_CLASS_KINDS = ['pair', 'suited', 'offsuit'] as const
export type HandClassKind = (typeof HAND_CLASS_KINDS)[number]

export interface HandClass {
  /** As players write it: `AA`, `AKs`, `AKo`. */
  name: string
  kind: HandClassKind
  /** Its Combos, each written higher rank first, as `AhKd`. */
  combos: string[]
}

/** Combo → Frequency, a whole number from 1 to 100. A Combo left out is at 0 %. */
export type Range = Record<string, number>

export const EMPTY_RANGE: Range = {}

/** The Hand Class at this row and column of the matrix. */
function handClassAt(row: number, column: number): HandClass {
  const high = RANKS[Math.min(row, column)]
  const low = RANKS[Math.max(row, column)]
  const combos: string[] = []
  if (row === column) {
    for (let i = 0; i < SUITS.length; i++)
      for (let j = i + 1; j < SUITS.length; j++) combos.push(`${high}${SUITS[i]}${low}${SUITS[j]}`)
    return { name: `${high}${low}`, kind: 'pair', combos }
  }
  if (row < column) {
    for (const suit of SUITS) combos.push(`${high}${suit}${low}${suit}`)
    return { name: `${high}${low}s`, kind: 'suited', combos }
  }
  for (const highSuit of SUITS) for (const lowSuit of SUITS) if (highSuit !== lowSuit) combos.push(`${high}${highSuit}${low}${lowSuit}`)
  return { name: `${high}${low}o`, kind: 'offsuit', combos }
}

/** The 13×13 matrix, row by row: aces top-left, pairs on the diagonal, suited above it, offsuit below. */
export const MATRIX: readonly (readonly HandClass[])[] = Array.from({ length: RANKS.length }, (_, row) =>
  Array.from({ length: RANKS.length }, (_, column) => handClassAt(row, column)),
)

/** The 169 Hand Classes, in matrix order. */
export const HAND_CLASSES: readonly HandClass[] = MATRIX.flat()

/**
 * The 169 Hand Classes from the strongest down, by all-in equity against one
 * random hand, as PokerStove and Equilab order them. Generated once by
 * enumerating every board and every opposing hand, and checked against the
 * published enumeration at caniwin.com/texasholdem/preflop/heads-up.php: every
 * win and tie % agrees, and the order differs only where two Hand Classes are
 * within 0.002 % of each other (72s and 54o, 42s and 82o), too close for its
 * two decimals to tell apart.
 */
const EQUITY_ORDER = `
  AA KK QQ JJ TT 99 88 AKs 77 AQs AJs AKo ATs AQo AJo KQs 66 A9s ATo KJs A8s KTs KQo A7s A9o KJo 55 QJs K9s A5s
  A6s A8o KTo QTs A4s A7o K8s A3s QJo K9o A5o A6o Q9s K7s JTs A2s QTo 44 A4o K6s K8o Q8s A3o K5s J9s Q9o JTo
  K7o A2o K4s Q7s K6o K3s T9s J8s 33 Q6s Q8o K5o J9o K2s Q5s T8s K4o J7s Q4s Q7o T9o J8o K3o Q6o Q3s 98s T7s
  J6s K2o 22 Q2s Q5o J5s T8o J7o Q4o 97s J4s T6s J3s Q3o 98o 87s T7o J6o 96s J2s Q2o T5s J5o T4s 97o 86s J4o
  T6o 95s T3s 76s J3o 87o T2s 85s 96o J2o T5o 94s 75s T4o 93s 86o 65s 84s 95o T3o 92s 76o 74s T2o 54s 85o 64s
  83s 94o 75o 82s 73s 93o 65o 53s 63s 84o 92o 43s 74o 72s 54o 64o 52s 62s 83o 42s 82o 73o 53o 63o 32s 43o 72o
  52o 62o 42o 32o
`

/** Each Hand Class by its name, as `AKs`. */
export const HAND_CLASS_BY_NAME: ReadonlyMap<string, HandClass> = new Map(HAND_CLASSES.map((handClass) => [handClass.name, handClass]))

/** The Hand Classes in the order the "top X %" fills them. */
export const BY_EQUITY: readonly HandClass[] = EQUITY_ORDER.trim()
  .split(/\s+/)
  .map((name) => HAND_CLASS_BY_NAME.get(name)!)

/**
 * The strongest `percent` % of all Combos, at 100 %: whole Hand Classes in
 * order of equity, added while each brings the Combo total nearer to
 * `percent` % of 1326. No Hand Class is left partial.
 */
export function topRange(percent: number): Range {
  const target = (percent / 100) * TOTAL_COMBOS
  let range: Range = EMPTY_RANGE
  let combos = 0
  for (const handClass of BY_EQUITY) {
    const next = combos + handClass.combos.length
    if (Math.abs(next - target) >= Math.abs(combos - target)) break
    range = withHandClass(range, handClass, 100)
    combos = next
  }
  return range
}

/** A Hand Class's Frequency: one value, or `mixed` when its Combos differ, at their average. */
export function handClassFrequency(range: Range, handClass: HandClass): { value: number; mixed: boolean } {
  const values = handClass.combos.map((combo) => range[combo] ?? 0)
  const mixed = values.some((value) => value !== values[0])
  return { value: values.reduce((sum, value) => sum + value, 0) / values.length, mixed }
}

/** The Range with every Combo of this Hand Class at `frequency`; at 0 % they leave it. */
export function withHandClass(range: Range, handClass: HandClass, frequency: number): Range {
  const next = { ...range }
  for (const combo of handClass.combos) {
    if (frequency > 0) next[combo] = frequency
    else delete next[combo]
  }
  return next
}

/**
 * What a stroke of the brush that starts on this Hand Class does to every Hand
 * Class it crosses: the Frequency it sets them to. One already at exactly the
 * brush's Frequency is taken out (0 %); a mixed one is painted, whatever its average.
 */
export function strokeFrequency(range: Range, handClass: HandClass, brush: number): number {
  const { value, mixed } = handClassFrequency(range, handClass)
  return !mixed && value === brush ? 0 : brush
}

/** Whether both Ranges hold the same Combos at the same Frequencies. */
export function sameRange(a: Range, b: Range): boolean {
  const combos = Object.keys(a)
  return combos.length === Object.keys(b).length && combos.every((combo) => a[combo] === b[combo])
}

export interface RangeStats {
  /** Combos held, each counted by its Frequency: AKo at 50 % is 6. */
  combos: number
  /** That, as a share of all 1326 Combos, from 0 to 100. */
  percent: number
  /** The same count by kind of Hand Class, out of every Combo of that kind. */
  byKind: Record<HandClassKind, { combos: number; of: number }>
}

/** How wide the Range is: its Combos, weighted by Frequency, in all and by kind. */
export function rangeStats(range: Range): RangeStats {
  const byKind: RangeStats['byKind'] = { pair: { combos: 0, of: 0 }, suited: { combos: 0, of: 0 }, offsuit: { combos: 0, of: 0 } }
  let combos = 0
  for (const handClass of HAND_CLASSES) {
    const held = handClass.combos.reduce((sum, combo) => sum + (range[combo] ?? 0) / 100, 0)
    combos += held
    byKind[handClass.kind].combos += held
    byKind[handClass.kind].of += handClass.combos.length
  }
  return { combos, percent: (combos / TOTAL_COMBOS) * 100, byKind }
}
