import type { Action, Hand } from '../hand.js';
import type { Position } from './positions.js';
import { timeline, type TableState, type Timeline } from './timeline.js';

/** The Streets dealt after the preflop, in order. */
export const POSTFLOP_STREETS = ['flop', 'turn', 'river'] as const;

export type PostflopStreet = (typeof POSTFLOP_STREETS)[number];

/** One Action on a Street, with the table as it stood when it was made. */
export interface ActionWithTable {
  action: Action;
  before: TableState;
}

/**
 * How one postflop Street stood for the Hero as it began, and the Actions
 * on it: the base every per-Street fact is read from (facts catalogue §3).
 */
export interface StreetStart {
  street: PostflopStreet;
  /** The table as the Street was dealt, bets gathered into the pot. */
  dealt: TableState;
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
  actions: ActionWithTable[];
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
 * How each postflop Street began for the Hero, or null for one that wasn't
 * dealt, that the Hero had folded before, or in a Hand whose table has no
 * Positions to order the players by.
 */
export function streetStarts(
  hand: Hand,
  line: Timeline = timeline(hand),
): Record<PostflopStreet, StreetStart | null> {
  const hero = hand.hero.screenName;
  const positionOf = new Map(
    line.seats.map((seat) => [seat.screenName, seat.position]),
  );
  const order = (name: string) => POSTFLOP_ORDER.indexOf(positionOf.get(name)!);

  const startOf = (street: PostflopStreet): StreetStart | null => {
    // The deal of the Street: its first state, before any Action on it.
    const dealtAt = line.states.findIndex(
      (state) => state.street === street && state.result === null,
    );
    if (dealtAt === -1) return null;
    const dealt = line.states[dealtAt];
    const heroState = dealt.players.find((p) => p.screenName === hero);
    if (!heroState || heroState.folded) return null;

    const inHand = dealt.players
      .filter((p) => !p.folded)
      .map((p) => p.screenName)
      .sort((a, b) => order(a) - order(b));
    const deepestOpponent = Math.max(
      0,
      ...dealt.players
        .filter((p) => !p.folded && p.screenName !== hero)
        .map((p) => p.stack),
    );
    const actions: ActionWithTable[] = [];
    for (let i = dealtAt + 1; i < line.states.length; i++) {
      const state = line.states[i];
      if (state.street !== street || state.action === null) break;
      actions.push({ action: state.action, before: line.states[i - 1] });
    }
    return {
      street,
      dealt,
      inHand,
      heroIp: inHand.at(-1) === hero,
      heroFirst: inHand[0] === hero,
      heroAllIn: heroState.stack === 0,
      effectiveStack: Math.min(heroState.stack, deepestOpponent),
      actions,
    };
  };

  return {
    flop: startOf('flop'),
    turn: startOf('turn'),
    river: startOf('river'),
  };
}
