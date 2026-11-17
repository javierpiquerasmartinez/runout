import type { Action, Hand } from '../hand.js';
import {
  BLINDS,
  couldRaise,
  preflopDecisions,
  STEALING,
  type PreflopDecision,
} from './hero-stats.js';
import { positions } from './positions.js';
import { timeline, type TableState } from './timeline.js';

/** How the Hero answered an Action they faced. */
export const ANSWERS = ['fold', 'call', 'raise'] as const;

export type Answer = (typeof ANSWERS)[number];

/**
 * Where the Hero's preflop ended, by their last voluntary Action: a raise,
 * a call, or neither.
 */
export const PREFLOP_ROLES = [
  'opener',
  'isolator',
  '3-bettor',
  '4-bettor',
  '5-bettor-plus',
  'limper',
  'called-open',
  'called-3-bet',
  'called-4-bet-plus',
  'walk',
  'checked',
  'folded',
] as const;

export type PreflopRole = (typeof PREFLOP_ROLES)[number];

/** What the Hero faced at their first preflop Action. */
export const PREFLOP_FACED_FIRST = [
  'unopened',
  'limps',
  'open',
  '3-bet',
  '4-bet-plus',
] as const;

export type PreflopFacedFirst = (typeof PREFLOP_FACED_FIRST)[number];

/**
 * The named preflop Actions, by the prefix of their facts. Each has `Did`
 * and `Chance`; those listed in `FACED_ACTIONS` also have `Faced` and
 * `Answer`.
 */
export const PREFLOP_ACTIONS = [
  'vpip',
  'pfr',
  'open',
  'limp',
  'isolate',
  'steal',
  'threeBet',
  'squeeze',
  'coldCall',
  'fourBet',
  'fiveBet',
  'resteal',
] as const;

export const FACED_ACTIONS = [
  'isolate',
  'steal',
  'threeBet',
  'squeeze',
  'fourBet',
  'fiveBet',
  'resteal',
] as const satisfies readonly (typeof PREFLOP_ACTIONS)[number][];

type DidChance = {
  [A in (typeof PREFLOP_ACTIONS)[number] as `${A}Did` | `${A}Chance`]: boolean;
};
type Faced = {
  [A in (typeof FACED_ACTIONS)[number] as `${A}Faced`]: boolean;
} & {
  [A in (typeof FACED_ACTIONS)[number] as `${A}Answer`]: Answer | null;
};

/**
 * The Hero's preflop facts (facts catalogue §1 and §2.2–2.3), other than the
 * pot's shape. Sizes and stacks are in big blinds, or a multiple where the
 * name says so, kept to two decimals.
 */
export type PreflopFacts = DidChance &
  Faced & {
    preflopRole: PreflopRole | null;
    /** Null when the Hero made no preflop Action. */
    preflopFacedFirst: PreflopFacedFirst | null;
    /** Limps before the first raise, or in the whole Hand when nobody raised. */
    limpers: number;
    /** The Hero's preflop Actions, one letter each (X, B, C, R, F); null with none. */
    preflopLine: string | null;
    /** The first raise, to. */
    openSize: number | null;
    /** The second raise, to, as a multiple of the first. */
    threeBetSize: number | null;
    /** The third raise, to, as a multiple of the second. */
    fourBetSize: number | null;
    /** The Hero's first raise, to. */
    heroRaiseSize: number | null;
    /** The Hero's first raise, to, as a multiple of the bet it faced. */
    heroRaiseMultiple: number | null;
    heroSecondRaiseSize: number | null;
    heroSecondRaiseMultiple: number | null;
    /** The last raise before the Hero's first Action, to; null with none. */
    sizeFaced: number | null;
    heroStartingStack: number;
    /** At the deal: the Hero's Stack or the deepest opponent's, the smaller. */
    preflopEffectiveStack: number;
    straddle: boolean;
    antes: boolean;
  };

/** One of the Hero's preflop Actions, with what came before it. */
interface HeroDecision extends PreflopDecision {
  /** Limps (calls with no raise in) before it, by anyone. */
  limpers: number;
  /** The table just after it. */
  after: TableState;
}

