import type { Action, Hand } from '../hand.js';
import type { Position } from './positions.js';
import { timeline, type TableState, type Timeline } from './timeline.js';

/** The Streets dealt after the preflop, in order. */
export const POSTFLOP_STREETS = ['flop', 'turn', 'river'] as const;

export type PostflopStreet = (typeof POSTFLOP_STREETS)[number];

/** One Action on a Street, with the table as it stood when it was made. */
export interface StreetStep {
  action: Action;
  before: TableState;
}

/**
 * How one postflop Street stood for the Hero as it began, and what was done
 * on it: the base every per-Street fact is read from (facts catalogue §3).
 */
export interface StreetSituation {
  street: PostflopStreet;
  /** The table as the Street was dealt, bets gathered into the pot. */
  start: TableState;
  /** The players who hadn't folded as it began, all in included, in postflop acting order. */
  inHand: string[];
  /** The Hero acts last among `inHand`. */
  heroIp: boolean;
  /** The Hero acts first among `inHand`. */
  heroFirst: boolean;
  /** The Hero had no chips left as it began. */
  heroAllIn: boolean;
  /**
   * The smaller of the Hero's Stack and the deepest Stack among the
   * opponents still in, as it began, as an Amount.
   */
  effectiveStack: number;
  /** Every Action on the Street, in order. */
  steps: StreetStep[];
}

/** Postflop acting order: the small blind first, the button last. */
const POSTFLOP_ORDER: readonly Position[] = [
  'SB',
  'BB',
  'UTG',
  'UTG+1',
  'MP',
  'LJ',
  'HJ',
  'CO',
  'BTN',
];

/**
 * The Hero's situation on each postflop Street, or null for one that wasn't
 * dealt, that the Hero had folded before, or in a Hand whose table has no
 * Positions to order the players by.
 */
export function streetSituations(
  hand: Hand,
  line: Timeline = timeline(hand),
): Record<PostflopStreet, StreetSituation | null> {
  const hero = hand.hero.screenName;
  const positionOf = new Map(
    line.seats.map((seat) => [seat.screenName, seat.position]),
  );
  const order = (name: string) => POSTFLOP_ORDER.indexOf(positionOf.get(name)!);

  const situation = (street: PostflopStreet): StreetSituation | null => {
    // The deal of the Street: its first state, before any Action on it.
    const dealt = line.states.findIndex(
      (state) => state.street === street && state.result === null,
    );
    if (dealt === -1) return null;
    const start = line.states[dealt];
    const heroState = start.players.find((p) => p.screenName === hero);
    if (!heroState || heroState.folded) return null;

    const inHand = start.players
      .filter((p) => !p.folded)
      .map((p) => p.screenName)
      .sort((a, b) => order(a) - order(b));
    const deepestOpponent = Math.max(
      0,
      ...start.players
        .filter((p) => !p.folded && p.screenName !== hero)
        .map((p) => p.stack),
    );
    const steps: StreetStep[] = [];
    for (let i = dealt + 1; i < line.states.length; i++) {
      const state = line.states[i];
      if (state.street !== street || state.action === null) break;
      steps.push({ action: state.action, before: line.states[i - 1] });
    }
    return {
      street,
      start,
      inHand,
      heroIp: inHand.at(-1) === hero,
      heroFirst: inHand[0] === hero,
      heroAllIn: heroState.stack === 0,
      effectiveStack: Math.min(heroState.stack, deepestOpponent),
      steps,
    };
  };

  return {
    flop: situation('flop'),
    turn: situation('turn'),
    river: situation('river'),
  };
}
