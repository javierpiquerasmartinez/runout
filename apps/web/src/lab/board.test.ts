import { describe, expect, it } from 'vitest'
import {
  DECK,
  formatBoard,
  liveCombos,
  madeHands,
  parseBoard,
  readBoardCards,
  removedCombos,
  withRandomCard,
  randomFlop,
  toggleCard,
} from './board'
import { HAND_CLASS_BY_NAME, topRange } from './range'

/** A seeded random source (mulberry32), so a deal can be repeated. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('the deck', () => {
  it('holds 52 cards, one row per suit from aces down', () => {
    expect(DECK).toHaveLength(52)
    expect(new Set(DECK).size).toBe(52)
    expect(DECK.slice(0, 3)).toEqual(['As', 'Ks', 'Qs'])
    expect(DECK.slice(12, 14)).toEqual(['2s', 'Ah'])
    expect(DECK[51]).toBe('2c')
  })
})

describe('a Board as text', () => {
  it('reads a flop, a turn and a river written together, as Ah7d2c', () => {
    expect(parseBoard('Ah7d2c')).toEqual({ board: ['Ah', '7d', '2c'] })
    expect(parseBoard('Ah7d2cTs')).toEqual({ board: ['Ah', '7d', '2c', 'Ts'] })
    expect(parseBoard('Ah7d2cTs9h')).toEqual({ board: ['Ah', '7d', '2c', 'Ts', '9h'] })
  })

  it('reads no cards as an empty Board', () => {
    expect(parseBoard('')).toEqual({ board: [] })
    expect(parseBoard('  ')).toEqual({ board: [] })
  })

  it('takes spaces, commas, any case and tens written as 10', () => {
    expect(parseBoard(' ah, 7D 10c ')).toEqual({ board: ['Ah', '7d', 'Tc'] })
  })

  it('refuses an unknown card, naming it', () => {
    expect(parseBoard('Ah7x2c')).toEqual({ problem: { kind: 'unknown', piece: '7x' } })
    expect(parseBoard('Ah1d2c')).toEqual({ problem: { kind: 'unknown', piece: '1d' } })
    expect(parseBoard('AhKdQ')).toEqual({ problem: { kind: 'unknown', piece: 'Q' } })
  })

  it('refuses a repeated card, naming it', () => {
    expect(parseBoard('Ah7dah')).toEqual({ problem: { kind: 'repeated', card: 'Ah' } })
  })

  it('refuses one, two or more than five cards, saying how many', () => {
    expect(parseBoard('Ah')).toEqual({ problem: { kind: 'size', count: 1 } })
    expect(parseBoard('Ah7d')).toEqual({ problem: { kind: 'size', count: 2 } })
    expect(parseBoard('Ah7d2cTs9h8h')).toEqual({ problem: { kind: 'size', count: 6 } })
  })

  it('is written back as the text it reads', () => {
    expect(formatBoard(['Ah', '7d', '2c', 'Ts'])).toBe('Ah7d2cTs')
    expect(formatBoard([])).toBe('')
  })
})

describe('the cards being picked', () => {
  it('may be a Board still being filled, read from an address, but no more than five known cards once each', () => {
    expect(readBoardCards('Ah7d')).toEqual(['Ah', '7d'])
    expect(readBoardCards('Ah7dAh')).toEqual([])
    expect(readBoardCards('banana')).toEqual([])
    expect(readBoardCards('Ah7d2cTs9h8h')).toEqual([])
  })

  it('fill in order, and a card picked again comes off', () => {
    let cards: string[] = []
    for (const card of ['Ah', '7d', '2c', 'Ts']) cards = toggleCard(cards, card)
    expect(cards).toEqual(['Ah', '7d', '2c', 'Ts'])

    expect(toggleCard(cards, '7d')).toEqual(['Ah', '2c', 'Ts'])
  })

  it('stop at five', () => {
    const river = ['Ah', '7d', '2c', 'Ts', '9h']

    expect(toggleCard(river, '8h')).toEqual(river)
  })
})

describe('random deals', () => {
  it('deal a flop of three different cards, the same for the same seed', () => {
    const flop = randomFlop(seeded(7))

    expect(flop).toHaveLength(3)
    expect(new Set(flop).size).toBe(3)
    expect(flop.every((card) => DECK.includes(card))).toBe(true)
    expect(randomFlop(seeded(7))).toEqual(flop)
    expect(randomFlop(seeded(8))).not.toEqual(flop)
  })

  it('never deal a card kept out', () => {
    const kept = DECK.slice(0, 49)

    for (let seed = 0; seed < 20; seed++) expect(randomFlop(seeded(seed), kept).sort()).toEqual(DECK.slice(49).sort())
  })

  it('add the turn, then the river, never a card already in use', () => {
    const flop = ['As', 'Ks', 'Qs']
    for (let seed = 0; seed < 50; seed++) {
      const turn = withRandomCard(flop, seeded(seed))
      const river = withRandomCard(turn, seeded(seed + 100))
      expect(turn.slice(0, 3)).toEqual(flop)
      expect(river.slice(0, 4)).toEqual(turn)
      expect(new Set(river).size).toBe(5)
    }
  })

  it('add no card to an unfinished flop or a full Board', () => {
    expect(withRandomCard(['As'], seeded(1))).toEqual(['As'])
    expect(withRandomCard(['As', 'Ks', 'Qs', 'Js', 'Ts'], seeded(1))).toEqual(['As', 'Ks', 'Qs', 'Js', 'Ts'])
  })

  it('take the last card left when only one is', () => {
    const kept = DECK.filter((card) => card !== '2c' && !['As', 'Ks', 'Qs'].includes(card))

    expect(withRandomCard(['As', 'Ks', 'Qs'], seeded(3), kept)).toEqual(['As', 'Ks', 'Qs', '2c'])
  })
})

describe('Combos the Board removes', () => {
  it('are those holding one of its cards, counted per Hand Class', () => {
    const board = ['As', '7d', '2c']

    expect(removedCombos(HAND_CLASS_BY_NAME.get('AA')!, board)).toBe(3)
    expect(removedCombos(HAND_CLASS_BY_NAME.get('AKs')!, board)).toBe(1)
    expect(removedCombos(HAND_CLASS_BY_NAME.get('72o')!, board)).toBe(5)
    expect(removedCombos(HAND_CLASS_BY_NAME.get('KQo')!, board)).toBe(0)
  })

  it('leave the live Combos, weighted by Frequency', () => {
    const range = { AsAh: 100, AhAd: 100, AhKh: 50, AsKs: 50, KsKh: 25 }

    expect(liveCombos(range, [])).toBe(3.25)
    expect(liveCombos(range, ['As', '7d', '2c'])).toBe(1.75)
  })
})

/** The Made Hand a lone Combo falls in on this Board, as `AhKd` on `Ks Kd 7c`. */
function madeHandOfCombo(combo: string, board: string): string | undefined {
  return madeHands({ [combo]: 100 }, board.split(' ')).find((row) => row.combos > 0)?.category
}

