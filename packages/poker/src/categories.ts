/*
 * The Lab's Categories (CONTEXT.md: Category, Made Hand, Draw), shared so the
 * server classifies the Hero's Combo on a Board exactly as the Lab classifies
 * a Range's Combos. Cards are rank then suit; tens may be written `T` or `10`.
 */

import { cardCode, categoryOf, strength, type HandCategory } from './evaluator.js';

/** Ranks from the highest down, tens as `T`. */
const RANKS = 'AKQJT98765432';

/** The cards a flop deals. */
const FLOP_CARDS = 3;

/** The most cards a Board holds. */
const MAX_BOARD_CARDS = 5;

/**
 * The Made Hands, best first: Flopzilla Pro's, plus classic Flopzilla's ace
 * high. Each Combo is in exactly one, its best.
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
] as const;
/** A Made Hand Category (not the evaluator's `MadeHand`, the cards a hand is made of). */
export type MadeHandCategory = (typeof MADE_HANDS)[number];

/**
 * The Draws, in the Lab's table order. They overlap each other and the Made
 * Hands: a Combo is in every one it has.
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
] as const;
export type DrawCategory = (typeof DRAWS)[number];

/** The combination Draws, in the Lab's table order. A Combo in one still is in each Draw it combines. */
export const COMBINATION_DRAWS = [
  'flush-draw-pair',
  'flush-draw-open-ended',
  'flush-draw-gutshot',
  'flush-draw-overcards',
  'open-ended-pair',
  'gutshot-pair',
] as const;
export type CombinationDrawCategory = (typeof COMBINATION_DRAWS)[number];

/** What the Draws may be asked to include beyond the defaults. */
export interface DrawOptions {
  /** Whether the one-card backdoor flush draw counts; off by default, as in Flopzilla. */
  oneCardBackdoors: boolean;
}

/** A Combo's Categories on a Board. */
export interface ComboCategories {
  madeHand: MadeHandCategory;
  /** None on the river. */
  draws: DrawCategory[];
  /** None on the river. */
  combinationDraws: CombinationDrawCategory[];
}

const NO_ONE_CARD_BACKDOORS: DrawOptions = { oneCardBackdoors: false };

/**
 * A Combo's Categories on a Board of three to five cards: its one Made Hand,
 * every Draw it has and every combination Draw, in the Lab's table order.
 * `hole` is the Combo's two cards.
 */
export function classifyCombo(
  hole: readonly string[],
  board: readonly string[],
  options: DrawOptions = NO_ONE_CARD_BACKDOORS,
): ComboCategories {
  return {
    madeHand: comboMadeHand(hole, board),
    draws: comboDraws(hole, board, options),
    combinationDraws: comboCombinationDraws(hole, board),
  };
}

/** A Combo's one Made Hand on a Board of three to five cards. */
export function comboMadeHand(hole: readonly string[], board: readonly string[]): MadeHandCategory {
  return madeHandOf(hole.map(tenAsT), board.map(tenAsT));
}

/** A Combo's Draws on a Board of three or four cards, in the Lab's table order; none on the river. */
export function comboDraws(
  hole: readonly string[],
  board: readonly string[],
  options: DrawOptions = NO_ONE_CARD_BACKDOORS,
): DrawCategory[] {
  if (board.length >= MAX_BOARD_CARDS) return [];
  return drawsOf(hole.map(tenAsT), board.map(tenAsT), options);
}

/** A Combo's combination Draws on a Board of three or four cards, in the Lab's table order; none on the river. */
export function comboCombinationDraws(hole: readonly string[], board: readonly string[]): CombinationDrawCategory[] {
  if (board.length >= MAX_BOARD_CARDS) return [];
  return combinationDrawsOf(hole.map(tenAsT), board.map(tenAsT));
}

/** A card with its ten written `T`, as `Th`. */
function tenAsT(card: string): string {
  return card.startsWith('10') ? `T${card.slice(2)}` : card;
}

/** A card's code for the evaluator, which writes tens as `10`. */
function evaluatorCode(card: string): number {
  return cardCode(card[0] === 'T' ? `10${card[1]}` : card);
}

/** How high a rank is: the deuce 0, the ace 12. */
function rankValue(card: string): number {
  return RANKS.length - 1 - RANKS.indexOf(card[0]);
}

/** The Made Hands the evaluator names whatever the Combo's cards add. */
const MADE_BY_EVALUATOR: Partial<Record<HandCategory, MadeHandCategory>> = {
  'straight-flush': 'straight-flush',
  'four-of-a-kind': 'quads',
  'full-house': 'full-house',
  flush: 'flush',
  straight: 'straight',
};

/**
 * A Combo's Made Hand on a Board of three to five cards. A pair or two pair the
 * Board makes alone does not count: below a straight, only what the Combo's
 * own cards pair counts.
 */
function madeHandOf(hole: readonly string[], board: readonly string[]): MadeHandCategory {
  const cards = [...hole, ...board];
  const byEvaluator = MADE_BY_EVALUATOR[categoryOf(strength(cards.map(evaluatorCode)))];
  if (byEvaluator) return byEvaluator;

  const [first, second] = [rankValue(hole[0]), rankValue(hole[1])];
  const onBoard = (rank: number) => board.filter((card) => rankValue(card) === rank).length;
  // The Board's distinct ranks, from the highest down.
  const ranks = [...new Set(board.map(rankValue))].sort((a, b) => b - a);
  const [top, lowest] = [ranks[0], ranks[ranks.length - 1]];

  if (first === second) {
    if (onBoard(first) > 0) return 'set';
    if (first > top) return 'overpair';
    if (ranks.length > 1 && first > ranks[1]) return 'below-top-card';
    if (first > lowest) return 'below-second-card';
    return 'below-board';
  }
  const paired = [first, second].filter((rank) => onBoard(rank) > 0);
  if (paired.length === 2) return 'two-pair';
  if (paired.length === 1) {
    const [rank] = paired;
    if (onBoard(rank) > 1) return 'trips';
    if (rank === top) return 'top-pair';
    if (rank === lowest) return 'bottom-pair';
    return 'middle-pair';
  }
  return first === RANKS.length - 1 || second === RANKS.length - 1 ? 'ace-high' : 'nothing';
}

