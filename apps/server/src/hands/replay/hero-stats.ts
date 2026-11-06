import type { Action, Hand } from '../hand.js';
import { timeline, type TableState } from './timeline.js';

/**
 * Every Stat, by its stable key, in the order the Stats view shows them:
 * Preflop, then Postflop, then Showdown. The keys are stored with each
 * Hand's Stat rows and travel in the Library Stats API, so they never change.
 */
export const STAT_KEYS = [
  'vpip',
  'pfr',
  'three-bet',
  'fold-to-three-bet',
  'four-bet',
  'fold-to-four-bet',
  'squeeze',
  'cold-call',
  'fold-bb-to-steal',
  'steal',
  'cbet-flop',
  'fold-to-cbet-flop',
  'check-raise-flop',
  'cbet-turn',
  'fold-to-cbet-turn',
  'cbet-river',
  'fold-to-cbet-river',
  'afq',
  'wwsf',
  'wtsd',
  'wsd',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/** How many times the Hero had the chance to make a Stat's decision, and how many times they made it. */
export interface StatCount {
  opportunities: number;
  taken: number;
}

export type HeroStats = Record<StatKey, StatCount>;

const NONE: StatCount = { opportunities: 0, taken: 0 };

/**
 * The Hero's Stats in one Hand: for every Stat, how many opportunities they
 * had and how many they took. This is the only place Stat definitions live;
 * everything else counts what it returns. Stats not defined yet count no
 * opportunity.
 */
export function heroStats(hand: Hand): HeroStats {
  const stats = Object.fromEntries(
    STAT_KEYS.map((key) => [key, NONE]),
  ) as HeroStats;
  const name = hand.hero.screenName;
  const { states } = timeline(hand);
  // Each preflop decision of the Hero, with the table as it stood before it.
  const decisions = states.flatMap((state, index) =>
    state.action?.street === 'preflop' && state.action.screenName === name
      ? [{ action: state.action, before: states[index - 1] }]
      : [],
  );
  // A walk, or a Hero all in from their blind: no decision, no opportunity.
  if (decisions.length === 0) return stats;
  const did = (...types: Action['type'][]) =>
    decisions.some(({ action }) => types.includes(action.type)) ? 1 : 0;
  const raised = did('bet', 'raise');
  return {
    ...stats,
    // Every Hand the Hero had a say in: posts are forced, never voluntary.
    vpip: { opportunities: 1, taken: did('call', 'bet', 'raise') },
    pfr: {
      opportunities: raised || couldRaise(name, decisions[0].before) ? 1 : 0,
      taken: raised,
    },
  };
}

/**
 * Whether the player could put in more than a call, at a point where it's
 * their turn: they have chips beyond what calling takes, and someone still
 * in has chips behind to answer a raise. Facing an all-in their Stack
 * can't cover, or with everyone else folded or all in, they can only call.
 */
function couldRaise(name: string, before: TableState): boolean {
  const toCall = Math.max(...before.players.map((player) => player.bet));
  const player = before.players.find((p) => p.screenName === name)!;
  const answerable = before.players.some(
    (other) => other.screenName !== name && !other.folded && !other.allIn,
  );
  return player.stack + player.bet > toCall && answerable;
}
