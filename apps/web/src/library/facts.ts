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

/** How a fact's values are written, and which ones it can take. */
export type FactDomain =
  | { kind: 'set'; values: readonly string[] }
  | { kind: 'boolean' }
  | { kind: 'range'; min: number; max: number }

export const FACTS = {
  players: { kind: 'range', min: 2, max: 10 },
  'hero-position': { kind: 'set', values: POSITIONS },
  'pot-type': { kind: 'set', values: POT_TYPES },
  'opener-position': { kind: 'set', values: POSITIONS },
  'three-bettor-position': { kind: 'set', values: POSITIONS },
  'four-bettor-position': { kind: 'set', values: POSITIONS },
  'aggressor-position': { kind: 'set', values: POSITIONS },
  'hero-aggressor': { kind: 'boolean' },
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
    const [min, max] = ends.map((end) => (end === '' ? null : /^\d+$/.test(end) ? Number(end) : NaN))
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
