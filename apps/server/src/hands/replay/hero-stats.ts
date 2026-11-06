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
    ...reRaiseStats(hand, states),
  };
}

type ReRaiseKey =
  | 'three-bet'
  | 'fold-to-three-bet'
  | 'four-bet'
  | 'fold-to-four-bet'
  | 'squeeze';

/** A preflop Action, with how the betting stood when its player made it. */
interface PreflopDecision {
  action: Action;
  before: TableState;
  /**
   * How many raises came before it: 1 is an open raise, 2 a 3-bet. Blinds
   * and straddles are posts, so the first raise over a straddle is an open.
   * A short all-in raise counts too.
   */
  raises: number;
  /** Who made each of those raises, in order. */
  raisers: string[];
  /** How many calls the last raise had before this Action. */
  callers: number;
  /**
   * Whether the betting is open to a raise from this player: they haven't
   * acted yet, or it has gone up by at least a full raise since they did.
   * A short all-in raise alone doesn't reopen it for those who have acted.
   */
  reopened: boolean;
}

/**
 * The Hero's 3-bet, Fold to 3-bet, 4-bet, Fold to 4-bet and Squeeze: each
 * the first time the Hero faces that spot preflop, at most one opportunity
 * per Hand.
 */
function reRaiseStats(
  hand: Hand,
  states: TableState[],
): Record<ReRaiseKey, StatCount> {
  const name = hand.hero.screenName;
  const mine = preflopDecisions(hand, states).filter(
    (decision) => decision.action.screenName === name,
  );
  const raise = (decision: PreflopDecision) =>
    decision.action.type === 'raise' || decision.action.type === 'bet';
  // A re-raise Stat: the Hero faced it and either raised, or could have.
  const reRaise = (decision: PreflopDecision | undefined): StatCount => {
    if (!decision) return NONE;
    if (raise(decision)) return { opportunities: 1, taken: 1 };
    const could = decision.reopened && couldRaise(name, decision.before);
    return { opportunities: could ? 1 : 0, taken: 0 };
  };
  // A fold Stat: the Hero faced it, and folded or didn't.
  const fold = (decision: PreflopDecision | undefined): StatCount =>
    decision
      ? { opportunities: 1, taken: decision.action.type === 'fold' ? 1 : 0 }
      : NONE;
  const facingOpen = mine.find((decision) => decision.raises === 1);
  const facingThreeBet = mine.find((decision) => decision.raises === 2);
  return {
    'three-bet': reRaise(facingOpen),
    squeeze: reRaise(
      facingOpen && facingOpen.callers > 0 ? facingOpen : undefined,
    ),
    'four-bet': reRaise(facingThreeBet),
    'fold-to-three-bet': fold(
      facingThreeBet?.raisers[0] === name ? facingThreeBet : undefined,
    ),
    'fold-to-four-bet': fold(
      mine.find(
        (decision) => decision.raises >= 3 && decision.raisers[1] === name,
      ),
    ),
  };
}

/** Every preflop Action, in order, with how the betting stood for it. */
function preflopDecisions(hand: Hand, states: TableState[]): PreflopDecision[] {
  const decisions: PreflopDecision[] = [];
  const level = (state: TableState) =>
    Math.max(...state.players.map((player) => player.bet));
  // What a full raise adds: the big blind, or the straddle, to begin with.
  let fullRaise = Math.max(level(states[0]), hand.stake.bigBlind);
  const raisers: string[] = [];
  let callers = 0;
  // Each player's last Action: the level after it and a full raise then.
  const acted = new Map<string, { level: number; fullRaise: number }>();
  states.forEach((state, index) => {
    const { action } = state;
    if (action?.street !== 'preflop') return;
    const before = states[index - 1];
    const last = acted.get(action.screenName);
    decisions.push({
      action,
      before,
      raises: raisers.length,
      raisers: [...raisers],
      callers,
      reopened: !last || level(before) - last.level >= last.fullRaise,
    });
    if (action.type === 'raise' || action.type === 'bet') {
      const added = level(state) - level(before);
      if (added >= fullRaise) fullRaise = added;
      raisers.push(action.screenName);
      callers = 0;
    } else if (action.type === 'call' && raisers.length > 0) {
      callers += 1;
    }
    acted.set(action.screenName, { level: level(state), fullRaise });
  });
  return decisions;
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
