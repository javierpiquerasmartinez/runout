import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator'
import type { HandWithTimeline, TableState } from './hand'
import { tableView } from './tableView'

const es = createTranslator('es')
const en = createTranslator('en')

const players = (
  ...rows: [string, number, number, boolean][]
): TableState['players'] => rows.map(([screenName, stack, bet, folded]) => ({ screenName, stack, bet, folded }))

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

    expect(view.seats.map((seat) => seat.bet)).toEqual([null, '0,5 BB', '1 BB', null])
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