/** How many of these cards hold each suit. */
function suitCounts(cards: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card[1], (counts.get(card[1]) ?? 0) + 1);
  return counts;
}

/** The lowest rank of each straight, the wheel's ace counted as -1, below the deuce. */
const STRAIGHT_LOWS = Array.from({ length: 10 }, (_, low) => low - 1);

/** The ranks of these cards and any added, an ace also counted low, as -1. */
function ranksOf(cards: readonly string[], ...added: number[]): Set<number> {
  const ranks = new Set([...cards.map(rankValue), ...added]);
  if (ranks.has(RANKS.length - 1)) ranks.add(-1);
  return ranks;
}

/** The lowest rank of the highest straight these ranks make, or `null` for none. */
function highestStraight(ranks: ReadonlySet<number>): number | null {
  const lows = STRAIGHT_LOWS.filter((low) => [0, 1, 2, 3, 4].every((step) => ranks.has(low + step)));
  return lows.length > 0 ? lows[lows.length - 1] : null;
}

/**
 * The ranks whose card would give these hole cards a straight above any the
 * Board and that card make alone: a straight they all share is not a draw.
 */
function straightOuts(hole: readonly string[], board: readonly string[]): Set<number> {
  const outs = new Set<number>();
  for (let rank = 0; rank < RANKS.length; rank++) {
    const withHole = highestStraight(ranksOf([...hole, ...board], rank));
    const boardAlone = highestStraight(ranksOf(board, rank));
    if (withHole !== null && (boardAlone === null || withHole > boardAlone)) outs.add(rank);
  }
  return outs;
}

/** Whether a Made Hand is weaker than this one, so that drawing to it means something still to come. */
function isBelow(madeHand: MadeHandCategory, target: MadeHandCategory): boolean {
  return MADE_HANDS.indexOf(madeHand) > MADE_HANDS.indexOf(target);
}

/** A Combo's Draws on a flop or a turn. */
function drawsOf(hole: readonly string[], board: readonly string[], options: DrawOptions): DrawCategory[] {
  const madeHand = madeHandOf(hole, board);
  const found: DrawCategory[] = [];

  const all = suitCounts([...hole, ...board]);
  const own = suitCounts(hole);
  /** Whether some suit has this many cards, this many of them the Combo's. */
  const toFlush = (count: number, owned: (mine: number) => boolean) =>
    [...all].some(([suit, each]) => each === count && owned(own.get(suit) ?? 0));
  const flushDraw = isBelow(madeHand, 'flush') && toFlush(4, (mine) => mine > 0);
  if (flushDraw) found.push('flush-draw');

  if (isBelow(madeHand, 'straight')) {
    const outs = straightOuts(hole, board).size;
    // Needs only one of the Combo's cards when that card alone, with the Board, has as many outs.
    const oneCard = (needed: number) => hole.some((card) => straightOuts([card], board).size >= needed);
    if (outs >= 2) found.push(oneCard(2) ? 'open-ended-one-card' : 'open-ended-two-cards');
    else if (outs === 1) found.push(oneCard(1) ? 'gutshot-one-card' : 'gutshot-two-cards');
  }

  const highest = Math.max(...board.map(rankValue));
  if ((madeHand === 'ace-high' || madeHand === 'nothing') && hole.every((card) => rankValue(card) > highest)) {
    found.push('overcards');
  }

  // Backdoors: three to a flush on the flop, needing both the turn and the river.
  if (board.length === FLOP_CARDS && !flushDraw) {
    if (toFlush(3, (mine) => mine === 2)) found.push('backdoor-two-cards');
    if (options.oneCardBackdoors && toFlush(3, (mine) => mine === 1)) found.push('backdoor-one-card');
  }
  return found;
}

/** The Made Hands that are one pair, the ones a combination Draw's "+ pair" means. */
const ONE_PAIR: readonly MadeHandCategory[] = [
  'overpair',
  'top-pair',
  'below-top-card',
  'middle-pair',
  'below-second-card',
  'bottom-pair',
  'below-board',
];

/** A Combo's combination Draws on a flop or a turn. */
function combinationDrawsOf(hole: readonly string[], board: readonly string[]): CombinationDrawCategory[] {
  // The backdoors combine with nothing.
  const has = new Set(drawsOf(hole, board, NO_ONE_CARD_BACKDOORS));
  const pair = ONE_PAIR.includes(madeHandOf(hole, board));
  const openEnded = has.has('open-ended-two-cards') || has.has('open-ended-one-card');
  const gutshot = has.has('gutshot-two-cards') || has.has('gutshot-one-card');
  const flushDraw = has.has('flush-draw');
  const found: CombinationDrawCategory[] = [];
  if (flushDraw && pair) found.push('flush-draw-pair');
  if (flushDraw && openEnded) found.push('flush-draw-open-ended');
  if (flushDraw && gutshot) found.push('flush-draw-gutshot');
  if (flushDraw && has.has('overcards')) found.push('flush-draw-overcards');
  if (openEnded && pair) found.push('open-ended-pair');
  if (gutshot && pair) found.push('gutshot-pair');
  return found;
}
