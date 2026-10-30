import { describe, expect, it } from 'vitest'
import {
  combinationDraws,
  DECK,
  draws,
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

/** The Draws a lone Combo has on this Board, as `AhKd` on `Ks Kd 7c`, in the table's order. */
function drawsOfCombo(combo: string, board: string, options?: { oneCardBackdoors: boolean }): string[] {
  return draws({ [combo]: 100 }, board.split(' '), options)
    .filter((row) => row.combos > 0)
    .map((row) => row.category)
}

describe('Draws', () => {
  it('count four to a flush with one or both of the Combo\'s cards as a flush draw', () => {
    expect(drawsOfCombo('AhKh', 'Qh 7h 2c')).toContain('flush-draw')
    expect(drawsOfCombo('AhKd', 'Qh 7h 2h')).toContain('flush-draw')
    expect(drawsOfCombo('AsKd', 'Qh 7h 2h 3h')).not.toContain('flush-draw')
  })

  it('never count a draw to what the Combo already makes, though a made straight can be a flush draw', () => {
    // A flush on the turn, with a fifth heart.
    expect(drawsOfCombo('AhKh', 'Qh 7h 2h 3c')).not.toContain('flush-draw')
    expect(drawsOfCombo('Jh9h', 'Th 8h 7c')).toContain('flush-draw')
  })

  it('tell an open-ended straight draw, eight outs, from a gutshot, four, by how many of the Combo\'s cards it needs', () => {
    expect(drawsOfCombo('9s8d', 'Th 7c 2d')).toEqual(['open-ended-two-cards'])
    expect(drawsOfCombo('As8d', 'Th 9c 7d')).toEqual(['open-ended-one-card'])
    expect(drawsOfCombo('9s7d', 'Jh 8c 2d')).toEqual(['gutshot-two-cards'])
    expect(drawsOfCombo('As7d', 'Jh 9c 8d')).toEqual(['gutshot-one-card'])
    // A wheel draw counts the ace low.
    expect(drawsOfCombo('As3d', 'Kh 5c 4d')).toEqual(['gutshot-two-cards'])
    // A double gutshot has eight outs too.
    expect(drawsOfCombo('Js8d', '9h 7c 5d')).toEqual(['open-ended-two-cards'])
  })

  it('always use one of the Combo\'s cards: A2 on 9-8-7 draws to no straight', () => {
    expect(drawsOfCombo('As2d', '9h 8c 7d')).toEqual([])
    // The turn makes 9-8-7-6: the 5 and the ten are the Board's outs, not the Combo's.
    expect(drawsOfCombo('Ks2d', '9h 8c 7d 6s')).toEqual([])
    expect(drawsOfCombo('Ts2d', '9h 8c 7d 3s')).toEqual(['open-ended-one-card'])
    // The 5 gives 4-5-6-7-8, but the Board and the 5 make 5-9 for everyone: no draw.
    expect(drawsOfCombo('4c2d', '6h 7s 8d 9c')).toEqual([])
    expect(drawsOfCombo('3c2d', '5h 6s 7d 8c')).toEqual([])
    // The 9 gives the ten a higher straight than the Board's.
    expect(drawsOfCombo('Tc2d', '5h 6s 7d 8c')).toEqual(['gutshot-one-card'])
  })

  it('draw to no straight with one made, though a better one could come', () => {
    expect(drawsOfCombo('9s8d', 'Th 7c 6d')).toEqual([])
  })

  it('count overcards: both of the Combo\'s cards above the Board\'s highest, with no pair', () => {
    expect(drawsOfCombo('AsKd', 'Qh 7c 2d')).toEqual(['overcards'])
    expect(drawsOfCombo('AsQd', 'Qh 7c 2d')).toEqual([])
    expect(drawsOfCombo('AsAd', 'Qh 7c 2d')).toEqual([])
    expect(drawsOfCombo('AsJd', 'Qh 7c 2d')).toEqual([])
  })

  it('count a two-card backdoor flush draw on the flop, and the one-card one only when switched on', () => {
    expect(drawsOfCombo('As5s', 'Kh 7s 2d')).toEqual(['backdoor-two-cards'])
    expect(drawsOfCombo('As5d', 'Kh 7s 2s')).toEqual([])
    expect(drawsOfCombo('As5d', 'Kh 7s 2s', { oneCardBackdoors: true })).toEqual(['backdoor-one-card'])
    // A flush draw is past a backdoor one.
    expect(drawsOfCombo('As5s', 'Ks 7s 2d', { oneCardBackdoors: true })).toEqual(['flush-draw'])
  })

  it('are none on the river, and no backdoors on the turn', () => {
    expect(draws({ AhKh: 100 }, ['Qh', '7h', '2c', '3d', '9s'])).toEqual([])
    expect(drawsOfCombo('As5s', 'Kh 7s 2d 9c', { oneCardBackdoors: true })).toEqual([])
    expect(draws({}, ['Kh', '7s', '2d', '9c'], { oneCardBackdoors: true }).map((row) => row.category)).not.toContain(
      'backdoor-two-cards',
    )
  })
})

/** The combination Draws a lone Combo has on this Board. */
function combinationDrawsOfCombo(combo: string, board: string): string[] {
  return combinationDraws({ [combo]: 100 }, board.split(' '))
    .filter((row) => row.combos > 0)
    .map((row) => row.category)
}

describe('Draws on a Board', () => {
  const categories = (rows: { category: string }[]) => rows.map((row) => row.category)

  it('leave out those the Board does not allow, keeping those the Range misses', () => {
    // No flush draw on a rainbow flop, and the one-card backdoor only when switched on.
    expect(categories(draws({}, ['Th', '9s', '7d']))).toEqual([
      'open-ended-two-cards',
      'open-ended-one-card',
      'gutshot-two-cards',
      'gutshot-one-card',
      'overcards',
      'backdoor-two-cards',
    ])
    // K-7-2 rainbow is too far apart for a straight draw, and nothing but aces is above a king.
    expect(categories(draws({}, ['Kh', '7s', '2d']))).toEqual(['backdoor-two-cards'])
    // A monotone flop leaves no room for a backdoor with both cards.
    expect(categories(draws({}, ['Kh', '7h', '2h'], { oneCardBackdoors: true }))).not.toContain('backdoor-two-cards')
    // Nothing is above an ace.
    expect(categories(draws({}, ['Ah', '7s', '2d']))).not.toContain('overcards')
  })

  it('weight Combos by Frequency and share them over the live Combos, a Combo counting in each it has', () => {
    const range = { AhKh: 100, AhKd: 50, QhJh: 50, AsAh: 100 }
    const rows = draws(range, ['Th', '7h', '2c'])
    const row = (category: string) => rows.find((each) => each.category === category)

    expect(row('flush-draw')).toEqual({ category: 'flush-draw', combos: 1.5, share: 50, members: ['AhKh', 'QhJh'] })
    expect(row('overcards')).toEqual({ category: 'overcards', combos: 2, share: (2 / 3) * 100, members: ['AhKh', 'AhKd', 'QhJh'] })
    expect(combinationDraws(range, ['Th', '7h', '2c']).find((each) => each.category === 'flush-draw-overcards')?.combos).toBe(1.5)
  })
})

describe('combination Draws', () => {
  it('count a pair with a flush draw in its pair, in flush draw and in flush draw + pair', () => {
    expect(madeHandOfCombo('Ah2h', 'Kh 7h 2c')).toBe('bottom-pair')
    expect(drawsOfCombo('Ah2h', 'Kh 7h 2c')).toEqual(['flush-draw'])
    expect(combinationDrawsOfCombo('Ah2h', 'Kh 7h 2c')).toEqual(['flush-draw-pair'])
  })

  it('combine a flush draw with a straight draw or overcards, and a straight draw with a pair', () => {
    expect(combinationDrawsOfCombo('Jh8h', 'Th 9h 2c')).toEqual(['flush-draw-open-ended'])
    expect(combinationDrawsOfCombo('Th7h', 'Jh 9h 2c')).toEqual(['flush-draw-gutshot'])
    expect(combinationDrawsOfCombo('AhKh', 'Th 7h 2c')).toEqual(['flush-draw-overcards'])
    expect(combinationDrawsOfCombo('Ts9s', '9h 8c 7d')).toEqual(['open-ended-pair'])
    expect(combinationDrawsOfCombo('9s8s', 'Jh 8c 7d')).toEqual(['gutshot-pair'])
  })

  it('take "+ pair" as a one-pair Made Hand, not two pair or a set', () => {
    expect(combinationDrawsOfCombo('7h2h', 'Kh 7c 2d 5h')).toEqual([])
    expect(combinationDrawsOfCombo('7s7h', 'Kh 7c 2h 5h')).toEqual([])
    expect(combinationDrawsOfCombo('AsAh', 'Kh 7c 2h 5h')).toEqual(['flush-draw-pair'])
  })

  it('are none on the river', () => {
    expect(combinationDraws({ Ah2h: 100 }, ['Kh', '7h', '2c', '9s', '3d'])).toEqual([])
  })
})