/** The Hero's preflop facts in one Hand. */
export function preflopFacts(hand: Hand): PreflopFacts {
  const name = hand.hero.screenName;
  const bigBlind = hand.stake.bigBlind;
  const positionOf = positions(hand);
  const { states } = timeline(hand);
  const all = preflopDecisions(hand, states);
  // The table after each preflop Action, in the same order.
  const afterStates = states.filter(
    (state) => state.action?.street === 'preflop',
  );
  const limpsBefore = (index: number) =>
    all.slice(0, index).filter(limping).length;
  const mine: HeroDecision[] = all.flatMap((decision, index) =>
    decision.action.screenName === name
      ? [
          {
            ...decision,
            limpers: limpsBefore(index),
            after: afterStates[index],
          },
        ]
      : [],
  );
  const raises = all.flatMap((decision, index) =>
    raising(decision.action)
      ? [
          {
            ...decision,
            to: betOf(decision.action.screenName, afterStates[index]),
          },
        ]
      : [],
  );

  const canRaise = (decision: HeroDecision) =>
    decision.reopened && couldRaise(name, decision.before);
  // An Action the Hero could re-raise from: did and chance.
  const reRaise = (decision: HeroDecision | undefined) => ({
    did: !!decision && raising(decision.action),
    chance: !!decision && (raising(decision.action) || canRaise(decision)),
  });
  const faced = (decision: HeroDecision | undefined) => ({
    faced: !!decision,
    answer: decision ? answerOf(decision.action) : null,
  });

  const [first] = mine;
  const heroPosition = positionOf.get(name);
  const facingOpen = mine.find((decision) => decision.raises === 1);
  const facingThreeBet = mine.find((decision) => decision.raises === 2);
  const facingFourBetPlus = mine.find((decision) => decision.raises >= 3);

  // Folded to the Hero, who could raise: an open.
  const unopened = !!first && first.raises === 0 && first.limpers === 0;
  const openChance = unopened && couldRaise(name, first.before);
  const openDid = openChance && raising(first.action);
  const stealing = STEALING.has(heroPosition);

  // A steal the Hero faced in a blind: a lone open from the cutoff, button
  // or small blind, nobody calling or raising between it and the Hero.
  const stealFaced =
    !!first &&
    (heroPosition === 'SB' || heroPosition === 'BB') &&
    first.raises === 1 &&
    first.limpers === 0 &&
    first.callers === 0 &&
    STEALING.has(positionOf.get(first.raisers[0]));

  // Limped first, and the first raise came after.
  const limped = !!first && limping(first);
  const facingIsolation = limped ? mine[1] : undefined;

  // The 3-bet that made the second raise, if it was a squeeze: an open and
  // one or more calls before it.
  const squeezeMade = all.find(
    (decision) =>
      decision.raises === 1 && decision.callers > 0 && raising(decision.action),
  );
  const inBeforeSqueeze = (decision: HeroDecision) =>
    decision.raisers[0] === name ||
    mine.some((m) => m.raises === 1 && m.action.type === 'call');
  const facingSqueeze =
    squeezeMade && facingThreeBet && inBeforeSqueeze(facingThreeBet)
      ? facingThreeBet
      : undefined;

  // The Hero's steal, re-raised from a blind with nobody calling between.
  const restolen =
    openDid && stealing && facingThreeBet?.raisers[0] === name
      ? facingThreeBet
      : undefined;
  const restealFaced =
    restolen &&
    !squeezeMade &&
    ['SB', 'BB'].includes(positionOf.get(restolen.raisers[1]) ?? '');

  // A blind already has money in at the open's level, so only a 3-bet or
  // more gives them a cold call.
  const blind = hand.posts.some(
    (post) => post.screenName === name && BLINDS.has(post.kind),
  );
  const coldCallChance = !!first && first.raises >= (blind ? 2 : 1);

  const threeBet = reRaise(facingOpen);
  const fourBet = reRaise(facingThreeBet);
  const fiveBet = reRaise(facingFourBetPlus);
  const squeeze = reRaise(
    facingOpen && facingOpen.callers > 0 ? facingOpen : undefined,
  );
  const resteal = reRaise(stealFaced ? first : undefined);
  const isolateChance =
    !!first &&
    first.raises === 0 &&
    first.limpers > 0 &&
    couldRaise(name, first.before);
  const raisedAny = mine.some((decision) => raising(decision.action));
  const heroRaises = mine.filter((decision) => raising(decision.action));

  const multiple = (to: number, of: number) => round(to / of);
  const inBigBlinds = (amount: number) => round(amount / bigBlind);
  const heroRaise = (decision: HeroDecision | undefined) => {
    if (!decision) return { size: null, multiple: null };
    const to = betOf(name, decision.after);
    return {
      size: inBigBlinds(to),
      multiple: multiple(to, Math.max(levelOf(decision.before), bigBlind)),
    };
  };
  const [firstRaise, secondRaise] = [
    heroRaise(heroRaises[0]),
    heroRaise(heroRaises[1]),
  ];

  const dealt = hand.seats.filter((seat) => !seat.sittingOut);
  const heroStack = dealt.find(
    (seat) => seat.screenName === name,
  )!.startingStack;
  const deepest = Math.max(
    0,
    ...dealt
      .filter((seat) => seat.screenName !== name)
      .map((seat) => seat.startingStack),
  );

  return {
    vpipDid: mine.some((decision) =>
      ['call', 'bet', 'raise'].includes(decision.action.type),
    ),
    vpipChance: mine.length > 0,
    pfrDid: raisedAny,
    pfrChance: raisedAny || (!!first && couldRaise(name, first.before)),
    openDid,
    openChance,
    limpDid: limped,
    limpChance:
      !!first &&
      first.raises === 0 &&
      levelOf(first.before) > betOf(name, first.before),
    isolateDid: isolateChance && raising(first.action),
    isolateChance,
    ...prefixed('isolate', faced(facingIsolation)),
    stealDid: openDid && stealing,
    stealChance: openChance && stealing,
    ...prefixed('steal', faced(stealFaced ? first : undefined)),
    threeBetDid: threeBet.did,
    threeBetChance: threeBet.chance,
    ...prefixed(
      'threeBet',
      faced(facingThreeBet?.raisers[0] === name ? facingThreeBet : undefined),
    ),
    squeezeDid: squeeze.did,
    squeezeChance: squeeze.chance,
    ...prefixed('squeeze', faced(facingSqueeze)),
    coldCallDid: coldCallChance && first.action.type === 'call',
    coldCallChance,
    fourBetDid: fourBet.did,
    fourBetChance: fourBet.chance,
    ...prefixed(
      'fourBet',
      faced(
        mine.find(
          (decision) => decision.raises >= 3 && decision.raisers[1] === name,
        ),
      ),
    ),
    fiveBetDid: fiveBet.did,
    fiveBetChance: fiveBet.chance,
    ...prefixed(
      'fiveBet',
      faced(
        mine.find(
          (decision) => decision.raises >= 4 && decision.raisers[2] === name,
        ),
      ),
    ),
    restealDid: resteal.did,
    restealChance: resteal.chance,
    ...prefixed('resteal', faced(restealFaced ? restolen : undefined)),
    preflopRole: preflopRole(hand, mine),
    preflopFacedFirst: first ? facedFirst(first) : null,
    limpers: all.filter(limping).length,
    preflopLine: mine.length
      ? mine.map(({ action }) => LETTERS[action.type]).join('')
      : null,
    openSize: raises[0] ? inBigBlinds(raises[0].to) : null,
    threeBetSize: raises[1] ? multiple(raises[1].to, raises[0].to) : null,
    fourBetSize: raises[2] ? multiple(raises[2].to, raises[1].to) : null,
    heroRaiseSize: firstRaise.size,
    heroRaiseMultiple: firstRaise.multiple,
    heroSecondRaiseSize: secondRaise.size,
    heroSecondRaiseMultiple: secondRaise.multiple,
    sizeFaced:
      first && first.raises > 0 ? inBigBlinds(levelOf(first.before)) : null,
    heroStartingStack: inBigBlinds(heroStack),
    preflopEffectiveStack: inBigBlinds(Math.min(heroStack, deepest)),
    straddle: hand.posts.some((post) => post.kind === 'straddle'),
    antes: hand.posts.some((post) => post.kind === 'ante'),
  };
}

