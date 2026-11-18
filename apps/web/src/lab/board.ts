/*
 * The Analysis's Board: a flop, a turn or a river, the Dead Cards beside it,
 * and the Combos of a Range they remove. Pure: no React, no I/O, beside the range module. Cards are
 * written as the Lab writes Combos: rank then suit, tens as `T`, as `Th`.
 */

import {
  cardCode,
  COMBINATION_DRAWS,
  comboCombinationDraws,
  comboDraws,
  comboMadeHand,
  DRAWS,
  MADE_HANDS,
  strength,
  type CombinationDrawCategory,
  type DrawCategory,
  type DrawOptions,
  type MadeHandCategory,
} from '@runout/poker'
import { HAND_CLASSES, RANKS, SUITS, type HandClass, type Range } from './range'

/** The 52 cards in the picker's order: one row per suit, from aces down. */
export const DECK: readonly string[] = [...SUITS].flatMap((suit) => [...RANKS].map((rank) => rank + suit))

/** How many cards a Board may hold: none, a flop, a turn or a river. */
const BOARD_SIZES: readonly number[] = [0, 3, 4, 5]

/** The cards a flop deals. */
export const FLOP_CARDS = 3

/** How many Streets come before the own of a Board with this many cards: the ones it can be narrowed on. */
export function streetsBefore(cards: number): number {
  return Math.max(0, cards - FLOP_CARDS)
}

/** The most cards a Board holds. */
export const MAX_BOARD_CARDS = 5

/** Why a text names no cards: a piece that is not one, or one named twice. */
type CardsProblem = { kind: 'unknown'; piece: string } | { kind: 'repeated'; card: string }

/** Why a text is not a Board. */
export type BoardProblem = CardsProblem | { kind: 'size'; count: number } | { kind: 'dead'; card: string }

/** A text's Board, or what is wrong with it. */
export type ParsedBoard = { board: string[] } | { problem: BoardProblem }

/** One card, from its rank (`10` for a ten) and suit in any case. */
const CARD = /^(10|[2-9tjqka])([shdc])/i

