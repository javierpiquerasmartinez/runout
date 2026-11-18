import type { Action, Hand } from '../hand.js';
import { couldRaise } from './hero-stats.js';
import type { Answer } from './preflop-facts.js';
import type {
  ActionWithTable,
  PostflopStreet,
  StreetStart,
} from './street-start.js';
import type { TableState } from './timeline.js';

/**
 * The named Actions on each postflop Street (facts catalogue §3.2), by the
 * prefix of their facts. Each has `Did`, `Chance`, `Faced` and `Answer`.
 * A Delayed C-bet is the turn's alone; a Probe and a Float need a Street
 * before them. `fourBet` is a 4-bet or more.
 */
export const STREET_ACTIONS = {
  flop: [
    'cbet',
    'donkBet',
    'bet',
    'checkRaise',
    'raise',
    'threeBet',
    'fourBet',
  ],
  turn: [
    'cbet',
    'delayedCbet',
    'donkBet',
    'probe',
    'float',
    'bet',
    'checkRaise',
    'raise',
    'threeBet',
    'fourBet',
  ],
  river: [
    'cbet',
    'donkBet',
    'probe',
    'float',
    'bet',
    'checkRaise',
    'raise',
    'threeBet',
    'fourBet',
  ],
} as const satisfies Record<PostflopStreet, readonly string[]>;

export type StreetAction<S extends PostflopStreet = PostflopStreet> =
  (typeof STREET_ACTIONS)[S][number];

/** One named Action's facts; all null when the Hero didn't see the Street. */
export interface ActionQuartet {
  /** The Hero made it. */
  did: boolean | null;
  /** The Hero could have made it. */
  chance: boolean | null;
  /** An opponent made it and the Hero answered it, nobody raising before them. */
  faced: boolean | null;
  /** How the Hero answered it; null unless faced. */
  answer: Answer | null;
}

/** A Street's named Actions as facts: `cbet` → `cbetDid`, `cbetChance`… */
export type StreetActionFacts<S extends PostflopStreet> = {
  [A in StreetAction<S> as `${A}Did` | `${A}Chance` | `${A}Faced`]:
    boolean | null;
} & {
  [A in StreetAction<S> as `${A}Answer`]: Answer | null;
};

/** One Action on a Street, with how the betting stood for it. */
interface Decision extends ActionWithTable {
  /** Its index among the Street's Actions. */
  index: number;
  /** Bets and raises before it on the Street: 0 unopened, 1 a bet, 2 a raise. */
  level: number;
  /** Who made each of those bets and raises, in order. */
  aggressors: string[];
  /**
   * Whether the betting is open to a raise from this player: they haven't
   * put chips in on the Street yet, or it has gone up by at least a full
   * raise since they did. A short all-in raise doesn't reopen it.
   */
  reopened: boolean;
}

/**
 * The Hero's named Actions on each postflop Street, each Street keyed by
 * its own Actions; a Street the Hero didn't see has every fact null.
 */
export function streetActions(
  hand: Hand,
  starts: Record<PostflopStreet, StreetStart | null>,
): { [S in PostflopStreet]: StreetActionFacts<S> } {
  const hero = hand.hero.screenName;
  const preflopAggressor = hand.actions
    .filter((action) => action.street === 'preflop' && aggressive(action))
    .at(-1)?.screenName;
  const cbetChain = continuationBets(hand, preflopAggressor);
  const previous = {
    flop: null,
    turn: starts.flop,
    river: starts.turn,
  } as const;

  const facts = <S extends PostflopStreet>(street: S): StreetActionFacts<S> => {
    const start = starts[street];
    const actions = STREET_ACTIONS[street] as readonly StreetAction[];
    if (!start) {
      return quartets(
        actions.map((action) => [action, EMPTY]),
      ) as StreetActionFacts<S>;
    }
    const read = new StreetReader(
      hero,
      start,
      previous[street],
      hand.stake.bigBlind,
    );
    const all: Record<StreetAction, ActionQuartet> = {
      cbet: read.cbet(cbetChain[street]),
      delayedCbet: read.delayedCbet(preflopAggressor),
      donkBet: read.donkBet(
        street === 'flop'
          ? preflopAggressor
          : previous[street]?.actions.filter((a) => aggressive(a.action)).at(-1)
              ?.action.screenName,
      ),
      probe: read.probe(preflopAggressor),
      float: read.float(),
      bet: read.bet(),
      checkRaise: read.checkRaise(),
      raise: read.raise(),
      threeBet: read.reRaise(2),
      fourBet: read.reRaise(3),
    };
    return quartets(
      actions.map((action) => [action, all[action]]),
    ) as StreetActionFacts<S>;
  };

  return { flop: facts('flop'), turn: facts('turn'), river: facts('river') };
}

