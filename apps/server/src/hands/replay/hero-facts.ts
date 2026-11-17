import type { Action, Hand, Street } from '../hand.js';
import { positions, type Position } from './positions.js';
import { timeline } from './timeline.js';

/**
 * The version of the rules `heroFacts` works the facts out by. It goes up
 * whenever a definition changes or a fact is added, and every Hand's facts
 * carry the version they were worked out by, so a job can bring the stale
 * ones up to date (ADR 0012).
 */
export const FACTS_VERSION = 2;

/** Every Position, in preflop acting order. */
export const POSITIONS = [
  'UTG',
  'UTG+1',
  'MP',
  'LJ',
  'HJ',
  'CO',
  'BTN',
  'SB',
  'BB',
] as const satisfies readonly Position[];

/** What kind of pot the Hand was, by its preflop raises. */
export const POT_TYPES = [
  'walk',
  'limped',
  'single-raised',
  '3-bet',
  '4-bet',
  '5-bet-plus',
] as const;

export type PotType = (typeof POT_TYPES)[number];

/** The Streets, in the order they are dealt. */
export const STREETS = [
  'preflop',
  'flop',
  'turn',
  'river',
] as const satisfies readonly Street[];

/** How the Hero answered a bet or raise. */
export const ANSWERS = ['fold', 'call', 'raise'] as const;

export type Answer = (typeof ANSWERS)[number];

/** Ranks from the highest down, as the Lab writes them. */
const RANKS = 'AKQJT98765432';

/**
 * The 169 Hand Classes: pairs (`77`), and the higher rank first with `s`
 * for suited and `o` for offsuit (`AKs`, `T9o`).
 */
export const HAND_CLASSES: readonly string[] = RANKS.split('').flatMap(
  (high, h) =>
    RANKS.split('')
      .slice(h)
      .flatMap((low, offset) =>
        offset === 0 ? [`${high}${low}`] : [`${high}${low}s`, `${high}${low}o`],
      ),
);

/**
 * What a Hand tells about its Hero, worked out once when it is stored, so
 * that Filters and Stats read it (ADR 0012). Each fact is defined in the
 * facts catalogue; a fact that doesn't apply is null.
 */
export interface HeroFacts {
  /** Seats dealt in: every seat not sitting out. */
  playersDealt: number;
  /** Null when the table's size has no Position names. */
  heroPosition: Position | null;
  /** The Hero's two cards as the Lab writes a Combo (`AhKd`, `7s7c`); null when not dealt. */
  heroCombo: string | null;
  /** One of `HAND_CLASSES`; null when not dealt. */
  heroHandClass: string | null;
  potType: PotType;
  /** Who made the first preflop raise. */
  openerPosition: Position | null;
  /** Who made the second preflop raise. */
  threeBettorPosition: Position | null;
  /** Who made the third preflop raise. */
  fourBettorPosition: Position | null;
  /** Who made the last preflop raise. */
  aggressorPosition: Position | null;
  /** The Hero made the last preflop raise. */
  heroAggressor: boolean;

  // Showdown and Result. Reached Showdown, the Result and All-in EV are the
  // Hand's own columns, worked out with its Result (see `heroResult`).
  /** The Street the Hero folded on. */
  heroFoldedOn: Street | null;
  /** The Street the Hero went all in on, a blind that left them none included. */
  heroAllInOn: Street | null;
  /** The Street of the first opponent's all-in bet or raise the Hero had to answer. */
  heroFacedAllInOn: Street | null;
  /** How the Hero answered that all-in. */
  heroFacedAllInAnswer: Answer | null;
  /** The Hero collected from some pot: a split pot or a side pot alone counts. */
  heroWonMoney: boolean;
  /** The Hero reached Showdown and won money. */
  heroWonAtShowdown: boolean;
}

/**
 * The Hero's facts in one Hand. This is the only place a fact is defined;
 * everything else stores, filters on or counts what it returns.
 */
