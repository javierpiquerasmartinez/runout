/**
 * A Hand as the import module reads it from a Hand History: one dealt hand
 * recorded from one Hero's seat (ADR 0002). It is stored as is, and the
 * Replay module derives everything else from it.
 *
 * Every Amount is an integer in hundredths of the Hand's currency, so €0.05
 * is 5, and cards are written rank then suit with tens as "10" ("10h", "As").
 */
export interface Hand {
  site: PokerSite;
  /** The Poker Site's own id for the hand. */
  siteHandId: string;
  sourceFormat: SourceFormat;
  /** ISO 8601, in UTC. */
  playedAt: string;
  tableName: string;
  /** Seats the table has, whether or not they are taken. */
  tableSize: number;
  buttonSeat: number;
  stake: Stake;
  /** Taken seats, in seat order. */
  seats: Seat[];
  hero: { screenName: string; cards: string[] };
  posts: Post[];
  actions: Action[];
  /** The community cards, in the order they were dealt. */
  board: string[];
  /** Bets nobody matched, handed back before the pot was awarded. */
  returned: { screenName: string; amount: number }[];
  /** Whether the Hand reached Showdown. */
  showdown: boolean;
  /** Hole cards shown at Showdown. */
  shown: { screenName: string; cards: string[] }[];
  /**
   * What each winner took, and from which pot: 0 is the main pot, then side
   * pots from 1. Hands imported before pots were recorded have no `pot`.
   */
  collected: { screenName: string; amount: number; pot?: number }[];
  rake: number;
}

export type PokerSite = 'pokerstars';

/** The layout the Hand History was written in. */
export type SourceFormat = 'pokerstars';

export interface Stake {
  limit: 'no-limit' | 'pot-limit' | 'fixed-limit';
  smallBlind: number;
  bigBlind: number;
  /** ISO 4217 code, e.g. "EUR". */
  currency: string;
}

export interface Seat {
  seat: number;
  screenName: string;
  startingStack: number;
  /** Seated but not dealt in. */
  sittingOut: boolean;
}

export interface Post {
  screenName: string;
  kind:
    'small-blind' | 'big-blind' | 'small-and-big-blinds' | 'straddle' | 'ante';
  amount: number;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type Action = { street: Street; screenName: string; allIn: boolean } & (
  | { type: 'fold' | 'check' }
  | { type: 'call' | 'bet'; amount: number }
  /** `to` is the player's total bet on the Street after raising. */
  | { type: 'raise'; amount: number; to: number }
);