/** The cards a text names, in order, without checking how many there are. */
function cardsOf(text: string): { board: string[] } | { problem: CardsProblem } {
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

/**
 * A Board from text such as `Ah7d2c`: known cards, none repeated, none of the
 * Dead Cards, and none, three, four or five of them.
 */
export function parseBoard(text: string, dead: readonly string[] = []): ParsedBoard {
  const parsed = cardsOf(text)
  if ('problem' in parsed) return parsed
  const count = parsed.board.length
  if (!BOARD_SIZES.includes(count)) return { problem: { kind: 'size', count } }
  const isDead = parsed.board.find((card) => dead.includes(card))
  return isDead ? { problem: { kind: 'dead', card: isDead } } : parsed
}

/** The most Dead Cards an Analysis takes: one Combo, usually the person's own hand. */
export const MAX_DEAD_CARDS = 2

/** Why a text is not the Dead Cards. */
export type DeadCardsProblem = CardsProblem | { kind: 'size'; count: number } | { kind: 'on-board'; card: string }

/** A text's Dead Cards, or what is wrong with them. */
export type ParsedDeadCards = { dead: string[] } | { problem: DeadCardsProblem }

/** Dead Cards from text such as `AhKh`: known cards, none repeated, at most two, none on the Board. */
export function parseDeadCards(text: string, board: readonly string[]): ParsedDeadCards {
  const parsed = cardsOf(text)
  if ('problem' in parsed) return parsed
  const dead = parsed.board
  if (dead.length > MAX_DEAD_CARDS) return { problem: { kind: 'size', count: dead.length } }
  const onBoard = dead.find((card) => board.includes(card))
  return onBoard ? { problem: { kind: 'on-board', card: onBoard } } : { dead }
}

/**
 * The cards picked so far, as an address writes them: a Board, or a flop still
 * being filled. Text that is neither picks none.
 */
export function readBoardCards(text: string): string[] {
  const parsed = cardsOf(text)
  return 'board' in parsed && parsed.board.length <= MAX_BOARD_CARDS ? parsed.board : []
}

/** The Dead Cards an address writes beside this Board; any it cannot take are none. */
export function readDeadCards(text: string, board: readonly string[]): string[] {
  const parsed = parseDeadCards(text, board)
  return 'dead' in parsed ? parsed.dead : []
}

/** The cards as one text, as `Ah7d2c`; `parseBoard` and `parseDeadCards` read it back. */
export function formatBoard(cards: readonly string[]): string {
  return cards.join('')
}

/** The cards with this one taken off if it is among them, or else added after them while there is room. */
export function toggleCard(cards: readonly string[], card: string): string[] {
  if (cards.includes(card)) return cards.filter((each) => each !== card)
  return cards.length < MAX_BOARD_CARDS ? [...cards, card] : [...cards]
}

/** The Dead Cards with this one taken off if it is among them, or else added while there is room. */
export function toggleDeadCard(dead: readonly string[], card: string): string[] {
  if (dead.includes(card)) return dead.filter((each) => each !== card)
  return dead.length < MAX_DEAD_CARDS ? [...dead, card] : [...dead]
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
function isLive(combo: string, out: readonly string[]): boolean {
  return !out.includes(combo.slice(0, 2)) && !out.includes(combo.slice(2))
}

/** How many of a Hand Class's Combos hold one of these cards out of the deck: the Board's and the Dead Cards. */
export function removedCombos(handClass: HandClass, out: readonly string[]): number {
  return handClass.combos.filter((combo) => !isLive(combo, out)).length
}

/** The Range's Combos these cards out of the deck, the Board's and the Dead Cards, leave possible, each counted by its Frequency. */
export function liveCombos(range: Range, out: readonly string[]): number {
  let combos = 0
  for (const [combo, frequency] of Object.entries(range)) if (isLive(combo, out)) combos += frequency / 100
  return combos
}

/** The Lab's Categories, from the shared poker package (ADR 0007): the server classifies the Hero's Combo the same way. */
export { COMBINATION_DRAWS, DRAWS, MADE_HANDS, type DrawOptions }
export type MadeHand = MadeHandCategory
export type Draw = DrawCategory
export type CombinationDraw = CombinationDrawCategory

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

/** A card as the evaluator and the deck's sprites write it: tens as `10`, as `10h`. */
export function tenAs10(card: string): string {
  return card[0] === 'T' ? `10${card[1]}` : card
}

/** A card's code for the evaluator. */
function evaluatorCode(card: string): number {
  return cardCode(tenAs10(card))
}

/** A Combo's two cards, from `AhKd`. */
function holeOf(combo: string): [string, string] {
  return [combo.slice(0, 2), combo.slice(2)]
}

/** A Combo's Made Hand on a Board of three to five cards. */
function madeHandOf(combo: string, board: readonly string[]): MadeHand {
  return comboMadeHand(holeOf(combo), board)
}

/** A Combo's Draws on a flop or a turn. */
function drawsOf(combo: string, board: readonly string[], options: DrawOptions): Draw[] {
  return comboDraws(holeOf(combo), board, options)
}

/**
 * The Range's rows for these Categories, in this order: each Combo neither the
 * Board nor the Dead Cards remove counts in every Category `categoriesOf` gives it. One that no Combo left in the
 * deck can be in is left out; one the Range misses shows at 0.
 */
function rowsOf<Category extends string>(
  range: Range,
  board: readonly string[],
  dead: readonly string[],
  order: readonly Category[],
  categoriesOf: (combo: string) => readonly Category[],
): CategoryRow<Category>[] {
  const out = [...board, ...dead]
  const rows = new Map<Category, CategoryRow<Category>>()
  for (const handClass of HAND_CLASSES) {
    for (const combo of handClass.combos) {
      if (!isLive(combo, out)) continue
      const frequency = range[combo] ?? 0
      for (const category of categoriesOf(combo)) {
        const row = rows.get(category) ?? { category, combos: 0, share: 0, members: [] }
        rows.set(category, row)
        if (frequency === 0) continue
        row.combos += frequency / 100
        row.members.push(combo)
      }
    }
  }
  const live = liveCombos(range, out)
  return order.flatMap((category) => {
    const row = rows.get(category)
    return row ? [{ ...row, share: live > 0 ? (row.combos / live) * 100 : 0 }] : []
  })
}

/** The Combos rows picked from the Categories tables make, studied as one part of the Range. */
export interface SelectedCombos {
  /** Its Combos, each counted once by its Frequency, however many of its rows hold it. */
  combos: number
  /** That, as a share of the live Combos, from 0 to 100; 0 when none are live. */
  share: number
  /** Its Combos at their Frequencies: the Range it saves as. */
  range: Range
}

/** The selection these rows of the Range make, with these cards out of the deck: the Board's and the Dead Cards. */
export function selectionOf(range: Range, out: readonly string[], rows: readonly Pick<CategoryRow<string>, 'members'>[]): SelectedCombos {
  const selected: Range = {}
  for (const row of rows) for (const combo of row.members) selected[combo] = range[combo]
  const combos = liveCombos(selected, out)
  const live = liveCombos(range, out)
  return { combos, share: live > 0 ? (combos / live) * 100 : 0, range: selected }
}

/**
 * How the Range hits the Board, as the Made Hands that can happen on it, best
 * first: one that no Combo left in the deck can make is left out. None preflop,
 * nor while the flop is still being picked.
 */
export function madeHands(range: Range, board: readonly string[], dead: readonly string[] = []): CategoryRow<MadeHand>[] {
  if (board.length < FLOP_CARDS) return []
  return rowsOf(range, board, dead, MADE_HANDS, (combo) => [madeHandOf(combo, board)])
}

/**
 * The Draws the Range has on the Board, in the table's order, leaving out
 * those no Combo left in the deck can have. None preflop, nor on the river.
 */
export function draws(
  range: Range,
  board: readonly string[],
  dead: readonly string[] = [],
  options: DrawOptions = { oneCardBackdoors: false },
): CategoryRow<Draw>[] {
  if (board.length < FLOP_CARDS || board.length >= MAX_BOARD_CARDS) return []
  return rowsOf(range, board, dead, DRAWS, (combo) => drawsOf(combo, board, options))
}

/**
 * The combination Draws the Range has on the Board, in the table's order,
 * leaving out those no Combo left in the deck can have. None preflop, nor on
 * the river.
 */
export function combinationDraws(
  range: Range,
  board: readonly string[],
  dead: readonly string[] = [],
): CategoryRow<CombinationDraw>[] {
  if (board.length < FLOP_CARDS || board.length >= MAX_BOARD_CARDS) return []
  return rowsOf(range, board, dead, COMBINATION_DRAWS, (combo) => comboCombinationDraws(holeOf(combo), board))
}

/** Part of the Range against the own Combo. */
export interface Standing {
  /** Its Combos, each counted by its Frequency. */
  combos: number
  /** That, as a share of the live Combos, from 0 to 100; 0 when none are live. */
  share: number
}

/** The own Combo two Dead Cards make, and where it stands against the Range on the Board. */
export interface OwnCombo {
  madeHand: MadeHand
  draws: Draw[]
  /** The Range's live Combos it beats, ties with and loses to as the Board stands. */
  ahead: Standing
  tied: Standing
  behind: Standing
}

/**
 * The own Combo two Dead Cards make on a flop, a turn or a river, measured
 * against the Range's live Combos; none with fewer Dead Cards or no flop yet.
 */
export function ownCombo(
  range: Range,
  board: readonly string[],
  dead: readonly string[],
  options: DrawOptions = { oneCardBackdoors: false },
): OwnCombo | null {
  if (dead.length < MAX_DEAD_CARDS || board.length < FLOP_CARDS) return null
  const combo = dead.join('')
  const boardCodes = board.map(evaluatorCode)
  const mine = strength([...dead.map(evaluatorCode), ...boardCodes])
  const out = [...board, ...dead]
  let [ahead, tied, behind] = [0, 0, 0]
  for (const [theirs, frequency] of Object.entries(range)) {
    if (!isLive(theirs, out)) continue
    const against = strength([evaluatorCode(theirs.slice(0, 2)), evaluatorCode(theirs.slice(2)), ...boardCodes])
    if (mine > against) ahead += frequency / 100
    else if (mine === against) tied += frequency / 100
    else behind += frequency / 100
  }
  const live = ahead + tied + behind
  const standing = (combos: number): Standing => ({ combos, share: live > 0 ? (combos / live) * 100 : 0 })
  return {
    madeHand: madeHandOf(combo, board),
    draws: board.length < MAX_BOARD_CARDS ? drawsOf(combo, board, options) : [],
    ahead: standing(ahead),
    tied: standing(tied),
    behind: standing(behind),
  }
}

/** Any Category of the Analysis's tables. */
export type Category = MadeHand | Draw | CombinationDraw

/** Every Category, in the tables' order: the Made Hands, the Draws, then the combination Draws. */
export const CATEGORIES: readonly Category[] = [...MADE_HANDS, ...DRAWS, ...COMBINATION_DRAWS]

/** The key of a Category's name among the Lab's messages. */
export type CategoryNameKey =
  | `lab.analysis.madeHand.${MadeHand}`
  | `lab.analysis.draw.${Draw}`
  | `lab.analysis.combinationDraw.${CombinationDraw}`

const MADE_HAND_IDS: readonly string[] = MADE_HANDS
const DRAW_IDS: readonly string[] = DRAWS

/** The key of this Category's name, by the table it is in. */
export function categoryNameKey(category: Category): CategoryNameKey {
  if (MADE_HAND_IDS.includes(category)) return `lab.analysis.madeHand.${category as MadeHand}`
  if (DRAW_IDS.includes(category)) return `lab.analysis.draw.${category as Draw}`
  return `lab.analysis.combinationDraw.${category as CombinationDraw}`
}

/** The ids of some Categories, as a side marks or keeps them. */
export type CategoryIds = readonly string[]

/** The Categories marked on a side on the current Street. */
export type Selection = CategoryIds

/** The Categories a Street's Narrowing kept, the Selection it was dealt on with; none for a Street not narrowed. */
export type Narrowing = CategoryIds

/** A side's rows, one table per kind of Category. */
export interface CategoryTables {
  madeHands: readonly CategoryRow<MadeHand>[]
  draws: readonly CategoryRow<Draw>[]
  combinationDraws: readonly CategoryRow<CombinationDraw>[]
}

/** Every row of the tables in their order, as CATEGORIES lists them. */
export function rowsInOrder({ madeHands, draws, combinationDraws }: CategoryTables): CategoryRow<Category>[] {
  return [...madeHands, ...draws, ...combinationDraws]
}

/** Every Category a Range has on a Board, as the Analysis's tables show them. */
function categoryRows(range: Range, board: readonly string[], dead: readonly string[], options: DrawOptions): CategoryRow<Category>[] {
  return rowsInOrder({
    madeHands: madeHands(range, board, dead),
    draws: draws(range, board, dead, options),
    combinationDraws: combinationDraws(range, board, dead),
  })
}

/**
 * The Range on each Street of the Board up to its own, the flop's first: the
 * whole Range on the flop, then on each next Street what the Narrowing of the
 * one before kept. Each Narrowing keeps, on the Board as it stood on its
 * Street, the Combos in any of its Categories, at their Frequencies. A Street
 * not narrowed keeps everything, the same Range; a Category that is not on its
 * Street, or not on screen, keeps nothing. Narrowings past the Board are left
 * out. Before a flop, only the whole Range.
 */
export function rangesOnStreets(
  range: Range,
  board: readonly string[],
  dead: readonly string[],
  narrowings: readonly Narrowing[],
  options: DrawOptions = { oneCardBackdoors: false },
): Range[] {
  const ranges = [range]
  for (let index = 0; index < streetsBefore(board.length); index++) {
    const before = ranges[index]
    const kept = narrowings[index] ?? []
    if (kept.length === 0) {
      ranges.push(before)
      continue
    }
    const street = board.slice(0, FLOP_CARDS + index)
    const rows = categoryRows(before, street, dead, options).filter((row) => kept.includes(row.category))
    ranges.push(selectionOf(before, [...street, ...dead], rows).range)
  }
  return ranges
}

/** The Range on the Board's own Street after its Narrowings: the last of rangesOnStreets. */
export function rangeOnStreet(
  range: Range,
  board: readonly string[],
  dead: readonly string[],
  narrowings: readonly Narrowing[],
  options: DrawOptions = { oneCardBackdoors: false },
): Range {
  return rangesOnStreets(range, board, dead, narrowings, options).at(-1)!
}
