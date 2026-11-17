import type { Action, Hand } from '../hand.js';
import {
  boardTexture,
  cardChange,
  type BoardPairing,
  type BoardRank,
  type BoardSuits,
} from './board-texture.js';
import { positions, type Position } from './positions.js';
import { preflopFacts, type PreflopFacts } from './preflop-facts.js';

/**
 * The version of the rules `heroFacts` works the facts out by. It goes up
 * whenever a definition changes or a fact is added, and every Hand's facts
 * carry the version they were worked out by, so a job can bring the stale
 * ones up to date (ADR 0012).
 */
export const FACTS_VERSION = 3;

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
export interface HeroFacts extends PreflopFacts, BoardTextureFacts {
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
    ...preflopFacts(hand),
    ...boardTextureFacts(hand.board),
  };
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

/**
 * The Board's texture on each Street (facts catalogue §3.5). It describes
 * the Board, so it is there whether or not the Hero saw the Street, and
 * empty only when the Street wasn't dealt.
 */
export interface BoardTextureFacts {
  flopSuits: BoardSuits | null;
  flopPairing: BoardPairing | null;
  flopStraightPossible: boolean | null;
  flopConnectedness: number | null;
  flopHighCard: BoardRank | null;
  turnSuits: BoardSuits | null;
  turnPairing: BoardPairing | null;
  turnStraightPossible: boolean | null;
  turnConnectedness: number | null;
  turnHighCard: BoardRank | null;
  turnPairsBoard: boolean | null;
  turnBringsFlush: boolean | null;
  turnBringsStraight: boolean | null;
  turnOvercard: boolean | null;
  riverSuits: BoardSuits | null;
  riverPairing: BoardPairing | null;
  riverStraightPossible: boolean | null;
  riverConnectedness: number | null;
  riverHighCard: BoardRank | null;
  riverPairsBoard: boolean | null;
  riverBringsFlush: boolean | null;
  riverBringsStraight: boolean | null;
  riverOvercard: boolean | null;
}

function boardTextureFacts(board: string[]): BoardTextureFacts {
  const texture = (cards: number) =>
    board.length >= cards ? boardTexture(board.slice(0, cards)) : null;
  const change = (cards: number) =>
    board.length >= cards
      ? cardChange(board.slice(0, cards - 1), board[cards - 1])
      : null;
  const [flop, turn, river] = [texture(3), texture(4), texture(5)];
  const [turnCard, riverCard] = [change(4), change(5)];
  return {
    flopSuits: flop?.suits ?? null,
    flopPairing: flop?.pairing ?? null,
    flopStraightPossible: flop?.straightPossible ?? null,
    flopConnectedness: flop?.connectedness ?? null,
    flopHighCard: flop?.highCard ?? null,
    turnSuits: turn?.suits ?? null,
    turnPairing: turn?.pairing ?? null,
    turnStraightPossible: turn?.straightPossible ?? null,
    turnConnectedness: turn?.connectedness ?? null,
    turnHighCard: turn?.highCard ?? null,
    turnPairsBoard: turnCard?.pairsBoard ?? null,
    turnBringsFlush: turnCard?.bringsFlush ?? null,
    turnBringsStraight: turnCard?.bringsStraight ?? null,
    turnOvercard: turnCard?.overcard ?? null,
    riverSuits: river?.suits ?? null,
    riverPairing: river?.pairing ?? null,
    riverStraightPossible: river?.straightPossible ?? null,
    riverConnectedness: river?.connectedness ?? null,
    riverHighCard: river?.highCard ?? null,
    riverPairsBoard: riverCard?.pairsBoard ?? null,
    riverBringsFlush: riverCard?.bringsFlush ?? null,
    riverBringsStraight: riverCard?.bringsStraight ?? null,
    riverOvercard: riverCard?.overcard ?? null,
  };
}
