/** Combo → Frequency, a whole number from 1 to 100. A Combo left out is at 0 %. */
export type Combos = Record<string, number>;

/** Ranks from the highest down, and the suits in the order a pair writes them. */
const RANKS = 'AKQJT98765432'.split('');
const SUITS = 'shdc'.split('');

/**
 * Every Combo of two cards, written as the Lab writes it: the higher rank
 * first, and a pair's suits in `shdc` order (`AhKd`, `7s7c`). 1326 in all.
 */
export const COMBOS: ReadonlySet<string> = new Set(
  RANKS.flatMap((high, h) =>
    RANKS.slice(h).flatMap((low, offset) =>
      SUITS.flatMap((highSuit, i) =>
        SUITS.filter((_, j) => offset > 0 || j > i).map(
          (lowSuit) => `${high}${highSuit}${low}${lowSuit}`,
        ),
      ),
    ),
  ),
);
