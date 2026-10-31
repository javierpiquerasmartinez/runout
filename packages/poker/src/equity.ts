/*
 * Equity (ADR 0007): the share of the pot one Range wins against another over
 * every way the Board can be completed, ties split. Combos that share a card
 * never meet, and each Combo counts by its Frequency. Exact when the work is
 * small, sampled otherwise. Pure: the web's worker streams it.
 *
 * Cards are written as the Lab writes them, tens as `T` (`Th`), and Combos as
 * two cards, as `AhKd`.
 */

import { cardCode, strength } from './evaluator.js';

/** Combo → Frequency, from 1 to 100. A Combo alone is a Range of one. */
export type EquityRange = Readonly<Record<string, number>>;

export interface EquityRequest {
  ranges: readonly [EquityRange, EquityRange];
  /** None, three, four or five cards. */
  board: readonly string[];
  /** Cards kept out of the deck: no Combo holds them and the Board never deals them. */
  dead?: readonly string[];
}

/** One side's share of the pot, each from 0 to 100. */
export interface SideEquity {
  /** Its wins, plus half its ties. */
  equity: number;
  win: number;
  tie: number;
}

/** One Hand Class's share of the pot against the other side, as `SideEquity` is the side's. */
export interface HandClassEquity extends SideEquity {
  /** Its share of the side's deals, from 0 to 100: the side's Equity is its Hand Classes' averaged by it. */
  share: number;
  /** As the result's margin, over this Hand Class's deals alone. */
  margin: number;
}

export interface EquityResult {
  sides: [SideEquity, SideEquity];
  /** Each side's Hand Classes that met the other side, by name (`AKs`). */
  handClasses: [Record<string, HandClassEquity>, Record<string, HandClassEquity>];
  /** Whether every deal was counted: then the margin is 0. */
  exact: boolean;
  /** How far the Equity may be from the exact one, in points of %, at 95 % confidence. */
  margin: number;
}

/** A card's code for the evaluator. */
function codeOf(card: string): number {
  return cardCode(card[0] === 'T' ? `10${card.slice(1)}` : card);
}

interface Combo {
  first: number;
  second: number;
  /** Its Hand Class's name, as `AKs`. */
  handClass: string;
  /** Its Frequency, from 0 to 1. */
  frequency: number;
}

const RANKS = 'AKQJT98765432';

/** The Hand Class a Combo is of, as `AKs`, `AKo` or `AA`, whichever card is written first. */
function handClassOf(combo: string): string {
  const [high, low] = [combo[0], combo[2]].sort(
    (a, b) => RANKS.indexOf(a) - RANKS.indexOf(b),
  );
  if (high === low) return high + low;
  return high + low + (combo[1] === combo[3] ? 's' : 'o');
}

/** The Range's Combos that hold none of the cards out, as codes. */
function combosOf(range: EquityRange, out: ReadonlySet<number>): Combo[] {
  const combos: Combo[] = [];
  for (const [combo, frequency] of Object.entries(range)) {
    const first = codeOf(combo.slice(0, 2));
    const second = codeOf(combo.slice(2));
    if (frequency > 0 && !out.has(first) && !out.has(second)) {
      combos.push({
        first,
        second,
        handClass: handClassOf(combo),
        frequency: frequency / 100,
      });
    }
  }
  return combos;
}

function sharesCard(a: Combo, b: Combo): boolean {
  return (
    a.first === b.first ||
    a.first === b.second ||
    a.second === b.first ||
    a.second === b.second
  );
}

function holds(combo: Combo, cards: readonly number[]): boolean {
  return cards.includes(combo.first) || cards.includes(combo.second);
}

/** Wins, ties and losses, each counted by its Frequency. */
interface Tally {
  win: number;
  tie: number;
  loss: number;
}

/**
 * Each Combo's wins, ties and losses against the other side, from its own
 * side's view: three numbers per Combo, in the order of its side's Combos.
 */
type Tallies = readonly [Float64Array, Float64Array];

function talliesFor(sides: readonly [Combo[], Combo[]]): Tallies {
  return [
    new Float64Array(sides[0].length * 3),
    new Float64Array(sides[1].length * 3),
  ];
}

/**
 * Counts one showdown between the first side's Combo `i` and the second's
 * `j`, by how much stronger the first is, `times` over.
 */
