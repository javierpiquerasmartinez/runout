/*
 * The Analysis's Board: a flop, a turn or a river, the Dead Cards beside it,
 * and the Combos of a Range they remove. Pure: no React, no I/O, beside the range module. Cards are
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

/** A card as the evaluator and the deck's sprites write it: tens as `10`, as `10h`. */
export function tenAs10(card: string): string {
  return card[0] === 'T' ? `10${card[1]}` : card
}

/** A card's code for the evaluator. */
function evaluatorCode(card: string): number {
  return cardCode(tenAs10(card))
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
  return first === RANKS.length - 1 || second === RANKS.length - 1 ? 'ace-high' : 'nothing'
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

/** Rows picked from the Categories tables, studied as one part of the Range. */
export interface Selection {
  /** Its Combos, each counted once by its Frequency, however many of its rows hold it. */
  combos: number
  /** That, as a share of the live Combos, from 0 to 100; 0 when none are live. */
  share: number
  /** Its Combos at their Frequencies: the Range it saves as. */
  range: Range
}

/** The selection these rows of the Range make, with these cards out of the deck: the Board's and the Dead Cards. */
export function selectionOf(range: Range, out: readonly string[], rows: readonly Pick<CategoryRow<string>, 'members'>[]): Selection {
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
 * The Draws, in the table's order. They overlap each other and the Made Hands:
 * a Combo counts in every one it has.
 */
export const DRAWS = [
  'flush-draw',
  'open-ended-two-cards',
  'open-ended-one-card',
  'gutshot-two-cards',
  'gutshot-one-card',
  'overcards',
  'backdoor-two-cards',
  'backdoor-one-card',
] as const
export type Draw = (typeof DRAWS)[number]

/** What the Analysis may be asked to show beyond the defaults. */
export interface DrawOptions {
  /** Whether the one-card backdoor flush draw shows; off by default, as in Flopzilla. */
  oneCardBackdoors: boolean
}

/** How many of these cards hold each suit. */
function suitCounts(cards: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const card of cards) counts.set(card[1], (counts.get(card[1]) ?? 0) + 1)
  return counts
}

/** The lowest rank of each straight, the wheel's ace counted as -1, below the deuce. */
const STRAIGHT_LOWS = Array.from({ length: 10 }, (_, low) => low - 1)

/** The ranks of these cards and any added, an ace also counted low, as -1. */
function ranksOf(cards: readonly string[], ...added: number[]): Set<number> {
  const ranks = new Set([...cards.map(rankValue), ...added])
  if (ranks.has(RANKS.length - 1)) ranks.add(-1)
  return ranks
}

/** The lowest rank of the highest straight these ranks make, or `null` for none. */
function highestStraight(ranks: ReadonlySet<number>): number | null {
  const lows = STRAIGHT_LOWS.filter((low) => [0, 1, 2, 3, 4].every((step) => ranks.has(low + step)))
  return lows.length > 0 ? lows[lows.length - 1] : null
}

/**
 * The ranks whose card would give these hole cards a straight above any the
 * Board and that card make alone: a straight they all share is not a draw.
 */
function straightOuts(hole: readonly string[], board: readonly string[]): Set<number> {
  const outs = new Set<number>()
  for (let rank = 0; rank < RANKS.length; rank++) {
    const withHole = highestStraight(ranksOf([...hole, ...board], rank))
    const boardAlone = highestStraight(ranksOf(board, rank))
    if (withHole !== null && (boardAlone === null || withHole > boardAlone)) outs.add(rank)
  }
  return outs
}

/** Whether a Made Hand is weaker than this one, so that drawing to it means something still to come. */
function isBelow(madeHand: MadeHand, target: MadeHand): boolean {
  return MADE_HANDS.indexOf(madeHand) > MADE_HANDS.indexOf(target)
}

/** A Combo's Draws on a flop or a turn. */
function drawsOf(combo: string, board: readonly string[], options: DrawOptions): Draw[] {
  const hole = [combo.slice(0, 2), combo.slice(2)]
  const madeHand = madeHandOf(combo, board)
  const found: Draw[] = []

  const all = suitCounts([...hole, ...board])
  const own = suitCounts(hole)
  /** Whether some suit has this many cards, this many of them the Combo's. */
  const toFlush = (count: number, owned: (mine: number) => boolean) =>
    [...all].some(([suit, each]) => each === count && owned(own.get(suit) ?? 0))
  const flushDraw = isBelow(madeHand, 'flush') && toFlush(4, (mine) => mine > 0)
  if (flushDraw) found.push('flush-draw')

  if (isBelow(madeHand, 'straight')) {
    const outs = straightOuts(hole, board).size
    // Needs only one of the Combo's cards when that card alone, with the Board, has as many outs.
    const oneCard = (needed: number) => hole.some((card) => straightOuts([card], board).size >= needed)
    if (outs >= 2) found.push(oneCard(2) ? 'open-ended-one-card' : 'open-ended-two-cards')
    else if (outs === 1) found.push(oneCard(1) ? 'gutshot-one-card' : 'gutshot-two-cards')
  }

  const highest = Math.max(...board.map(rankValue))
  if ((madeHand === 'ace-high' || madeHand === 'nothing') && hole.every((card) => rankValue(card) > highest)) {
    found.push('overcards')
  }

  // Backdoors: three to a flush on the flop, needing both the turn and the river.
  if (board.length === FLOP_CARDS && !flushDraw) {
    if (toFlush(3, (mine) => mine === 2)) found.push('backdoor-two-cards')
    if (options.oneCardBackdoors && toFlush(3, (mine) => mine === 1)) found.push('backdoor-one-card')
  }
  return found
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

/** The combination Draws, in the table's order. A Combo in one still counts in each Draw it combines. */
export const COMBINATION_DRAWS = [
  'flush-draw-pair',
  'flush-draw-open-ended',
  'flush-draw-gutshot',
  'flush-draw-overcards',
  'open-ended-pair',
  'gutshot-pair',
] as const
export type CombinationDraw = (typeof COMBINATION_DRAWS)[number]

/** The Made Hands that are one pair, the ones a combination Draw's "+ pair" means. */
const ONE_PAIR: readonly MadeHand[] = [
  'overpair',
  'top-pair',
  'below-top-card',
  'middle-pair',
  'below-second-card',
  'bottom-pair',
  'below-board',
]

/** A Combo's combination Draws on a flop or a turn. */
function combinationDrawsOf(combo: string, board: readonly string[]): CombinationDraw[] {
  // The backdoors combine with nothing.
  const has = new Set(drawsOf(combo, board, { oneCardBackdoors: false }))
  const pair = ONE_PAIR.includes(madeHandOf(combo, board))
  const openEnded = has.has('open-ended-two-cards') || has.has('open-ended-one-card')
  const gutshot = has.has('gutshot-two-cards') || has.has('gutshot-one-card')
  const flushDraw = has.has('flush-draw')
  const found: CombinationDraw[] = []
  if (flushDraw && pair) found.push('flush-draw-pair')
  if (flushDraw && openEnded) found.push('flush-draw-open-ended')
  if (flushDraw && gutshot) found.push('flush-draw-gutshot')
  if (flushDraw && has.has('overcards')) found.push('flush-draw-overcards')
  if (openEnded && pair) found.push('open-ended-pair')
  if (gutshot && pair) found.push('gutshot-pair')
  return found
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
  return rowsOf(range, board, dead, COMBINATION_DRAWS, (combo) => combinationDrawsOf(combo, board))
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