const EMPTY: ActionQuartet = {
  did: null,
  chance: null,
  faced: null,
  answer: null,
};

const NONE: ActionQuartet = {
  did: false,
  chance: false,
  faced: false,
  answer: null,
};

function quartets(
  entries: [string, ActionQuartet][],
): Record<string, boolean | Answer | null> {
  return Object.fromEntries(
    entries.flatMap(([action, { did, chance, faced, answer }]) => [
      [`${action}Did`, did],
      [`${action}Chance`, chance],
      [`${action}Faced`, faced],
      [`${action}Answer`, answer],
    ]),
  );
}

function aggressive(action: Action): boolean {
  return action.type === 'bet' || action.type === 'raise';
}

function answerOf(action: Action): Answer {
  if (aggressive(action)) return 'raise';
  return action.type === 'fold' ? 'fold' : 'call';
}

function levelOf(state: TableState): number {
  return Math.max(...state.players.map((player) => player.bet));
}

/**
 * Who could C-bet each Street: the preflop aggressor on the flop, and on
 * the turn and the river only after their C-bet on the Street before, as
 * the Hero Stats count it (`docs/research/hero-stats.md`). Undefined from
 * the first Street the chain is broken on.
 */
function continuationBets(
  hand: Hand,
  aggressor: string | undefined,
): Record<PostflopStreet, string | undefined> {
  const chain: Record<PostflopStreet, string | undefined> = {
    flop: undefined,
    turn: undefined,
    river: undefined,
  };
  if (aggressor === undefined) return chain;
  for (const street of ['flop', 'turn', 'river'] as const) {
    chain[street] = aggressor;
    const actions = hand.actions.filter((action) => action.street === street);
    const first = actions.findIndex((a) => a.screenName === aggressor);
    // Gone, all in, bet into first, or checked: the chain ends here.
    if (first === -1 || actions[first].type !== 'bet') break;
    if (actions.slice(0, first).some(aggressive)) break;
  }
  return chain;
}

/** Reads the named Actions off one Street the Hero saw. */
class StreetReader {
  private readonly decisions: Decision[];
  private readonly own: Decision[];

  constructor(
    private readonly hero: string,
    private readonly start: StreetStart,
    private readonly before: StreetStart | null,
    bigBlind: number,
  ) {
    this.decisions = decisionsOf(start.actions, bigBlind);
    this.own = this.decisions.filter((d) => d.action.screenName === hero);
  }

  /** The Street's first bet, if any. */
  private get firstBet(): Decision | undefined {
    return this.decisions.find((d) => aggressive(d.action));
  }

  /** A player's first Action on the Street. */
  private firstOf(name: string): Decision | undefined {
    return this.decisions.find((d) => d.action.screenName === name);
  }

  /** The player's first Action came before any bet. */
  private unopenedFor(name: string): Decision | undefined {
    const first = this.firstOf(name);
    return first && first.level === 0 ? first : undefined;
  }

  private canRaise(decision: Decision): boolean {
    return decision.reopened && couldRaise(this.hero, decision.before);
  }

  /**
   * The Hero's answer to an opponent's Action: their next Action after it,
   * with nobody raising in between. Undefined when there is none.
   */
  private answerTo(decision: Decision | undefined): Decision | undefined {
    if (!decision || decision.action.screenName === this.hero) return;
    const answer = this.own.find((d) => d.index > decision.index);
    if (!answer) return;
    const between = this.decisions.slice(decision.index + 1, answer.index);
    return between.some((d) => aggressive(d.action)) ? undefined : answer;
  }