describe('Made Hands', () => {
  it('are none preflop, nor on a flop still being picked', () => {
    expect(madeHands({ AsAh: 100 }, [])).toEqual([])
    expect(madeHands({ AsAh: 100 }, ['Kd', '7c'])).toEqual([])
  })

  it('put each Combo in its best, from straight flush down to no made hand', () => {
    expect(madeHandOfCombo('9h8h', 'Th Jh Qh')).toBe('straight-flush')
    expect(madeHandOfCombo('7s7h', '7d 7c 2h')).toBe('quads')
    expect(madeHandOfCombo('KsKh', 'Kd 7c 7h')).toBe('full-house')
    expect(madeHandOfCombo('As2s', 'Ks 7s 9s')).toBe('flush')
    expect(madeHandOfCombo('9d8c', 'Th Jh Qs')).toBe('straight')
    expect(madeHandOfCombo('7s7h', 'Kd 7c 2h')).toBe('set')
    expect(madeHandOfCombo('Kh7s', 'Kd 7c 2h')).toBe('two-pair')
    expect(madeHandOfCombo('AsAh', 'Kd 7c 2h')).toBe('overpair')
    expect(madeHandOfCombo('KhQs', 'Kd 7c 2h')).toBe('top-pair')
    expect(madeHandOfCombo('9s9h', 'Kd 7c 2h')).toBe('below-top-card')
    expect(madeHandOfCombo('Ah7s', 'Kd 7c 2h')).toBe('middle-pair')
    expect(madeHandOfCombo('5s5h', 'Kd 7c 2h')).toBe('below-second-card')
    expect(madeHandOfCombo('Qs2s', 'Kd 7c 2h')).toBe('bottom-pair')
    expect(madeHandOfCombo('Qs3d', 'Kd 7c 4h')).toBe('nothing')
    expect(madeHandOfCombo('As3d', 'Kd 7c 4h')).toBe('ace-high')
  })

  it('count a straight or a flush however it is made, though the Board makes it alone', () => {
    expect(madeHandOfCombo('3d2c', 'Ah Kd Qs Jc Ts')).toBe('straight')
    expect(madeHandOfCombo('3d2c', 'Ah Kh 9h 5h 4h')).toBe('flush')
  })

  it('put a pocket pair under the lowest card below the Board', () => {
    expect(madeHandOfCombo('3s3h', 'Kd 7c 4h')).toBe('below-board')
  })

  it('count neither a pair nor two pair the Board makes alone, as on Ks Kd 7c', () => {
    const board = 'Ks Kd 7c'
    expect(madeHandOfCombo('AhQh', board)).toBe('ace-high')
    expect(madeHandOfCombo('Qh9h', board)).toBe('nothing')
    expect(madeHandOfCombo('7h2d', board)).toBe('bottom-pair')
    expect(madeHandOfCombo('8h8d', board)).toBe('below-top-card')
    expect(madeHandOfCombo('5h5d', board)).toBe('below-board')
    expect(madeHandOfCombo('KhQd', board)).toBe('trips')
    expect(madeHandOfCombo('7h7d', board)).toBe('full-house')
    expect(madeHandOfCombo('KhKc', board)).toBe('quads')
    expect(madeHandOfCombo('Qh9h', 'Ks Kd 7c 7d')).toBe('nothing')
    expect(madeHandOfCombo('AhQh', 'Ks Kd Kc')).toBe('ace-high')
  })

  it('count the one-pair rungs over the Board\'s distinct ranks, on a turn too', () => {
    const turn = 'Kd 9c 6h 3s'
    expect(madeHandOfCombo('KsQs', turn)).toBe('top-pair')
    expect(madeHandOfCombo('As9s', turn)).toBe('middle-pair')
    expect(madeHandOfCombo('As6s', turn)).toBe('middle-pair')
    expect(madeHandOfCombo('As3h', turn)).toBe('bottom-pair')
    expect(madeHandOfCombo('TsTh', turn)).toBe('below-top-card')
    expect(madeHandOfCombo('8s8h', turn)).toBe('below-second-card')
    expect(madeHandOfCombo('4s4h', turn)).toBe('below-second-card')
    expect(madeHandOfCombo('2s2h', turn)).toBe('below-board')
    // A pair on the turn leaves three distinct ranks: K, 9, 6.
    expect(madeHandOfCombo('As6s', 'Kd 9c 6h 9s')).toBe('bottom-pair')
    expect(madeHandOfCombo('8s8h', 'Kd 9c 6h 9s')).toBe('below-second-card')
  })

  it('weight Combos by Frequency and share them over the live Combos', () => {
    const range = { AsAh: 100, AsAd: 50, KhQs: 100, KhQh: 50, QsJs: 100, KdQc: 100 }
    const rows = madeHands(range, ['Kd', '7c', '2h'])
    const row = (category: string) => rows.find((each) => each.category === category)

    // KdQc holds a Board card: not live.
    expect(row('overpair')).toEqual({ category: 'overpair', combos: 1.5, share: 37.5, members: ['AsAh', 'AsAd'] })
    expect(row('top-pair')).toEqual({ category: 'top-pair', combos: 1.5, share: 37.5, members: ['KhQh', 'KhQs'] })
    expect(row('nothing')).toEqual({ category: 'nothing', combos: 1, share: 25, members: ['QsJs'] })
  })

  it('add up to the live Combos', () => {
    const range = topRange(40)
    const board = ['Qh', 'Th', '4c', '4h']
    const rows = madeHands(range, board)

    const sum = rows.reduce((total, row) => total + row.combos, 0)
    expect(sum).toBeCloseTo(liveCombos(range, board))
    expect(rows.reduce((total, row) => total + row.share, 0)).toBeCloseTo(100)
    const members = rows.flatMap((row) => row.members)
    expect(new Set(members).size).toBe(members.length)
  })

  it('leave out those that cannot happen on the Board, keeping those the Range misses', () => {
    // No straight on K-7-4, nor a flush with three suits.
    const rows = madeHands({ AsAh: 100 }, ['Kd', '7c', '4h']).map((row) => row.category)

    expect(rows).toEqual([
      'set',
      'two-pair',
      'overpair',
      'top-pair',
      'below-top-card',
      'middle-pair',
      'below-second-card',
      'bottom-pair',
      'below-board',
      'ace-high',
      'nothing',
    ])
    // Any pocket pair fills up on trips.
    expect(madeHands({}, ['Ks', 'Kd', 'Kc']).map((row) => row.category)).toEqual(['quads', 'full-house', 'ace-high', 'nothing'])
  })

  it('leave out a pocket pair below the Board when the Board holds a deuce', () => {
    expect(madeHands({}, ['Kd', '7c', '2h']).map((row) => row.category)).not.toContain('below-board')
  })

  it('share nothing when no Combo is live', () => {
    expect(madeHands({ KdQc: 100 }, ['Kd', '7c', '2h']).every((row) => row.combos === 0 && row.share === 0)).toBe(true)
  })
})
