/*
 * Replay's own hold'em hand evaluator: the best five-card hand a player
 * makes from their hole cards and the board. Made-hand labels come from here
 * as categories the web localises, never from the Hand History's own text.
 */

export type HandCategory =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush';

const CATEGORIES: HandCategory[] = [
  'high-card',
  'pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
];

export interface MadeHand {
  category: HandCategory;
  /**
   * The ranks that name the hand, most significant first: the pair's rank,
   * both pairs of two pair, trips then pair of a full house, or a straight's
   * or flush's highest card. Tens are "10".
   */
  ranks: string[];
  /** The cards that make the hand, kickers left out, highest rank first. */
  cards: string[];
}

const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];

interface Parsed {
  card: string;
  /** 2 to 14, the ace high. */
  value: number;
  suit: string;
  /** Where the card came in, so ties keep the hole cards first. */
  order: number;
}

interface Evaluated {
  hand: MadeHand;
  /** The category, then every rank that breaks a tie, for comparing hands. */
  score: number[];
}

/** The best hand among `cards` (hole cards first, then the board). */
export function bestHand(cards: string[]): MadeHand {
  const parsed = cards.map((card, order) => ({
    card,
    value: RANKS.indexOf(card.slice(0, -1)) + 2,
    suit: card.slice(-1),
    order,
  }));
  let best: Evaluated | null = null;
  for (const five of combinations(parsed, Math.min(5, parsed.length))) {
    const evaluated = evaluate(five);
    if (!best || compare(evaluated.score, best.score) > 0) best = evaluated;
  }
  return best!.hand;
}

function evaluate(cards: Parsed[]): Evaluated {
  const sorted = [...cards].sort(
    (a, b) => b.value - a.value || a.order - b.order,
  );
  // Ranks grouped by how many of each, the bigger groups and ranks first.
  const byValue = new Map<number, Parsed[]>();
  for (const card of sorted) {
    byValue.set(card.value, [...(byValue.get(card.value) ?? []), card]);
  }
  const groups = [...byValue.values()].sort(
    (a, b) => b.length - a.length || b[0].value - a[0].value,
  );
  const flush =
    cards.length === 5 && cards.every((card) => card.suit === cards[0].suit);
  const straightHigh = cards.length === 5 ? straightTop(sorted) : null;

  const made = (
    category: HandCategory,
    named: Parsed[][],
    madeOf: Parsed[],
    tiebreak: number[],
  ): Evaluated => ({
    hand: {
      category,
      ranks: named.map((group) => rankOf(group[0].value)),
      cards: madeOf.map((card) => card.card),
    },
    score: [CATEGORIES.indexOf(category), ...tiebreak],
  });
  const values = groups.flatMap((group) => group.map((card) => card.value));

  if (straightHigh !== null) {
    const top = [
      sorted.find((card) => card.value === straightHigh) ?? sorted[0],
    ];
    // A wheel (5-4-3-2-A) lays the ace out at the bottom.
    const inOrder =
      straightHigh === 5 ? [...sorted.slice(1), sorted[0]] : sorted;
    return made(flush ? 'straight-flush' : 'straight', [top], inOrder, [
      straightHigh,
    ]);
  }
  if (groups[0].length === 4) {
    return made('four-of-a-kind', [groups[0]], groups[0], values);
  }
  if (groups[0].length === 3 && groups[1]?.length === 2) {
    return made(
      'full-house',
      [groups[0], groups[1]],
      [...groups[0], ...groups[1]],
      values,
    );
  }
  if (flush) return made('flush', [sorted], sorted, values);
  if (groups[0].length === 3) {
    return made('three-of-a-kind', [groups[0]], groups[0], values);
  }
  if (groups[0].length === 2 && groups[1]?.length === 2) {
    return made(
      'two-pair',
      [groups[0], groups[1]],
      [...groups[0], ...groups[1]],
      values,
    );
  }
  if (groups[0].length === 2) {
    return made('pair', [groups[0]], groups[0], values);
  }
  return made('high-card', [groups[0]], groups[0], values);
}

/** The top card of a straight, if the five sorted cards make one. */
function straightTop(sorted: Parsed[]): number | null {
  const values = sorted.map((card) => card.value);
  if (new Set(values).size !== 5) return null;
  if (values[0] - values[4] === 4) return values[0];
  if (values.join() === '14,5,4,3,2') return 5;
  return null;
}