  private facedOnly(decision: Decision | undefined): ActionQuartet {
    const answer = this.answerTo(decision);
    return {
      did: false,
      chance: false,
      faced: !!answer,
      answer: answer ? answerOf(answer.action) : null,
    };
  }

  /**
   * An Action that is the Street's first bet by `who`, in a spot `who`
   * qualifies for: for the Hero, did and chance; for an opponent, what
   * the Hero faced.
   */
  private firstBetBy(who: string | undefined): ActionQuartet {
    if (who === undefined) return NONE;
    const spot = this.unopenedFor(who);
    if (who === this.hero) {
      return {
        ...NONE,
        chance: !!spot,
        did: !!spot && spot.action.type === 'bet',
      };
    }
    return this.facedOnly(
      spot && spot.action.type === 'bet' ? spot : undefined,
    );
  }

  /** The preflop aggressor bets first, while the C-bet chain lasts. */
  cbet(aggressor: string | undefined): ActionQuartet {
    return this.firstBetBy(aggressor);
  }

  /**
   * Turn only: the flop was checked by everyone, and the preflop aggressor
   * bets the turn first.
   */
  delayedCbet(aggressor: string | undefined): ActionQuartet {
    if (this.start.street !== 'turn' || !this.checkedThrough()) {
      return NONE;
    }
    return this.firstBetBy(aggressor);
  }

  /**
   * A bet into the aggressor of the Street before (the preflop one on the
   * flop) by a player out of position to them, before they act.
   */
  donkBet(aggressor: string | undefined): ActionQuartet {
    return this.intoBy(aggressor);
  }

  /**
   * Turn or river: the Street before was checked by everyone, the preflop
   * aggressor among them, and a player out of position to them bets first.
   */
  probe(aggressor: string | undefined): ActionQuartet {
    if (this.start.street === 'flop' || !this.checkedThrough()) {
      return NONE;
    }
    const checked = this.before!.actions.some(
      (a) => a.action.screenName === aggressor,
    );
    return checked ? this.intoBy(aggressor) : NONE;
  }

  /**
   * The first bet of a player out of position to `target`, made before
   * `target` acts on the Street: for the Hero, did and chance; when the
   * Hero is `target`, what they faced.
   */
  private intoBy(target: string | undefined): ActionQuartet {
    if (target === undefined) return NONE;
    const { inHand, dealt } = this.start;
    const targetState = dealt.players.find((p) => p.screenName === target);
    if (!inHand.includes(target) || !targetState || targetState.allIn) {
      return NONE;
    }
    const outOfPosition = (name: string) =>
      name !== target && inHand.indexOf(name) < inHand.indexOf(target);
    const targetFirst = this.firstOf(target);
    const beforeTarget = (d: Decision) =>
      !targetFirst || d.index < targetFirst.index;
    if (target === this.hero) {
      const bet = this.firstBet;
      return this.facedOnly(
        bet &&
          bet.action.type === 'bet' &&
          beforeTarget(bet) &&
          outOfPosition(bet.action.screenName)
          ? bet
          : undefined,
      );
    }
    if (!outOfPosition(this.hero)) return NONE;
    const spot = this.unopenedFor(this.hero);
    const chance = !!spot && beforeTarget(spot);
    return {
      ...NONE,
      chance,
      did: chance && spot!.action.type === 'bet',
    };
  }

  /**
   * Turn or river: a player who called a bet on the Street before, last to
   * act on it, bets when checked to.
   */
  float(): ActionQuartet {
    if (!this.before) return NONE;
    const floater = this.before.inHand.at(-1)!;
    const lastThere = this.before.actions
      .filter((a) => a.action.screenName === floater)
      .at(-1);
    if (lastThere?.action.type !== 'call') return NONE;
    const spot = this.unopenedFor(floater);
    // Checked to: somebody checked before them.
    if (!spot || !this.decisions.some((d) => d.index < spot.index)) {
      return NONE;
    }
    if (floater === this.hero) {
      return { ...NONE, chance: true, did: spot.action.type === 'bet' };
    }
    return this.facedOnly(spot.action.type === 'bet' ? spot : undefined);
  }

