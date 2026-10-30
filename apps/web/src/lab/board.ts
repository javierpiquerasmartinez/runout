/*
 * The Analysis's Board: a flop, a turn or a river, and the Combos of a Range
 * it removes. Pure: no React, no I/O, beside the range module. Cards are
 * written as the Lab writes Combos: rank then suit, tens as `T`, as `Th`.
 */

import { RANKS, SUITS, type HandClass, type Range } from './range'

/** The 52 cards in the picker's order: one row per suit, from aces down. */
export const DECK: readonly string[] = [...SUITS].flatMap((suit) => [...RANKS].map((rank) => rank + suit))

/** How many cards a Board may hold: none, a flop, a turn or a river. */
const BOARD_SIZES: readonly number[] = [0, 3, 4, 5]

/** The cards a flop deals. */
export const FLOP_CARDS = 3

/** The most cards a Board holds. */
export const MAX_BOARD_CARDS = 5

/** Why a text is not a Board. */
export type BoardProblem = { kind: 'unknown'; piece: string } | { kind: 'repeated'; card: string } | { kind: 'size'; count: number }

/** A text's Board, or what is wrong with it. */
export type ParsedBoard = { board: string[] } | { problem: BoardProblem }

/** One card, from its rank (`10` for a ten) and suit in any case. */
const CARD = /^(10|[2-9tjqka])([shdc])/i

/** The cards a text names, in order, without checking how many there are. */
function cardsOf(text: string): ParsedBoard {
  const cards: string[] = []
  for (const chunk of text.split(/[\s,]+/)) {
    for (let rest = chunk; rest !== ''; ) {
      const match = CARD.exec(rest)
      if (!match) return { problem: { kind: 'unknown', piece: rest.slice(0, 2) } }
      const card = (match[1] === '10' ? 'T' : match[1].toUpperCase()) + match[2].toLowerCase()
      if (cards.includes(card)) return { problem: { kind: 'repeated', card } }
      cards.push(card)
      rest = rest.slice(match[0].length)
    }
  }
  return { board: cards }
}

/** A Board from text such as `Ah7d2c`: known cards, none repeated, and none, three, four or five of them. */
export function parseBoard(text: string): ParsedBoard {
  const parsed = cardsOf(text)
  if ('problem' in parsed) return parsed
  const count = parsed.board.length
  return BOARD_SIZES.includes(count) ? parsed : { problem: { kind: 'size', count } }
}

/**
 * The cards picked so far, as an address writes them: a Board, or a flop still
 * being filled. Text that is neither picks none.
 */
export function readBoardCards(text: string): string[] {
  const parsed = cardsOf(text)
  return 'board' in parsed && parsed.board.length <= MAX_BOARD_CARDS ? parsed.board : []
}

/** The cards as one text, as `Ah7d2c`; `parseBoard` reads it back. */
export function formatBoard(cards: readonly string[]): string {
  return cards.join('')
}

/** The cards with this one taken off if it is among them, or else added after them while there is room. */
export function toggleCard(cards: readonly string[], card: string): string[] {
  if (cards.includes(card)) return cards.filter((each) => each !== card)
  return cards.length < MAX_BOARD_CARDS ? [...cards, card] : [...cards]
}

/** A card dealt at random from those not in use. */
function dealOne(inUse: readonly string[], random: () => number): string {
  const left = DECK.filter((card) => !inUse.includes(card))
  return left[Math.floor(random() * left.length)]
}

/** A random flop, never dealing a card kept out (the Dead Cards). */
export function randomFlop(random: () => number, keptOut: readonly string[] = []): string[] {
  const flop: string[] = []
  while (flop.length < FLOP_CARDS) flop.push(dealOne([...keptOut, ...flop], random))
  return flop
}

/** The Board with the next card, the turn or the river, dealt at random; a flop unfinished or a full Board is left as it is. */
export function withRandomCard(board: readonly string[], random: () => number, keptOut: readonly string[] = []): string[] {
  if (board.length < FLOP_CARDS || board.length >= MAX_BOARD_CARDS) return [...board]
  return [...board, dealOne([...keptOut, ...board], random)]
}

/** Whether a Combo, as `AhKd`, can still be dealt with these cards out of the deck. */
function isLive(combo: string, board: readonly string[]): boolean {
  return !board.includes(combo.slice(0, 2)) && !board.includes(combo.slice(2))
}

/** How many of a Hand Class's Combos hold one of the Board's cards. */
export function removedCombos(handClass: HandClass, board: readonly string[]): number {
  return handClass.combos.filter((combo) => !isLive(combo, board)).length
}

/** The Range's Combos the Board leaves possible, each counted by its Frequency. */
export function liveCombos(range: Range, board: readonly string[]): number {
  let combos = 0
  for (const [combo, frequency] of Object.entries(range)) if (isLive(combo, board)) combos += frequency / 100
  return combos
}
