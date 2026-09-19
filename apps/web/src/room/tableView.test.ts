import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator'
import type { HandWithTimeline, TableState } from './hand'
import nineMaxSidePots from './fixtures/nine-max-side-pots.json'
import splitPot from './fixtures/split-pot.json'
import straddleFullHouse from './fixtures/straddle-full-house.json'
import { tableView } from './tableView'

const es = createTranslator('es')
const en = createTranslator('en')

const players = (
  ...rows: [string, number, number, boolean][]
): TableState['players'] =>
  rows.map(([screenName, stack, bet, folded]) => ({ screenName, stack, bet, folded, allIn: false, committed: 0 }))

/** What the tests on this Hand don't look at. */
const rest = { pots: [], effectiveStack: 1136, spr: null, result: null }

/** The first Actions of a real €0.05/€0.10 Hand, from the Hero's seat 5 at a 6-max table. */
const hand: HandWithTimeline = {
  id: 'hand-1',
  stake: { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
  tableSize: 6,
  timeline: {
    seats: [
      { seat: 1, screenName: 'Alder239', position: 'SB', startingStack: 1136 },
      { seat: 2, screenName: 'BIRCHWOODS', position: 'BB', startingStack: 1204 },
      { seat: 3, screenName: 'Cedar31lse', position: 'CO', startingStack: 1110 },
      { seat: 5, screenName: 'iMapleAA', position: 'BTN', startingStack: 1000 },
    ],
    buttonSeat: 5,
    hero: { screenName: 'iMapleAA', cards: ['Js', '8s'] },
    states: [
      {
        street: 'preflop',
        board: [],
        pot: 15,
        toAct: 'Cedar31lse',
        action: null,
        ...rest,
        players: players(
          ['Alder239', 1131, 5, false],
          ['BIRCHWOODS', 1194, 10, false],
          ['Cedar31lse', 1110, 0, false],
          ['iMapleAA', 1000, 0, false],
        ),
      },
      {
        street: 'preflop',
        board: [],
        pot: 15,
        toAct: 'iMapleAA',
        action: { street: 'preflop', screenName: 'Cedar31lse', type: 'fold', allIn: false },
        ...rest,
        players: players(
          ['Alder239', 1131, 5, false],
          ['BIRCHWOODS', 1194, 10, false],
          ['Cedar31lse', 1110, 0, true],
          ['iMapleAA', 1000, 0, false],
        ),
      },
      {
        street: 'preflop',
        board: [],
        pot: 45,
        toAct: 'Alder239',
        action: { street: 'preflop', screenName: 'iMapleAA', type: 'raise', amount: 20, to: 30, allIn: false },
        ...rest,
        players: players(
          ['Alder239', 1131, 5, false],
          ['BIRCHWOODS', 1194, 10, false],
          ['Cedar31lse', 1110, 0, true],
          ['iMapleAA', 970, 30, false],
        ),
      },
      {
        street: 'flop',
        board: ['2c', '10h', '4c'],
        pot: 65,
        toAct: 'BIRCHWOODS',
        action: { street: 'preflop', screenName: 'BIRCHWOODS', type: 'call', amount: 20, allIn: false },
        ...rest,
        players: players(
          ['Alder239', 1131, 0, true],
          ['BIRCHWOODS', 1174, 0, false],
          ['Cedar31lse', 1110, 0, true],
          ['iMapleAA', 970, 0, false],
        ),
      },
    ],
    showdown: false,
  },
}

describe('tableView', () => {
  it('draws the Hero at the bottom centre and the others clockwise by seat, leaving empty seats empty', () => {
    const view = tableView(hand, 0, es)

    expect(view.slots).toBe(6)
    expect(view.seats.map((seat) => [seat.screenName, seat.slot])).toEqual([
      ['iMapleAA', 0],
      ['Alder239', 2],
      ['BIRCHWOODS', 3],
      ['Cedar31lse', 4],
    ])
  })

  it('shows each seat’s Position and Stack in big blinds, in the UI language', () => {
    const seats = tableView(hand, 0, es).seats

    expect(seats.map((seat) => [seat.position, seat.stack])).toEqual([
      ['BTN', '100 BB'],
      ['SB', '113,1 BB'],
      ['BB', '119,4 BB'],
      ['CO', '111 BB'],
    ])
    expect(tableView(hand, 0, en).seats[1].stack).toBe('113.1 BB')
  })

  it('starts at the Initial State with the blinds in front of the players who posted them', () => {
    const view = tableView(hand, 0, es)

    expect(view.seats.map((seat) => seat.chip?.label ?? null)).toEqual([null, '0,5 BB', '1 BB', null])
    expect(view.pot).toBe('1,5 BB')
    expect(view.lastAction).toBe('Ciegas puestas')
  })

  it('marks the dealer button, who is to act and the Hero, and shows only the Hero’s cards', () => {
    const view = tableView(hand, 0, es)

    expect(view.seats.filter((seat) => seat.dealer).map((seat) => seat.screenName)).toEqual(['iMapleAA'])
    expect(view.seats.filter((seat) => seat.toAct).map((seat) => seat.screenName)).toEqual(['Cedar31lse'])
    expect(view.seats.map((seat) => [seat.hero, seat.cards])).toEqual([
      [true, ['Js', '8s']],
      [false, null],
      [false, null],
      [false, null],
    ])
  })

  it('dims folded players rather than removing them', () => {
    const view = tableView(hand, 1, es)

    expect(view.seats.map((seat) => [seat.screenName, seat.folded])).toEqual([
      ['iMapleAA', false],
      ['Alder239', false],
      ['BIRCHWOODS', false],
      ['Cedar31lse', true],
    ])
  })

  it('shows the community cards dealt so far, with empty slots for the rest', () => {
    expect(tableView(hand, 2, es).board).toEqual([null, null, null, null, null])
    expect(tableView(hand, 3, es).board).toEqual(['2c', '10h', '4c', null, null])
  })

  it('says which Action this is, out of the Hand’s Actions, and what it was', () => {
    const view = tableView(hand, 2, es)

    expect([view.actionIndex, view.actionCount]).toEqual([2, 3])
    expect(view.lastAction).toBe('Preflop · iMapleAA sube a 3 BB')
    expect(tableView(hand, 3, en).lastAction).toBe('Preflop · BIRCHWOODS calls 2 BB')
    expect(tableView(hand, 1, en).lastAction).toBe('Preflop · Cedar31lse folds')
  })

  it('lets Playback go back only after the Initial State and forward only before the last Action', () => {
    expect(tableView(hand, 0, es)).toMatchObject({ canGoBack: false, canGoForward: true })
    expect(tableView(hand, 2, es)).toMatchObject({ canGoBack: true, canGoForward: true })
    expect(tableView(hand, 3, es)).toMatchObject({ canGoBack: true, canGoForward: false })
  })
})

/*
 * Real Timelines, as the server computes them for Hands in its fixture
 * corpus ($0.25/$0.50 and €0.05/€0.10).
 */
const straddled = straddleFullHouse as HandWithTimeline
const nineMax = nineMaxSidePots as HandWithTimeline
const split = splitPot as HandWithTimeline

describe('tableView: pots and bets', () => {
  it('separates the pot gathered from earlier Streets from what is in play on this one', () => {
    // Flop: Olive6 checks, Hero6 bets $4.50 into $9.75.
    const view = tableView(straddled, 10, es)

    expect(view.pot).toBe('28,5 BB')
    expect(view.potDetail).toBe('19,5 BB + 9 BB en juego')
    expect(view.sidePots).toBeNull()
    expect(tableView(straddled, 10, en).potDetail).toBe('19.5 BB + 9 BB in play')
  })

  const chips = (index: number) =>
    Object.fromEntries(tableView(straddled, index, es).seats.map((seat) => [seat.screenName, seat.chip]))
  const moves = (index: number, i18n = es) =>
    Object.fromEntries(tableView(straddled, index, i18n).seats.map((seat) => [seat.screenName, seat.move]))

  it('puts chips in front of a bet, with its share of the pot it went into, and none for a check', () => {
    expect(chips(10)).toMatchObject({
      Hero6: { kind: 'bet', label: '9 BB', potShare: '46% bote' },
      Olive6: null,
    })
    // Olive6 raises to $15 into $14.25; Hero6's bet keeps the share it was made with.
    expect(chips(11)).toMatchObject({
      Hero6: { kind: 'bet', label: '9 BB', potShare: '46% bote' },
      Olive6: { kind: 'bet', label: '30 BB', potShare: '105% bote' },
    })
  })

  it('names what each player did on this Street next to them, a check included', () => {
    expect(moves(10)).toMatchObject({ Olive6: 'PASA', Hero6: 'APUESTA' })
    expect(moves(11, en)).toMatchObject({ Olive6: 'RAISE', Hero6: 'BET' })
    // Blinds are posted, not played; the straddle hasn't acted yet.
    expect(moves(0)).toEqual({ Birch1: null, Cedar2: null, Hero6: null, Larch4: null, Maple5: null, Olive6: null })
  })

  it('shows the call that closes a Street with both bets still in front, then deals the next Street with the bets in the pot', () => {
    // Hero6 calls the flop raise.
    expect(chips(12)).toMatchObject({
      Hero6: { kind: 'bet', label: '30 BB', potShare: null },
      Olive6: { kind: 'bet', label: '30 BB', potShare: '105% bote' },
    })
    expect(moves(12)).toMatchObject({ Hero6: 'IGUALA', Olive6: 'SUBE' })
    expect(tableView(straddled, 12, es).board).toEqual(['9d', '5c', '2h', null, null])

    // The turn is dealt: nothing in front of anyone, nobody has moved yet.
    const turn = tableView(straddled, 13, es)
    expect(turn.board).toEqual(['9d', '5c', '2h', 'Jc', null])
    expect(turn.seats.map((seat) => [seat.chip, seat.move])).toEqual(turn.seats.map(() => [null, null]))
    expect(turn.pot).toBe('79,5 BB')
    expect(turn.potDetail).toBeNull()
  })

  it('counts only Actions, not the Streets dealt or the end of the Hand', () => {
    const count = (index: number) => {
      const view = tableView(straddled, index, es)
      return [view.actionNumber, view.actionCount, view.lastAction]
    }

    expect(count(7)).toEqual([7, 13, 'Preflop · Cedar2 se retira'])
    expect(count(8)).toEqual([7, 13, 'Flop · se reparte'])
    expect(count(17)).toEqual([13, 13, 'Showdown · fin de la mano'])
    expect(tableView(straddled, 8, en).lastAction).toBe('Flop · dealt')
  })

  it('sizes bets and raises against the pot, not calls', () => {
    // Oak_BB has just moved all in; Hero9max called Elm_UTG's all-in before that.
    const hero = tableView(nineMax, 9, es).seats.find((seat) => seat.screenName === 'Hero9max')!

    expect(hero.chip).toEqual({ kind: 'bet', label: '19,9 BB', potShare: null })
  })

  it('shows blinds and a straddle without a share of the pot', () => {
    const view = tableView(straddled, 0, es)

    expect(view.seats.filter((seat) => seat.chip).map((seat) => [seat.screenName, seat.chip])).toEqual([
      ['Larch4', { kind: 'bet', label: '0,5 BB', potShare: null }],
      ['Maple5', { kind: 'bet', label: '1 BB', potShare: null }],
      ['Olive6', { kind: 'bet', label: '2 BB', potShare: null }],
    ])
  })

  it('draws an all-in bet in red, always with its amount, and says the player is all in', () => {
    // Turn: Olive6 bets her last $31.
    const olive = tableView(straddled, 14, es).seats.find((seat) => seat.screenName === 'Olive6')!

    expect(olive.chip).toEqual({ kind: 'all-in', label: 'all-in 62 BB', potShare: null })
    expect(olive.stack).toBe('0 BB')
    expect(olive.allInLabel).toBe('all-in 100 BB')
  })

  it('shows side pots apart, each with who contests it', () => {
    const view = tableView(nineMax, nineMax.timeline.states.length - 1, es)

    expect(view.pot).toBe('311 BB')
    expect(view.potDetail).toBeNull()
    expect(view.sidePots).toEqual([
      { label: 'BOTE PRINCIPAL', amount: '81 BB', contestants: '4 jugadores' },
      { label: 'BOTE LATERAL 1', amount: '90 BB', contestants: '3 jugadores' },
      { label: 'BOTE LATERAL 2', amount: '140 BB', contestants: 'Hero9max vs Spruce9' },
    ])
  })

  it('gathers antes into the pot before the first Action, with the blinds in play', () => {
    expect(tableView(nineMax, 0, es).potDetail).toBe('0,9 BB + 1,5 BB en juego')
    expect(tableView(nineMax, 0, en).pot).toBe('2.4 BB')
  })
})

describe('tableView: the log of the current Street', () => {
  it('lists this Street’s Actions, highlighting the latest, then who is to act, with SPR and the effective stack', () => {
    expect(tableView(straddled, 10, es).log).toEqual({
      label: 'Flop',
      entries: [
        { text: 'Olive6 pasa', tone: 'past' },
        { text: 'Hero6 apuesta 9 BB', tone: 'latest' },
        { text: 'Olive6 · pendiente', tone: 'pending' },
      ],
      aside: 'SPR 4,7 · efectivo 92 BB',
    })
  })

  it('starts a new Street with nobody having acted yet', () => {
    // The flop is dealt.
    expect(tableView(straddled, 8, en).log).toEqual({
      label: 'Flop',
      entries: [{ text: 'Olive6 · to act', tone: 'pending' }],
      aside: 'SPR 4.7 · effective 92 BB',
    })
  })

  it('gives only the effective stack preflop', () => {
    expect(tableView(nineMax, 0, es).log).toEqual({
      label: 'Preflop',
      entries: [{ text: 'Elm_UTG · pendiente', tone: 'pending' }],
      // Spruce9's $60 less the ante.
      aside: 'efectivo 119,9 BB',
    })
  })

  it('ends at Showdown with the cards shown, who won and the pots', () => {
    const last = nineMax.timeline.states.length - 1

    expect(tableView(nineMax, last, es).log).toEqual({
      label: 'Showdown',
      entries: [
        { text: 'Oak_BB muestra Q♠Q♣', tone: 'past' },
        { text: 'Elm_UTG muestra K♠K♦', tone: 'past' },
        { text: 'Spruce9 muestra A♣Q♦', tone: 'past' },
        { text: 'Elm_UTG gana 79 BB', tone: 'winner' },
        { text: 'Hero9max gana 226 BB', tone: 'winner' },
      ],
      aside: 'Bote 81 BB + 90 BB + 140 BB laterales',
    })
    expect(tableView(straddled, 17, en).log.aside).toBe('Pot 203.5 BB')
  })
})

describe('tableView: Showdown', () => {
  const last = (hand: HandWithTimeline) => hand.timeline.states.length - 1
  const seat = (hand: HandWithTimeline, name: string, i18n = es) =>
    tableView(hand, last(hand), i18n).seats.find((s) => s.screenName === name)!

  it('keeps opponents’ cards face down until Showdown', () => {
    expect(tableView(straddled, 16, es).seats.map((s) => [s.screenName, s.cards])).toContainEqual(['Olive6', null])
  })

  it('turns the shown cards face up, labelled with each made hand in the UI language', () => {
    expect(seat(straddled, 'Olive6')).toMatchObject({
      cards: ['Jh', 'Js'],
      revealed: true,
      winner: true,
      outcome: 'Full de jotas y cincos · gana 197,5 BB',
      netResult: '+97,5 BB',
      stack: '197,5 BB',
    })
    expect(seat(straddled, 'Hero6')).toMatchObject({
      cards: ['9s', '9h'],
      winner: false,
      outcome: 'Full de nueves y cincos',
      netResult: null,
      allInLabel: 'all-in 100 BB',
    })
    expect(seat(straddled, 'Olive6', en).outcome).toBe('Full house, jacks over fives · wins 197.5 BB')
  })

  it('outlines the cards that make each winning hand, on the board as well', () => {
    expect(tableView(straddled, last(straddled), es).winningCards).toEqual(['Jh', 'Js', 'Jc', '5c', '5h'])
    // Elm_UTG wins the main pot and Hero9max both side pots.
    expect(tableView(nineMax, last(nineMax), es).winningCards).toEqual(['Ks', 'Kd', 'Kh', 'Ah', 'Ad'])
  })

  it('states how much each winner takes from each pot, after rake, and what the rake kept', () => {
    expect(tableView(nineMax, last(nineMax), es).payout).toEqual({
      pots: [
        { label: 'Principal', amount: '79 BB', winners: ['Elm_UTG gana 79 BB'] },
        { label: 'Lateral 1', amount: '88 BB', winners: ['Hero9max gana 88 BB'] },
        { label: 'Lateral 2', amount: '138 BB', winners: ['Hero9max gana 138 BB'] },
      ],
      rake: 'Rake 6 BB',
    })
    expect(tableView(split, last(split), en).payout).toEqual({
      pots: [{ label: 'Pot', amount: '59.5 BB', winners: ['Hero4 wins 29.8 BB', 'Aspen1 wins 29.7 BB'] }],
      rake: 'Rake 1 BB',
    })
    expect(tableView(nineMax, 3, es).payout).toBeNull()
  })

  it('keeps a mucked hand face down', () => {
    expect(seat(split, 'Willow4')).toMatchObject({ cards: null, outcome: null, winner: false })
  })

  it('names every kind of made hand', () => {
    const label = (category: string, ranks: string[], cards: string[] = []) => {
      const hand = structuredClone(straddled)
      hand.timeline.states.at(-1)!.result!.revealed[1].madeHand = { category, ranks, cards } as never
      return [seat(hand, 'Olive6', es).outcome, seat(hand, 'Olive6', en).outcome]
    }

    expect(label('high-card', ['A'])[0]).toBe('Carta alta: as · gana 197,5 BB')
    expect(label('pair', ['10'])).toEqual(['Pareja de dieces · gana 197,5 BB', 'Pair of tens · wins 197.5 BB'])
    expect(label('two-pair', ['K', '7'])[0]).toBe('Dobles parejas de reyes y sietes · gana 197,5 BB')
    expect(label('three-of-a-kind', ['2'])[1]).toBe('Three of a kind, twos · wins 197.5 BB')
    expect(label('straight', ['10'])).toEqual(['Escalera de seis a diez · gana 197,5 BB', 'Straight, six to ten · wins 197.5 BB'])
    expect(label('straight', ['5'])[0]).toBe('Escalera de as a cinco · gana 197,5 BB')
    expect(label('flush', ['A'], ['As', 'Qs', '9s', '7s', '2s'])).toEqual([
      'Color de picas · gana 197,5 BB',
      'Flush, ace high · wins 197.5 BB',
    ])
    expect(label('four-of-a-kind', ['Q'])[0]).toBe('Póker de damas · gana 197,5 BB')
    expect(label('straight-flush', ['9'])[1]).toBe('Straight flush, five to nine · wins 197.5 BB')
    expect(label('straight-flush', ['A'])).toEqual(['Escalera real · gana 197,5 BB', 'Royal flush · wins 197.5 BB'])
  })
})