  /** The Street before had Actions, every one a check. */
  private checkedThrough(): boolean {
    const actions = this.before?.actions ?? [];
    return (
      actions.length > 0 && actions.every((a) => a.action.type === 'check')
    );
  }

  /** Any first bet on the Street. */
  bet(): ActionQuartet {
    const bet = this.firstBet;
    const own = this.firstBetBy(this.hero);
    if (bet && bet.action.screenName !== this.hero) {
      return { ...this.facedOnly(bet), chance: own.chance };
    }
    return own;
  }

  /**
   * The Hero checked and then raised a bet, or checked and faced a bet they
   * could raise; or an opponent check-raised the Hero's bet.
   */
  checkRaise(): ActionQuartet {
    const [first, second] = this.own;
    const chance =
      first?.action.type === 'check' && !!second && this.canRaise(second);
    const raiser = this.decisions.find((d) => {
      if (d.action.type !== 'raise' || d.action.screenName === this.hero) {
        return false;
      }
      const checked = this.firstOf(d.action.screenName)?.action.type;
      return checked === 'check' && d.aggressors.at(-1) === this.hero;
    });
    return {
      ...this.facedOnly(raiser),
      chance,
      did: chance && second.action.type === 'raise',
    };
  }

  /** Any raise; faced: a raise of the Hero's bet. */
  raise(): ActionQuartet {
    const did = this.own.some((d) => d.action.type === 'raise');
    return {
      ...this.facedOnly(this.raiseOf(1)),
      did,
      chance: did || this.own.some((d) => d.level >= 1 && this.canRaise(d)),
    };
  }

  /**
   * A 3-bet (re-raising a raise: `level` 2) or a 4-bet or more (`level` 3):
   * faced when the Hero's raise one level down was re-raised.
   */
  reRaise(level: 2 | 3): ActionQuartet {
    const spots = this.own.filter((d) =>
      level === 2 ? d.level === 2 : d.level >= 3,
    );
    const did = spots.some((d) => d.action.type === 'raise');
    return {
      ...this.facedOnly(this.raiseOf(level)),
      did,
      chance: did || spots.some((d) => this.canRaise(d)),
    };
  }

  /**
   * An opponent's raise of the Hero's own bet or raise: the bet when
   * `level` is 1, the raise when 2, a 3-bet or more when 3.
   */
  private raiseOf(level: 1 | 2 | 3): Decision | undefined {
    return this.decisions.find(
      (d) =>
        d.action.type === 'raise' &&
        d.action.screenName !== this.hero &&
        (level === 3 ? d.level >= 3 : d.level === level) &&
        d.aggressors.at(-1) === this.hero,
    );
  }
}

/** Every Action on a Street, with how the betting stood for it. */
function decisionsOf(
  actions: ActionWithTable[],
  bigBlind: number,
): Decision[] {
  // What a full raise adds: a big blind to begin with, then the largest.
  let fullRaise = bigBlind;
  const aggressors: string[] = [];
  // Each player's last Action that put chips in: the level then, and a full raise.
  const putIn = new Map<string, { level: number; fullRaise: number }>();
  return actions.map((played, index) => {
    const { action, before } = played;
    const last = putIn.get(action.screenName);
    const decision: Decision = {
      ...played,
      index,
      level: aggressors.length,
      aggressors: [...aggressors],
      reopened: !last || levelOf(before) - last.level >= last.fullRaise,
    };
    // The table after it; none after the Street's last Action, which no
    // later one is measured against.
    const after = actions[index + 1]?.before ?? before;
    if (aggressive(action)) {
      const level = levelOf(after);
      const added = level - levelOf(before);
      if (added >= fullRaise) fullRaise = added;
      aggressors.push(action.screenName);
      putIn.set(action.screenName, { level, fullRaise });
    } else if (action.type === 'call') {
      putIn.set(action.screenName, { level: levelOf(before), fullRaise });
    }
    return decision;
  });
}
