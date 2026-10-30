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

export interface EquityResult {
  sides: [SideEquity, SideEquity];
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
  /** Its Frequency, from 0 to 1. */
  frequency: number;
}

/** The Range's Combos that hold none of the cards out, as codes. */
function combosOf(range: EquityRange, out: ReadonlySet<number>): Combo[] {
  const combos: Combo[] = [];
  for (const [combo, frequency] of Object.entries(range)) {
    const first = codeOf(combo.slice(0, 2));
    const second = codeOf(combo.slice(2));
    if (frequency > 0 && !out.has(first) && !out.has(second)) {
      combos.push({ first, second, frequency: frequency / 100 });
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

/** The first side's wins, ties and losses, each counted by its Frequency. */
interface Tally {
  win: number;
  tie: number;
  loss: number;
}

/** Counts one showdown, by how much stronger the first side is, `times` over. */
function count(tally: Tally, difference: number, times: number): void {
  if (difference > 0) tally.win += times;
  else if (difference < 0) tally.loss += times;
  else tally.tie += times;
}

function resultOf(
  { win, tie, loss }: Tally,
  exact: boolean,
  margin: number,
): EquityResult {
  const total = win + tie + loss;
  const side = (wins: number): SideEquity => ({
    equity: ((wins + tie / 2) / total) * 100,
    win: (wins / total) * 100,
    tie: (tie / total) * 100,
  });
  return { sides: [side(win), side(loss)], exact, margin };
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
): Tally {
  const tally: Tally = { win: 0, tie: 0, loss: 0 };
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
          tally,
          strengths[0][i] - strengths[1][j],
          mine[i].frequency * theirs[j].frequency,
        );
      }
    }
  }
  return tally;
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

/** How many standard errors the margin spans: 95 % confidence. */
const Z_95 = 1.96;

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

/** Draws a side's Combo at random, each as likely as its Frequency. */
function picker(combos: Combo[], random: () => number): () => Combo {
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
    return combos[low];
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
  const tally: Tally = { win: 0, tie: 0, loss: 0 };
  const mine = [0, 0, ...board];
  const theirs = [0, 0, ...board];
  for (;;) {
    for (let deals = 0; deals < BATCH_DEALS;) {
      const a = pickMine();
      const b = pickTheirs();
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
      count(tally, strength(mine) - strength(theirs), 1);
      deals++;
    }
    const n = tally.win + tally.tie + tally.loss;
    // Each deal is worth 1, ½ or 0 of the pot to the first side.
    const mean = (tally.win + tally.tie / 2) / n;
    const meanSquare = (tally.win + tally.tie / 4) / n;
    const variance = Math.max(0, meanSquare - mean * mean);
    yield resultOf(tally, false, Z_95 * Math.sqrt(variance / n) * 100);
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
    yield resultOf(enumerate(sides, boardCodes, deck), true, 0);
    return;
  }
  yield* sample(sides, boardCodes, deck, seed);
}