function count(
  [mine, theirs]: Tallies,
  i: number,
  j: number,
  difference: number,
  times: number,
): void {
  const [mineAt, theirsAt] =
    difference > 0 ? [0, 2] : difference < 0 ? [2, 0] : [1, 1];
  mine[i * 3 + mineAt] += times;
  theirs[j * 3 + theirsAt] += times;
}

/** How many standard errors the margin spans: 95 % confidence. */
const Z_95 = 1.96;

/**
 * How far a sampled share of the pot may be from the exact one, in points of
 * %, when each of its deals counts once: each is worth 1, ½ or 0 of the pot.
 */
function marginOf({ win, tie, loss }: Tally): number {
  const n = win + tie + loss;
  const mean = (win + tie / 2) / n;
  const meanSquare = (win + tie / 4) / n;
  const variance = Math.max(0, meanSquare - mean * mean);
  return Z_95 * Math.sqrt(variance / n) * 100;
}

function shareOf({ win, tie, loss }: Tally): SideEquity {
  const total = win + tie + loss;
  return {
    equity: ((win + tie / 2) / total) * 100,
    win: (win / total) * 100,
    tie: (tie / total) * 100,
  };
}

/** A side's Combos' tallies, added up by Hand Class. */
function byHandClass(combos: Combo[], tallies: Float64Array): Map<string, Tally> {
  const classes = new Map<string, Tally>();
  combos.forEach(({ handClass }, i) => {
    const tally = classes.get(handClass) ?? { win: 0, tie: 0, loss: 0 };
    tally.win += tallies[i * 3];
    tally.tie += tallies[i * 3 + 1];
    tally.loss += tallies[i * 3 + 2];
    classes.set(handClass, tally);
  });
  return classes;
}

function resultOf(
  sides: readonly [Combo[], Combo[]],
  tallies: Tallies,
  exact: boolean,
): EquityResult {
  const classes = [
    byHandClass(sides[0], tallies[0]),
    byHandClass(sides[1], tallies[1]),
  ] as const;
  const total: Tally = { win: 0, tie: 0, loss: 0 };
  for (const { win, tie, loss } of classes[0].values()) {
    total.win += win;
    total.tie += tie;
    total.loss += loss;
  }
  const deals = total.win + total.tie + total.loss;
  const handClasses = classes.map((side) => {
    const equities: Record<string, HandClassEquity> = {};
    for (const [name, tally] of side) {
      const met = tally.win + tally.tie + tally.loss;
      // A Hand Class whose every Combo was blocked never met the other side.
      if (met === 0) continue;
      equities[name] = {
        ...shareOf(tally),
        share: (met / deals) * 100,
        margin: exact ? 0 : marginOf(tally),
      };
    }
    return equities;
  });
  return {
    sides: [
      shareOf(total),
      shareOf({ win: total.loss, tie: total.tie, loss: total.win }),
    ],
    handClasses: [handClasses[0], handClasses[1]],
    exact,
    margin: exact ? 0 : marginOf(total),
  };
}

