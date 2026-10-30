import { describe, expect, it } from 'vitest'
import {
  DECK,
  formatBoard,
  liveCombos,
  parseBoard,
  readBoardCards,
  removedCombos,
  withRandomCard,
  randomFlop,
  toggleCard,
} from './board'
import { HAND_CLASS_BY_NAME } from './range'

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