export function heroFacts(hand: Hand): HeroFacts {
  const hero = hand.hero.screenName;
  const positionOf = positions(hand);
  const position = (name: string | undefined) =>
    (name === undefined ? undefined : positionOf.get(name)) ?? null;
  const preflop = hand.actions.filter((action) => action.street === 'preflop');
  // Every raise counts, an open-shove and a short all-in one included. A
  // blind or a straddle is a post, so the first raise over one is the open.
  const raisers = preflop.filter(raising).map((action) => action.screenName);
  const combo = heroCombo(hand.hero.cards);
  return {
    playersDealt: hand.seats.filter((seat) => !seat.sittingOut).length,
    heroPosition: position(hero),
    heroCombo: combo,
    heroHandClass: combo && handClass(combo),
    potType: potType(raisers.length, preflop),
    openerPosition: position(raisers[0]),
    threeBettorPosition: position(raisers[1]),
    fourBettorPosition: position(raisers[2]),
    aggressorPosition: position(raisers.at(-1)),
    heroAggressor: raisers.at(-1) === hero,
    ...showdownAndResult(hand),
  };
}

/** The facts of how the Hand ended for the Hero. */
function showdownAndResult(
  hand: Hand,
): Pick<
  HeroFacts,
  | 'heroFoldedOn'
  | 'heroAllInOn'
  | 'heroFacedAllInOn'
  | 'heroFacedAllInAnswer'
  | 'heroWonMoney'
  | 'heroWonAtShowdown'
> {
  const hero = hand.hero.screenName;
  const fold = hand.actions.find(
    (action) => action.screenName === hero && action.type === 'fold',
  );
  // The first table state where the Hero has nothing behind: a blind or
  // ante can leave them all in before they act.
  const allIn = timeline(hand).states.find(
    (state) => state.players.find((p) => p.screenName === hero)?.allIn,
  );
  const faced = facedAllIn(hand);
  const wonMoney = hand.collected.some(
    (winner) => winner.screenName === hero && winner.amount > 0,
  );
  return {
    heroFoldedOn: fold?.street ?? null,
    heroAllInOn: allIn?.street ?? null,
    heroFacedAllInOn: faced?.street ?? null,
    heroFacedAllInAnswer: faced?.answer ?? null,
    heroWonMoney: wonMoney,
    heroWonAtShowdown: hand.showdown && !fold && wonMoney,
  };
}

/**
 * The first all-in bet or raise of an opponent the Hero had to answer: the
 * Hero acts after it on the same Street, so they were neither folded nor all
 * in yet. Their answer is that next Action.
 */
function facedAllIn(hand: Hand): { street: Street; answer: Answer } | null {
  const hero = hand.hero.screenName;
  for (const [index, action] of hand.actions.entries()) {
    if (action.screenName === hero || !action.allIn || !raising(action)) {
      continue;
    }
    const answer = hand.actions
      .slice(index + 1)
      .find(
        (next) => next.street === action.street && next.screenName === hero,
      );
    if (!answer) continue;
    if (
      answer.type === 'fold' ||
      answer.type === 'call' ||
      answer.type === 'raise'
    ) {
      return { street: action.street, answer: answer.type };
    }
  }
  return null;
}

function raising(action: Action): boolean {
  return action.type === 'raise' || action.type === 'bet';
}

/**
 * Walk: nobody called or raised, so everyone folded to the big blind (or
 * the straddle). Limped: no raise, but someone called.
 */
function potType(raises: number, preflop: Action[]): PotType {
  if (raises === 0) {
    return preflop.some((action) => action.type === 'call') ? 'limped' : 'walk';
  }
  return (
    (['single-raised', '3-bet', '4-bet'] as const)[raises - 1] ?? '5-bet-plus'
  );
}

/** Cards as a Hand writes them (`10h`, `As`) as the Lab writes a Combo. */
function heroCombo(cards: string[]): string | null {
  if (cards.length !== 2) return null;
  const [a, b] = cards.map((card) => ({
    rank: card.slice(0, -1).replace('10', 'T'),
    suit: card.slice(-1),
  }));
  const order = (card: typeof a) =>
    RANKS.indexOf(card.rank) * 4 + 'shdc'.indexOf(card.suit);
  const [high, low] = order(a) <= order(b) ? [a, b] : [b, a];
  return `${high.rank}${high.suit}${low.rank}${low.suit}`;
}

/** `AhKd` → `AKo`, `7s7c` → `77`. */
function handClass(combo: string): string {
  const [high, highSuit, low, lowSuit] = combo;
  if (high === low) return `${high}${low}`;
  return `${high}${low}${highSuit === lowSuit ? 's' : 'o'}`;
}
