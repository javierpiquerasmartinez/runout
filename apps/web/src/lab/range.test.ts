import { describe, expect, it } from 'vitest'
import {
  handClassFrequency,
  EMPTY_RANGE,
  formatRange,
  parseRange,
  BY_EQUITY,
  HAND_CLASSES,
  MATRIX,
  rangeStats,
  sameRange,
  strokeFrequency,
  topRange,
  TOTAL_COMBOS,
  withHandClass,
  type Range,
} from './range'

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

describe('a stroke of the brush', () => {
  it("paints at the brush's Frequency a Hand Class out of the Range", () => {
    expect(strokeFrequency(EMPTY_RANGE, named('AKo'), 50)).toBe(50)
  })

  it("paints at the brush's Frequency a Hand Class at another Frequency", () => {
    expect(strokeFrequency(withHandClass(EMPTY_RANGE, named('AKo'), 100), named('AKo'), 50)).toBe(50)
  })

  it("takes out a Hand Class already at exactly the brush's Frequency", () => {
    expect(strokeFrequency(withHandClass(EMPTY_RANGE, named('AKo'), 75), named('AKo'), 75)).toBe(0)
  })

  it("paints a mixed Hand Class whose average is the brush's Frequency, rather than taking it out", () => {
    const range = { AsKs: 100, AhKh: 100 }

    expect(handClassFrequency(range, named('AKs')).value).toBe(50)
    expect(strokeFrequency(range, named('AKs'), 50)).toBe(50)
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

describe('the order by equity', () => {
  it('holds each of the 169 Hand Classes once', () => {
    expect(BY_EQUITY).toHaveLength(169)
    expect(new Set(BY_EQUITY.map((handClass) => handClass.name)).size).toBe(169)
  })
})

describe('the top X %', () => {
  /** The Hand Classes a Range holds at 100 %, by name. */
  const held = (range: Range) =>
    HAND_CLASSES.filter((handClass) => handClassFrequency(range, handClass).value === 100).map((handClass) => handClass.name)

  it('is empty at 0 %', () => {
    expect(topRange(0)).toEqual(EMPTY_RANGE)
  })

  it('is every Combo at 100 % at 100 %', () => {
    const range = topRange(100)

    expect(Object.keys(range)).toHaveLength(1326)
    expect(Object.values(range).every((frequency) => frequency === 100)).toBe(true)
  })

  it('stops before a Hand Class that would take it further from X %', () => {
    // 0.5 % is 6.63 Combos: AA (6) is nearer than AA and KK (12).
    expect(held(topRange(0.5))).toEqual(['AA'])
  })

  it('takes a Hand Class that brings it nearer to X %, even past it', () => {
    // 5 % is 66.3 Combos: 88+, AKs, 77, AQs and AJs are 60; AKo makes 72, nearer; ATs would make 76.
    const range = topRange(5)

    expect(rangeStats(range).combos).toBe(72)
    expect(held(range).sort()).toEqual(['88', '99', 'AA', 'AJs', 'AKo', 'AKs', 'AQs', 'JJ', 'KK', 'QQ', 'TT', '77'].sort())
  })

  it('snaps to whole Hand Classes at 10 %', () => {
    // 10 % is 132.6 Combos: … KJs makes 130, A8s 134 (nearer), KTs would make 138.
    const range = topRange(10)

    expect(rangeStats(range).combos).toBe(134)
    expect(held(range)).toContain('A8s')
    expect(held(range)).not.toContain('KTs')
  })
})

/** The Range a text imports to, failing the test if it is refused. */
function imported(text: string): Range {
  const result = parseRange(text)
  if (!('range' in result)) throw new Error(`refused at ${result.unknown}`)
  return result.range
}

describe('importing text', () => {
  /** The Hand Classes a Range holds, each with its Frequency (or `mixed`), by name. */
  const held = (range: Range) =>
    Object.fromEntries(
      HAND_CLASSES.flatMap((handClass) => {
        const { value, mixed } = handClassFrequency(range, handClass)
        return value > 0 ? [[handClass.name, mixed ? 'mixed' : value]] : []
      }),
    )

  it('reads a pair, a suited and an offsuit Hand Class', () => {
    expect(held(imported('AA,AKs,AKo'))).toEqual({ AA: 100, AKs: 100, AKo: 100 })
  })

  it('reads two ranks with no suits as both the suited and the offsuit Hand Class', () => {
    expect(held(imported('KQ'))).toEqual({ KQs: 100, KQo: 100 })
  })

  it('takes commas, spaces or new lines between pieces', () => {
    expect(held(imported(' AA, KK\nQQ  JJ,\tTT ,'))).toEqual({ AA: 100, KK: 100, QQ: 100, JJ: 100, TT: 100 })
  })

  it('reads an empty text as an empty Range', () => {
    expect(imported('  ')).toEqual(EMPTY_RANGE)
  })

  it('reads a pair with + as it and every pair above it', () => {
    expect(held(imported('JJ+'))).toEqual({ AA: 100, KK: 100, QQ: 100, JJ: 100 })
  })

  it('reads a non-pair with + as it and every kicker above it, up to below the high card', () => {
    expect(held(imported('KTs+'))).toEqual({ KQs: 100, KJs: 100, KTs: 100 })
    expect(held(imported('QT+'))).toEqual({ QJs: 100, QTs: 100, QJo: 100, QTo: 100 })
  })

  it('reads a run with - between two pairs, in either order', () => {
    expect(held(imported('99-77'))).toEqual({ 99: 100, 88: 100, 77: 100 })
    expect(held(imported('77-99'))).toEqual({ 99: 100, 88: 100, 77: 100 })
  })

  it('reads a run with - between two kickers of one high card', () => {
    expect(held(imported('K9s-K7s'))).toEqual({ K9s: 100, K8s: 100, K7s: 100 })
    expect(held(imported('A3o-A5o'))).toEqual({ A5o: 100, A4o: 100, A3o: 100 })
  })

  it('reads a Frequency after a colon, as a fraction up to 1 or a percentage above it', () => {
    expect(held(imported('AKo:0.5,AQo:0.25,AJo:1,ATo:75,77+:40'))).toEqual({
      AKo: 50,
      AQo: 25,
      AJo: 100,
      ATo: 75,
      AA: 40,
      KK: 40,
      QQ: 40,
      JJ: 40,
      TT: 40,
      99: 40,
      88: 40,
      77: 40,
    })
  })

  it('rounds a Frequency to a whole number', () => {
    expect(held(imported('AKo:0.333,AQo:66.6,AJo:12.5'))).toEqual({ AKo: 33, AQo: 67, AJo: 13 })
  })

  it('rounds a fraction half-way between two whole numbers up, as written', () => {
    expect(held(imported('AKo:0.145,AQo:0.285,AJo:0.575'))).toEqual({ AKo: 15, AQo: 29, AJo: 58 })
  })

  it('lets a later piece override an earlier one', () => {
    expect(held(imported('TT+,QQ:0.5,AK,AKo:25'))).toEqual({ AA: 100, KK: 100, QQ: 50, JJ: 100, TT: 100, AKs: 100, AKo: 25 })
  })

  it('takes a later piece at 0 % out of the Range', () => {
    expect(held(imported('AK,AKo:0'))).toEqual({ AKs: 100 })
  })

  it('reads exact Combos as they are, in either card order, leaving their Hand Class mixed', () => {
    const range = imported('AhKh,KsAs:0.5,7c7d:25')

    expect(range).toEqual({ AhKh: 100, AsKs: 50, '7d7c': 25 })
    expect(held(range)).toEqual({ AKs: 'mixed', 77: 'mixed' })
  })

  it('lets an exact Combo override its Hand Class, and a Hand Class override its Combos', () => {
    expect(imported('AKs:50,AhKh')).toEqual({ AsKs: 50, AhKh: 100, AdKd: 50, AcKc: 50 })
    expect(held(imported('AhKh,AKs:50'))).toEqual({ AKs: 50 })
  })

  it("reads GTO+'s blocks as their pieces at the block's percentage", () => {
    expect(held(imported('[50]AKo, QQ[/50],[25.5]KQs[/25.5] AA'))).toEqual({ AKo: 50, QQ: 50, KQs: 26, AA: 100 })
  })

  it('refuses the whole text at the first piece it does not understand', () => {
    expect(parseRange('AA,AKx,QQ,zz')).toEqual({ unknown: 'AKx' })
  })

  it.each([
    ['a Frequency above 100', 'AA:150'],
    ['a Frequency that is not a number', 'AA:half'],
    ['two colons', 'AA:0.5:1'],
    ['a pair with a suitedness', 'QQs'],
    ['the same card twice', 'AhAh'],
    ['a run with two high cards', 'K9s-Q6s'],
    ['a run with two suitednesses', 'K9s-K6o'],
    ['a run of a pair and a non-pair', '99-A9'],
    ['a + on the low card first', 'KAs+'],
    ['an unclosed GTO+ block', '[50]AKo'],
  ])('refuses %s', (_, piece) => {
    expect(parseRange(`AA,${piece},KK`)).toEqual({ unknown: piece })
  })

  it('refuses a GTO+ block above 100, naming its opening', () => {
    expect(parseRange('AA,[150]AKo[/150]')).toEqual({ unknown: '[150]' })
  })

  it('refuses a Frequency inside a GTO+ block', () => {
    expect(parseRange('[50]AKo:0.5[/50]')).toEqual({ unknown: 'AKo:0.5' })
  })
})

describe('exporting text', () => {
  it('is empty for an empty Range', () => {
    expect(formatRange(EMPTY_RANGE)).toBe('')
  })

  it('writes pairs, then suited, then offsuit, by high card, shortening runs of one Frequency', () => {
    const range = imported('22,33-55:25,KQo,AQo:0.5,AJo:0.5,TT+,K5s-K7s,A9s+,KQs,Q2s:75')

    expect(formatRange(range)).toBe('TT+,55-33:0.25,22,A9s+,KQs,K7s-K5s,Q2s:0.75,AQo-AJo:0.5,KQo')
  })

  it('writes the whole deck with + on every line', () => {
    expect(formatRange(imported('22+,A2+,K2+,Q2+,J2+,T2+,92+,82+,72+,62+,52+,42+,32'))).toBe(
      '22+,A2s+,K2s+,Q2s+,J2s+,T2s+,92s+,82s+,72s+,62s+,52s+,42s+,32s,A2o+,K2o+,Q2o+,J2o+,T2o+,92o+,82o+,72o+,62o+,52o+,42o+,32o',
    )
  })

  it('writes a Frequency as a fraction, leaving it out at 100 %', () => {
    expect(formatRange(imported('AA:1,KK:7,QQ:33'))).toBe('AA,KK:0.07,QQ:0.33')
  })

  it('writes the Combos of a mixed Hand Class one by one, at the end', () => {
    expect(formatRange(imported('AhKh,AsKs:0.5,QQ,7d7c:25'))).toBe('QQ,AsKs:0.5,AhKh,7d7c:0.25')
  })

  it.each([
    ['a plain Range', imported('TT+,55-33:0.25,22,A9s+,KQs,K7s-K5s,Q2s:0.75,AQo-AJo:0.5,KQo')],
    ['mixed Hand Classes', imported('AK:0.5,AhKh,AhKd:0,77:0.1,7d7c:0.25,7s7h:0.9,32o:0.42')],
    ['a GTO+ paste', imported('[40]JJ+,AQs[/40],[10.5]K2s+[/10.5],ATo')],
    // 88 is mixed at an average of 50 %, next to 77 at 50 %.
    ['a mixed Hand Class beside one at its average', imported('88:40,8s8h:1,77:0.5')],
    ['the top 30 %', topRange(30)],
  ])('imports back to the same Range, for %s', (_, range) => {
    expect(imported(formatRange(range))).toEqual(range)
  })
})
