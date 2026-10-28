import { describe, expect, it } from 'vitest'
import { handClassFrequency, EMPTY_RANGE, HAND_CLASSES, MATRIX, rangeStats, sameRange, TOTAL_COMBOS, withHandClass } from './range'

/** The Hand Class written as `name`. */
const named = (name: string) => HAND_CLASSES.find((handClass) => handClass.name === name)!

describe('the matrix', () => {
  it('runs from aces top-left, with pairs on the diagonal, suited above and offsuit below', () => {
    expect(MATRIX).toHaveLength(13)
    expect(MATRIX.every((row) => row.length === 13)).toBe(true)
    expect(MATRIX[0].slice(0, 4).map((handClass) => handClass.name)).toEqual(['AA', 'AKs', 'AQs', 'AJs'])
    expect(MATRIX[1].slice(0, 3).map((handClass) => handClass.name)).toEqual(['AKo', 'KK', 'KQs'])
    expect(MATRIX[12].slice(10).map((handClass) => handClass.name)).toEqual(['42o', '32o', '22'])
    expect(MATRIX[5][4].name).toBe('T9o')
    expect(MATRIX[4][5].name).toBe('T9s')
  })

  it('holds each of the 169 Hand Classes once', () => {
    expect(new Set(HAND_CLASSES.map((handClass) => handClass.name)).size).toBe(169)
  })
})

describe('Combos', () => {
  it('are 6 for a pair, 4 suited and 12 offsuit, written higher rank first', () => {
    expect(named('AA').combos).toEqual(['AsAh', 'AsAd', 'AsAc', 'AhAd', 'AhAc', 'AdAc'])
    expect(named('T9s').combos).toEqual(['Ts9s', 'Th9h', 'Td9d', 'Tc9c'])
    expect(named('72o').combos).toHaveLength(12)
    expect(named('72o').combos).toContain('7h2s')
    expect(named('72o').combos).not.toContain('7h2h')
  })

  it('are 1326 in all, each in one Hand Class', () => {
    const all = HAND_CLASSES.flatMap((handClass) => handClass.combos)
    expect(all).toHaveLength(TOTAL_COMBOS)
    expect(TOTAL_COMBOS).toBe(1326)
    expect(new Set(all).size).toBe(1326)
  })
})

describe('a Hand Class', () => {
  it('is at 0 % in an empty Range', () => {
    expect(handClassFrequency(EMPTY_RANGE, named('AKo'))).toEqual({ value: 0, mixed: false })
  })

  it('set to a Frequency puts every one of its Combos at it, and nothing else', () => {
    const range = withHandClass(EMPTY_RANGE, named('AKs'), 100)

    expect(range).toEqual({ AsKs: 100, AhKh: 100, AdKd: 100, AcKc: 100 })
    expect(handClassFrequency(range, named('AKs'))).toEqual({ value: 100, mixed: false })
    expect(handClassFrequency(range, named('AKo'))).toEqual({ value: 0, mixed: false })
  })

  it('set to 0 % leaves the Range', () => {
    const range = withHandClass(withHandClass(EMPTY_RANGE, named('QQ'), 100), named('QQ'), 0)

    expect(range).toEqual({})
  })

  it('whose Combos differ is mixed, at their average', () => {
    const range = { AsKs: 100, AhKh: 50 }

    expect(handClassFrequency(range, named('AKs'))).toEqual({ value: 37.5, mixed: true })
  })

  it('leaves the Range it was set on as it was', () => {
    const range = { AsAh: 100 }
    withHandClass(range, named('AA'), 50)

    expect(range).toEqual({ AsAh: 100 })
  })
})

describe('stats', () => {
  it('are all zero for an empty Range, out of 78 pairs, 312 suited and 936 offsuit', () => {
    expect(rangeStats(EMPTY_RANGE)).toEqual({
      combos: 0,
      percent: 0,
      byKind: { pair: { combos: 0, of: 78 }, suited: { combos: 0, of: 312 }, offsuit: { combos: 0, of: 936 } },
    })
  })

  it('count Combos weighted by Frequency, and their share of 1326', () => {
    let range = withHandClass(EMPTY_RANGE, named('AA'), 100)
    range = withHandClass(range, named('AKs'), 100)
    range = withHandClass(range, named('AKo'), 50)

    const stats = rangeStats(range)

    // 6 + 4 + 12 × 0.5
    expect(stats.combos).toBe(16)
    expect(stats.percent).toBeCloseTo((16 / 1326) * 100, 10)
    expect(stats.byKind).toEqual({ pair: { combos: 6, of: 78 }, suited: { combos: 4, of: 312 }, offsuit: { combos: 6, of: 936 } })
  })

  it('are 1326 Combos and 100 % for every Hand Class at 100 %', () => {
    const range = HAND_CLASSES.reduce((sum, handClass) => withHandClass(sum, handClass, 100), EMPTY_RANGE)

    expect(rangeStats(range)).toMatchObject({ combos: 1326, percent: 100 })
  })
})

describe('sameRange', () => {
  it('is true for the same Combos at the same Frequencies, however they were built', () => {
    const painted = withHandClass(withHandClass(EMPTY_RANGE, named('AKs'), 50), named('AA'), 100)
    const unpainted = withHandClass(withHandClass(painted, named('KK'), 100), named('KK'), 0)

    expect(sameRange(painted, unpainted)).toBe(true)
    expect(sameRange(EMPTY_RANGE, {})).toBe(true)
  })

  it('is false when a Combo is missing or at another Frequency', () => {
    const range = withHandClass(EMPTY_RANGE, named('AKs'), 50)

    expect(sameRange(range, withHandClass(range, named('AKs'), 75))).toBe(false)
    expect(sameRange(range, withHandClass(range, named('AA'), 100))).toBe(false)
    expect(sameRange(withHandClass(range, named('AA'), 100), range)).toBe(false)
  })
})
