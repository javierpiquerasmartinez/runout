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
