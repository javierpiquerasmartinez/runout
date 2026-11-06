import type { Action, Hand, Street } from '../hand.js';
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
  // Set before the preflop ones, since they need no preflop decision: a Hero
  // all in from their blind still sees the flop.
  Object.assign(stats, {
    'check-raise-flop': checkRaiseFlop(name, states),
    afq: afq(name, hand),
    ...showdownStats(name, hand),
  });
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

/** The player's Actions on a Street, each with the table as it stood before it. */
function decisionsOn(
  street: Street,
  name: string,
  states: TableState[],
): { action: Action; before: TableState }[] {
  return states.flatMap((state, index) =>
    state.action?.street === street && state.action.screenName === name
      ? [{ action: state.action, before: states[index - 1] }]
      : [],
  );
}

/**
 * Flop Check-raise: the Hero checked the flop and then faced a bet they
 * could raise (opportunity), and raised it (taken). A bet they can only
 * call, such as an all-in their Stack covers with nobody else to answer, is
 * no opportunity, as with PFR.
 */
function checkRaiseFlop(name: string, states: TableState[]): StatCount {
  const [first, second] = decisionsOn('flop', name, states);
  if (
    first?.action.type !== 'check' ||
    !second ||
    !couldRaise(name, second.before)
  ) {
    return NONE;
  }
  return { opportunities: 1, taken: second.action.type === 'raise' ? 1 : 0 };
}

/**
 * AFq, PT4's aggression frequency, counted per Action: every postflop bet,
 * raise, call or fold of the Hero is an opportunity, and the bets and raises
 * are taken. Checks don't count. The one Stat where a Hand can add more
 * than one.
 */
function afq(name: string, hand: Hand): StatCount {
  const actions = hand.actions.filter(
    (action) =>
      action.street !== 'preflop' &&
      action.screenName === name &&
      action.type !== 'check',
  );
  return {
    opportunities: actions.length,
    taken: actions.filter((a) => a.type === 'bet' || a.type === 'raise').length,
  };
}

/**
 * WTSD, W$SD and WWSF. The Hero saw the flop when it was dealt and they
 * hadn't folded, so a preflop all-in run out to Showdown counts. They won
 * money when they collected from any pot, a split or a side pot alone
 * included.
 */
function showdownStats(
  name: string,
  hand: Hand,
): Pick<HeroStats, 'wtsd' | 'wsd' | 'wwsf'> {
  const fold = hand.actions.find(
    (action) => action.screenName === name && action.type === 'fold',
  );
  const sawFlop = hand.board.length >= 3 && fold?.street !== 'preflop' ? 1 : 0;
  const reachedShowdown = hand.showdown && !fold ? 1 : 0;
  const wonMoney = hand.collected.some(
    (winner) => winner.screenName === name && winner.amount > 0,
  )
    ? 1
    : 0;
  return {
    wtsd: { opportunities: sawFlop, taken: reachedShowdown },
    wsd: { opportunities: reachedShowdown, taken: reachedShowdown && wonMoney },
    wwsf: { opportunities: sawFlop, taken: sawFlop && wonMoney },
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
