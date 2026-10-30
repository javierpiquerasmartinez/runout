/*
 * The Analysis's Board: a flop, a turn or a river, and the Combos of a Range
 * it removes. Pure: no React, no I/O, beside the range module. Cards are
 * written as the Lab writes Combos: rank then suit, tens as `T`, as `Th`.
 */

import { cardCode, categoryOf, strength, type HandCategory } from '@runout/poker'
import { HAND_CLASSES, RANKS, SUITS, type HandClass, type Range } from './range'

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

/**
 * The Made Hands, best first: Flopzilla Pro's, plus classic Flopzilla's ace
 * high. Each live Combo is in exactly one, its best.
 */
export const MADE_HANDS = [
  'straight-flush',
  'quads',
  'full-house',
  'flush',
  'straight',
  'set',
  'trips',
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
] as const
export type MadeHand = (typeof MADE_HANDS)[number]

/** A Category's row: the Combos of the Range in it. */
export interface CategoryRow<Category> {
  category: Category
  /** Its Combos, each counted by its Frequency. */
  combos: number
  /** That, as a share of the live Combos, from 0 to 100; 0 when none are live. */
  share: number
  /** The Range's live Combos in it, as `AhKd`. */
  members: string[]
}

/** The Made Hands the evaluator names whatever the Combo's cards add. */
const MADE_BY_EVALUATOR: Partial<Record<HandCategory, MadeHand>> = {
  'straight-flush': 'straight-flush',
  'four-of-a-kind': 'quads',
  'full-house': 'full-house',
  flush: 'flush',
  straight: 'straight',
}

/** A card as the evaluator writes it: tens as `10`. */
function evaluatorCode(card: string): number {
  return cardCode(card[0] === 'T' ? `10${card[1]}` : card)
}

/** How high a rank is: the deuce 0, the ace 12. */
function rankValue(card: string): number {
  return RANKS.length - 1 - RANKS.indexOf(card[0])
}

/**
 * A Combo's Made Hand on a Board of three to five cards. A pair or two pair the
 * Board makes alone does not count: below a straight, only what the Combo's
 * own cards pair counts.
 */
function madeHandOf(combo: string, board: readonly string[]): MadeHand {
  const cards = [combo.slice(0, 2), combo.slice(2), ...board]
  const byEvaluator = MADE_BY_EVALUATOR[categoryOf(strength(cards.map(evaluatorCode)))]
  if (byEvaluator) return byEvaluator

  const [first, second] = [rankValue(cards[0]), rankValue(cards[1])]
  const onBoard = (rank: number) => board.filter((card) => rankValue(card) === rank).length
  // The Board's distinct ranks, from the highest down.
  const ranks = [...new Set(board.map(rankValue))].sort((a, b) => b - a)
  const [top, lowest] = [ranks[0], ranks[ranks.length - 1]]

  if (first === second) {
    if (onBoard(first) > 0) return 'set'
    if (first > top) return 'overpair'
    if (ranks.length > 1 && first > ranks[1]) return 'below-top-card'
    if (first > lowest) return 'below-second-card'
    return 'below-board'
  }
  const paired = [first, second].filter((rank) => onBoard(rank) > 0)
  if (paired.length === 2) return 'two-pair'
  if (paired.length === 1) {
    const [rank] = paired
    if (onBoard(rank) > 1) return 'trips'
    if (rank === top) return 'top-pair'
    if (rank === lowest) return 'bottom-pair'
    return 'middle-pair'
  }
  return combo[0] === 'A' ? 'ace-high' : 'nothing'
}

/**
 * How the Range hits the Board, as the Made Hands that can happen on it, best
 * first: one that no Combo left in the deck can make is left out. None preflop,
 * nor while the flop is still being picked.
 */
export function madeHands(range: Range, board: readonly string[]): CategoryRow<MadeHand>[] {
  if (board.length < FLOP_CARDS) return []
  const rows = new Map<MadeHand, CategoryRow<MadeHand>>()
  for (const handClass of HAND_CLASSES) {
    for (const combo of handClass.combos) {
      if (!isLive(combo, board)) continue
      const madeHand = madeHandOf(combo, board)
      const row = rows.get(madeHand) ?? { category: madeHand, combos: 0, share: 0, members: [] }
      rows.set(madeHand, row)
      const frequency = range[combo] ?? 0
      if (frequency === 0) continue
      row.combos += frequency / 100
      row.members.push(combo)
    }
  }
  const live = liveCombos(range, board)
  return MADE_HANDS.flatMap((madeHand) => {
    const row = rows.get(madeHand)
    return row ? [{ ...row, share: live > 0 ? (row.combos / live) * 100 : 0 }] : []
  })
}
