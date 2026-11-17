/**
 * Board texture: what the community cards look like on a Street, worked out
 * from the cards alone (facts catalogue §3.5). Cards are written as a Hand
 * writes them, rank then suit with tens as "10" ("10h", "As").
 */

/** How the flop's cards share suits. */
export const FLOP_SUITS = ['rainbow', 'two-tone', 'monotone'] as const;

/** How many cards of one suit the turn or the river puts out at most. */
export const LATER_SUITS = [
  'no-flush',
  'flush-possible',
  'four-of-a-suit',
  'five-of-a-suit',
] as const;

export type BoardSuits =
  (typeof FLOP_SUITS)[number] | (typeof LATER_SUITS)[number];

/** How the Board is paired, from none to four of a rank. */
export const BOARD_PAIRINGS = [
  'unpaired',
  'paired',
  'two-pair',
  'trips',
  'full-house',
  'quads',
] as const;

export type BoardPairing = (typeof BOARD_PAIRINGS)[number];

/** Ranks from the highest down, as the Lab writes them. */
export const BOARD_RANKS = [
  'A',
  'K',
  'Q',
  'J',
  'T',
  '9',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3',
  '2',
] as const;

export type BoardRank = (typeof BOARD_RANKS)[number];

export interface BoardTexture {
  suits: BoardSuits;
  pairing: BoardPairing;
  /** Some two cards make a straight on this Board. */
  straightPossible: boolean;
  /**
   * The most distinct Board ranks within any five consecutive ranks, the
   * ace also counting as one: 987 is 3, K94 is 2, A25 is 3.
   */
  connectedness: number;
  /** The Board's highest rank. */
  highCard: BoardRank;
}

/** What a turn or river card changed on the Board before it. */
export interface CardChange {
  /** Its rank was on the Board already. */
  pairsBoard: boolean;
  /** It is the third card of its suit out, or a later one. */
  bringsFlush: boolean;
  /** A straight is possible now, and wasn't before it. */
  bringsStraight: boolean;
  /** It is higher than every card on the Board before it. */
  overcard: boolean;
}

/** The texture of a flop, turn or river Board: three to five cards. */
export function boardTexture(cards: readonly string[]): BoardTexture {
  const parsed = cards.map(parse);
  const values = parsed.map((card) => card.value);
  const mostOfASuit = Math.max(...counts(parsed.map((card) => card.suit)));
  const connectedness = mostWithinFive(values);
  return {
    suits:
      cards.length === 3
        ? FLOP_SUITS[mostOfASuit - 1]
        : LATER_SUITS[Math.max(0, mostOfASuit - 2)],
    pairing: pairing(counts(values)),
    straightPossible: connectedness >= 3,
    connectedness,
    highCard: rankOf(Math.max(...values)),
  };
}

/** What `card` changed when dealt onto the Board `before`. */
export function cardChange(
  before: readonly string[],
  card: string,
): CardChange {
  const earlier = before.map(parse);
  const dealt = parse(card);
  const after = [...earlier, dealt];
  return {
    pairsBoard: earlier.some((other) => other.value === dealt.value),
    bringsFlush: after.filter((other) => other.suit === dealt.suit).length >= 3,
    bringsStraight:
      mostWithinFive(after.map((c) => c.value)) >= 3 &&
      mostWithinFive(earlier.map((c) => c.value)) < 3,
    overcard: earlier.every((other) => dealt.value > other.value),
  };
}

interface Card {
  /** 2 to 14, the ace high. */
  value: number;
  suit: string;
}

function parse(card: string): Card {
  const rank = card.slice(0, -1).replace('10', 'T');
  return {
    value: 14 - BOARD_RANKS.indexOf(rank as BoardRank),
    suit: card.slice(-1),
  };
}

function rankOf(value: number): BoardRank {
  return BOARD_RANKS[14 - value];
}

/** How many times each distinct item appears. */
function counts<T>(items: readonly T[]): number[] {
  const seen = new Map<T, number>();
  for (const item of items) seen.set(item, (seen.get(item) ?? 0) + 1);
  return [...seen.values()];
}

function pairing(rankCounts: number[]): BoardPairing {
  const most = Math.max(...rankCounts);
  const pairs = rankCounts.filter((count) => count === 2).length;
  if (most === 4) return 'quads';
  if (most === 3) return pairs > 0 ? 'full-house' : 'trips';
  if (pairs >= 2) return 'two-pair';
  return pairs === 1 ? 'paired' : 'unpaired';
}

/**
 * The most distinct values within any five consecutive ones, from A-5 (the
 * ace low) to T-A.
 */
function mostWithinFive(values: readonly number[]): number {
  const distinct = new Set(values);
  if (distinct.has(14)) distinct.add(1);
  let most = 0;
  for (let low = 1; low <= 10; low += 1) {
    let within = 0;
    for (let value = low; value < low + 5; value += 1) {
      if (distinct.has(value)) within += 1;
    }
    most = Math.max(most, within);
  }
  return most;
}
