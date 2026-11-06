import type { Action, Hand, Post, Street } from '../hand.js';
import { positions, type Position } from './positions.js';
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
  const stats = {
    ...(Object.fromEntries(STAT_KEYS.map((key) => [key, NONE])) as HeroStats),
    ...continuationBets(hand),
  };
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
    ...stealAndBlindStats(hand, decisions),
  };
}

type Decision = { action: Action; before: TableState };

/** The Positions a raise folded to them is a steal from. */
const STEALING: ReadonlySet<Position | undefined> = new Set([
  'CO',
  'BTN',
  'SB',
]);

/** The posts that put a player's money in at the open's level. */
const BLINDS: ReadonlySet<Post['kind']> = new Set([
  'small-blind',
  'big-blind',
  'small-and-big-blinds',
  'straddle',
]);

/**
 * Attempt to Steal, Fold BB to Steal and Cold Call, all read off the
 * Hero's first preflop decision and the Actions before it.
 */
function stealAndBlindStats(
  hand: Hand,
  decisions: Decision[],
): Pick<HeroStats, 'steal' | 'fold-bb-to-steal' | 'cold-call'> {
  const name = hand.hero.screenName;
  const positionOf = positions(hand);
  const [first] = decisions;
  const preflop = hand.actions.filter((action) => action.street === 'preflop');
  // Others' Actions before the Hero's first decision. A check (a player who
  // posted a big blind to come in) puts nothing in voluntarily.
  const before = preflop.slice(
    0,
    preflop.findIndex((action) => action.screenName === name),
  );
  const putIn = before.filter(
    (action) => action.type !== 'fold' && action.type !== 'check',
  );
  const raising = (action: Action) =>
    action.type === 'bet' || action.type === 'raise';

  // Folded to the Hero in the cutoff, button or small blind.
  const stealChance =
    STEALING.has(positionOf.get(name)) &&
    putIn.length === 0 &&
    couldRaise(name, first.before);
  // The Hero's big blind facing a lone open raise from one of those
  // Positions: no caller and no re-raise between it and the Hero.
  const [open] = putIn;
  const stolenFrom =
    positionOf.get(name) === 'BB' &&
    putIn.length === 1 &&
    raising(open) &&
    STEALING.has(positionOf.get(open.screenName));
  // Facing a raise with nothing in voluntarily: this is the Hero's first
  // decision. A blind (a straddle too) already has money in at the open's
  // level, so only a 3-bet or more gives them a cold call, as in PT4.
  const blind = hand.posts.some(
    (post) => post.screenName === name && BLINDS.has(post.kind),
  );
  const coldCallChance = before.filter(raising).length >= (blind ? 2 : 1);
  return {
    steal: {
      opportunities: stealChance ? 1 : 0,
      taken: stealChance && raising(first.action) ? 1 : 0,
    },
    'fold-bb-to-steal': {
      opportunities: stolenFrom ? 1 : 0,
      taken: stolenFrom && first.action.type === 'fold' ? 1 : 0,
    },
    'cold-call': {
      opportunities: coldCallChance ? 1 : 0,
      taken: coldCallChance && first.action.type === 'call' ? 1 : 0,
    },
  };
}

/** Each postflop Street, with its C-bet Stat and its Fold to C-bet Stat. */
const CBET_STREETS = [
  ['flop', 'cbet-flop', 'fold-to-cbet-flop'],
  ['turn', 'cbet-turn', 'fold-to-cbet-turn'],
  ['river', 'cbet-river', 'fold-to-cbet-river'],
] as const satisfies [Street, StatKey, StatKey][];

/**
 * The C-bet Stats, from either side of the preflop aggressor (whoever made
 * the last preflop raise). On each Street they have a C-bet opportunity when
 * they act before anybody bets, and they take it by betting; on the turn and
 * the river only after a C-bet on the Street before. A Hero facing that
 * C-bet as the Street's first bet, with nobody raising it before them, has a
 * Fold to C-bet opportunity. Multiway pots count like heads-up ones.
 */
function continuationBets(hand: Hand): Partial<HeroStats> {
  const hero = hand.hero.screenName;
  const aggressive = (action: Action) =>
    action.type === 'bet' || action.type === 'raise';
  const aggressor = hand.actions
    .filter((action) => action.street === 'preflop' && aggressive(action))
    .at(-1)?.screenName;
  const stats: Partial<HeroStats> = {};
  if (aggressor === undefined) return stats;
  for (const [street, cbetKey, foldKey] of CBET_STREETS) {
    const actions = hand.actions.filter((action) => action.street === street);
    const firstBet = actions.findIndex(aggressive);
    const chance = actions.findIndex(
      (action) => action.screenName === aggressor,
    );
    // Gone, all in, or bet into first (a donk bet): no C-bet from here on.
    if (chance === -1 || (firstBet !== -1 && firstBet < chance)) break;
    const cbet = firstBet === chance;
    if (aggressor === hero) {
      stats[cbetKey] = { opportunities: 1, taken: cbet ? 1 : 0 };
    }
    if (!cbet) break;
    const after = actions.slice(firstBet + 1);
    const answer = after.findIndex((action) => action.screenName === hero);
    const raised = after.findIndex(aggressive);
    // Facing a raise of the C-bet instead is no Fold to C-bet opportunity;
    // the Hero's own raise of it is their answer.
    if (answer !== -1 && (raised === -1 || answer <= raised)) {
      stats[foldKey] = {
        opportunities: 1,
        taken: after[answer].type === 'fold' ? 1 : 0,
      };
    }
  }
  return stats;
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