function rankOf(value: number): string {
  return RANKS[value - 2];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function* combinations<T>(items: T[], size: number): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= items.length - size; i++) {
    for (const rest of combinations(items.slice(i + 1), size - 1)) {
      yield [items[i], ...rest];
    }
  }
}

/*
 * The same ordering as `bestHand`, as one number and built for speed: All-in
 * EV scores every player on every board left to deal.
 */

/** A card as a number: its rank (2 to ace as 0 to 12) times four, plus its suit. */
export function cardCode(card: string): number {
  return (
    (RANKS.indexOf(card.slice(0, -1)) << 2) | 'cdhs'.indexOf(card.slice(-1))
  );
}

// Reused by every call to spare an allocation per board; `strength` runs to
// the end without yielding, so no two calls ever share it.
const rankCounts = new Uint8Array(13);

/**
 * How strong the best five-card hand among `codes` (five to seven cards) is:
 * a bigger number beats a smaller one, and equal numbers tie.
 */
export function strength(codes: readonly number[]): number {
  rankCounts.fill(0);
  let ranks = 0;
  let clubs = 0;
  let diamonds = 0;
  let hearts = 0;
  let spades = 0;
  for (const code of codes) {
    const rank = code >> 2;
    const bit = 1 << rank;
    rankCounts[rank]++;
    ranks |= bit;
    switch (code & 3) {
      case 0:
        clubs |= bit;
        break;
      case 1:
        diamonds |= bit;
        break;
      case 2:
        hearts |= bit;
        break;
      default:
        spades |= bit;
    }
  }
  const flush = [clubs, diamonds, hearts, spades].find(
    (suit) => bitCount(suit) >= 5,
  );
  if (flush !== undefined) {
    const top = straightTopOf(flush);
    if (top >= 0) return scoreOf('straight-flush', [top]);
  }

  let quads = -1;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let rank = 12; rank >= 0; rank--) {
    const count = rankCounts[rank];
    if (count === 4) quads = rank;
    else if (count === 3) trips.push(rank);
    else if (count === 2) pairs.push(rank);
  }
  if (quads >= 0)
    return scoreOf('four-of-a-kind', [quads, ...highest(ranks, 1, [quads])]);
  if (trips.length > 0 && trips.length + pairs.length > 1) {
    // A second set of trips makes the full house's pair, if it beats any pair.
    const pair = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    return scoreOf('full-house', [trips[0], pair]);
  }
  if (flush !== undefined) return scoreOf('flush', highest(flush, 5, []));
  const top = straightTopOf(ranks);
  if (top >= 0) return scoreOf('straight', [top]);
  if (trips.length > 0) {
    return scoreOf('three-of-a-kind', [
      trips[0],
      ...highest(ranks, 2, [trips[0]]),
    ]);
  }
  if (pairs.length > 1) {
    const [high, low] = pairs;
    return scoreOf('two-pair', [high, low, ...highest(ranks, 1, [high, low])]);
  }
  if (pairs.length === 1) {
    return scoreOf('pair', [pairs[0], ...highest(ranks, 3, [pairs[0]])]);
  }
  return scoreOf('high-card', highest(ranks, 5, []));
}

/** The category, then each rank that breaks a tie, four bits apiece. */
function scoreOf(category: HandCategory, tiebreak: number[]): number {
  let score = CATEGORIES.indexOf(category);
  for (let i = 0; i < 5; i++) score = (score << 4) | ((tiebreak[i] ?? -1) + 1);
  return score;
}

/** The `count` highest ranks set in `mask`, leaving out those in `except`. */
function highest(mask: number, count: number, except: number[]): number[] {
  const found: number[] = [];
  for (let rank = 12; rank >= 0 && found.length < count; rank--) {
    if (mask & (1 << rank) && !except.includes(rank)) found.push(rank);
  }
  return found;
}

/** The top rank of the highest straight in `mask`, or -1 without one. */
function straightTopOf(mask: number): number {
  // An ace also plays low, below the 2.
  const withLowAce = (mask << 1) | ((mask >> 12) & 1);
  for (let top = 12; top >= 3; top--) {
    const run = 0b11111 << (top - 3);
    if ((withLowAce & run) === run) return top;
  }
  return -1;
}

function bitCount(mask: number): number {
  let count = 0;
  for (let rest = mask; rest; rest &= rest - 1) count++;
  return count;
}