/** Every way to pick `size` of `items`. */
function* combinations<T>(items: readonly T[], size: number): Generator<T[]> {
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

/** Every Board completion, every pair of Combos that can meet on it. */
function enumerate(
  sides: readonly [Combo[], Combo[]],
  board: readonly number[],
  deck: readonly number[],
): Tallies {
  const tallies = talliesFor(sides);
  // A Combo's cards, then the Board's and the completion's.
  const codes = [0, 0, ...board];
  const strengths = sides.map((combos) => new Int32Array(combos.length));
  for (const completion of combinations(deck, 5 - board.length)) {
    codes.length = 2 + board.length;
    codes.push(...completion);
    sides.forEach((combos, side) =>
      combos.forEach((combo, i) => {
        codes[0] = combo.first;
        codes[1] = combo.second;
        strengths[side][i] = strength(codes);
      }),
    );
    const [mine, theirs] = sides;
    for (let i = 0; i < mine.length; i++) {
      if (holds(mine[i], completion)) continue;
      for (let j = 0; j < theirs.length; j++) {
        if (holds(theirs[j], completion) || sharesCard(mine[i], theirs[j]))
          continue;
        count(
          tallies,
          i,
          j,
          strengths[0][i] - strengths[1][j],
          mine[i].frequency * theirs[j].frequency,
        );
      }
    }
  }
  return tallies;
}

/** All 52 cards as codes. */
const DECK = Array.from({ length: 52 }, (_, code) => code);

/**
 * How much work is still counted exactly: for every way to complete the
 * Board, each Combo's strength and each pair of Combos that can meet. A river
 * always is; so is a turn between Ranges of realistic size, and a Combo
 * against a Range on the flop. Preflop never is: its 1.7 million Boards alone
 * are too many.
 */
export const EXACT_BUDGET = 4_000_000;

/** Deals sampled between two running results. */
const BATCH_DEALS = 10_000;

/** How many ways there are to pick `size` of `count`. */
function choose(count: number, size: number): number {
  let ways = 1;
  for (let i = 0; i < size; i++) ways = (ways * (count - i)) / (i + 1);
  return ways;
}

/** How many pairs of Combos, one per side, share no card. */
function meetings([mine, theirs]: readonly [Combo[], Combo[]]): number {
  let count = 0;
  for (const a of mine) for (const b of theirs) if (!sharesCard(a, b)) count++;
  return count;
}

/** A seeded source of numbers from 0 to 1 (mulberry32), so a sample can be repeated. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws a side's Combo at random, each as likely as its Frequency, as its index. */
function picker(combos: Combo[], random: () => number): () => number {
  const cumulative: number[] = [];
  let total = 0;
  for (const combo of combos) cumulative.push((total += combo.frequency));
  return () => {
    const target = random() * total;
    let [low, high] = [0, combos.length - 1];
    while (low < high) {
      const middle = (low + high) >> 1;
      if (cumulative[middle] > target) high = middle;
      else low = middle + 1;
    }
    return low;
  };
}

/**
 * Random deals, a batch at a time: a Combo for each side by Frequency, the
 * pair thrown back when they share a card, and the Board completed from what
 * is left. The running result after each batch, without end.
 */
function* sample(
  sides: readonly [Combo[], Combo[]],
  board: readonly number[],
  deck: readonly number[],
  seed: number,
): Generator<EquityResult> {
  const random = seeded(seed);
  const [pickMine, pickTheirs] = sides.map((combos) => picker(combos, random));
  const tallies = talliesFor(sides);
  const mine = [0, 0, ...board];
  const theirs = [0, 0, ...board];
  for (;;) {
    for (let deals = 0; deals < BATCH_DEALS;) {
      const i = pickMine();
      const j = pickTheirs();
      const [a, b] = [sides[0][i], sides[1][j]];
      if (sharesCard(a, b)) continue;
      const used = [a.first, a.second, b.first, b.second];
      mine.length = theirs.length = 2 + board.length;
      while (mine.length < 7) {
        const card = deck[Math.floor(random() * deck.length)];
        if (used.includes(card)) continue;
        used.push(card);
        mine.push(card);
        theirs.push(card);
      }
      [mine[0], mine[1]] = [a.first, a.second];
      [theirs[0], theirs[1]] = [b.first, b.second];
      count(tallies, i, j, strength(mine) - strength(theirs), 1);
      deals++;
    }
    yield resultOf(sides, tallies, false);
  }
}

/**
 * The Equity of the first Range against the second, then of the second
 * against the first, as running results: one exact result when the work is
 * small (within `EXACT_BUDGET`, and always on the river), or else a result
 * after every batch of sampled deals, without end, repeatable by its `seed`.
 * Nothing when no Combo of one side can meet one of the other.
 */
export function* equity(
  { ranges, board, dead = [] }: EquityRequest,
  { seed }: { seed: number },
): Generator<EquityResult> {
  const boardCodes = board.map(codeOf);
  const out = new Set([...boardCodes, ...dead.map(codeOf)]);
  const sides = [combosOf(ranges[0], out), combosOf(ranges[1], out)] as const;
  const deck = DECK.filter((code) => !out.has(code));
  const pairs = meetings(sides);
  if (pairs === 0) return;
  const completions = choose(deck.length, 5 - board.length);
  const work = completions * (pairs + sides[0].length + sides[1].length);
  if (board.length === 5 || work <= EXACT_BUDGET) {
    yield resultOf(sides, enumerate(sides, boardCodes, deck), true);
    return;
  }
  yield* sample(sides, boardCodes, deck, seed);
}