function prefixed<P extends (typeof FACED_ACTIONS)[number]>(
  prefix: P,
  { faced, answer }: { faced: boolean; answer: Answer | null },
) {
  return { [`${prefix}Faced`]: faced, [`${prefix}Answer`]: answer } as Record<
    `${P}Faced`,
    boolean
  > &
    Record<`${P}Answer`, Answer | null>;
}

/**
 * By the Hero's last voluntary Action: what level they raised at, or what
 * they called. With none, a walk, a blind who only checked, or a fold.
 */
function preflopRole(hand: Hand, mine: HeroDecision[]): PreflopRole | null {
  const last = mine.findLast(
    ({ action }) => action.type !== 'fold' && action.type !== 'check',
  );
  if (last && raising(last.action)) {
    if (last.raises === 0) return last.limpers > 0 ? 'isolator' : 'opener';
    return (
      (['3-bettor', '4-bettor'] as const)[last.raises - 1] ?? '5-bettor-plus'
    );
  }
  if (last) {
    return (
      (['limper', 'called-open', 'called-3-bet'] as const)[last.raises] ??
      'called-4-bet-plus'
    );
  }
  if (mine.some(({ action }) => action.type === 'fold')) return 'folded';
  if (mine.length > 0) return 'checked';
  // No Action at all: a walk, unless the Hero went all in on a post.
  const preflop = hand.actions.filter((action) => action.street === 'preflop');
  return preflop.some((action) => action.type !== 'fold') ? null : 'walk';
}

function facedFirst(first: HeroDecision): PreflopFacedFirst {
  if (first.raises === 0) return first.limpers > 0 ? 'limps' : 'unopened';
  return (['open', '3-bet'] as const)[first.raises - 1] ?? '4-bet-plus';
}

const LETTERS: Record<Action['type'], string> = {
  check: 'X',
  bet: 'B',
  call: 'C',
  raise: 'R',
  fold: 'F',
};

function raising(action: Action): boolean {
  return action.type === 'raise' || action.type === 'bet';
}

/** A call with no raise in: a limp, a small blind completing included. */
function limping(decision: PreflopDecision): boolean {
  return decision.raises === 0 && decision.action.type === 'call';
}

function answerOf(action: Action): Answer {
  if (raising(action)) return 'raise';
  return action.type === 'fold' ? 'fold' : 'call';
}

function betOf(name: string, state: TableState): number {
  return state.players.find((player) => player.screenName === name)!.bet;
}

function levelOf(state: TableState): number {
  return Math.max(...state.players.map((player) => player.bet));
}

/** Kept to two decimals. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
