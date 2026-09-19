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
