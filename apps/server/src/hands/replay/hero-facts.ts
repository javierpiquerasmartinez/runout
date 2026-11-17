import {
  cardCode,
  classifyCombo,
  COMBINATION_DRAWS,
  DRAWS,
  strength,
  type CombinationDrawCategory,
  type DrawCategory,
  type MadeHandCategory,
} from '@runout/poker';
import type { Action, Hand, Street } from '../hand.js';
import { positions, type Position } from './positions.js';

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
  // The Hero's cards on each Street (facts catalogue §3.4): null when the
  // Street wasn't dealt, the Hero had folded before it, or their cards are
  // unknown.
  flopMadeHand: MadeHandCategory | null;
  flopDraws: StreetDraw[] | null;
  flopNuts: boolean | null;
  flopKicker: Kicker | null;
  flopNutFlushDraw: boolean | null;
  turnMadeHand: MadeHandCategory | null;
  turnDraws: StreetDraw[] | null;
  turnNuts: boolean | null;
  turnKicker: Kicker | null;
  turnNutFlushDraw: boolean | null;
  riverMadeHand: MadeHandCategory | null;
  riverNuts: boolean | null;
  riverKicker: Kicker | null;
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
    ...streetCards(hand),
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

// The Hero's cards on each Street (facts catalogue §3.4).

/**
 * What a Street's Draws fact holds: every Draw and every combination Draw
 * the Hero's Combo is in, the one-card backdoor included.
 */
export const STREET_DRAWS = [...DRAWS, ...COMBINATION_DRAWS] as const;

export type StreetDraw = DrawCategory | CombinationDrawCategory;

/**
 * How good the Hero's other card is, when the Made Hand uses only one of
 * them: the highest rank not on the Board, the next one, or any other.
 */
export const KICKERS = ['top', 'second', 'weak'] as const;

export type Kicker = (typeof KICKERS)[number];

/** How many Board cards each postflop Street has dealt. */
const BOARD_SIZE = { flop: 3, turn: 4, river: 5 } as const;

/** The Made Hands that use exactly one of the Hero's cards. */
const ONE_CARD_HANDS: readonly MadeHandCategory[] = [
  'top-pair',
  'middle-pair',
  'bottom-pair',
  'trips',
];

type StreetCards = Pick<
  HeroFacts,
  | 'flopMadeHand'
  | 'flopDraws'
  | 'flopNuts'
  | 'flopKicker'
  | 'flopNutFlushDraw'
  | 'turnMadeHand'
  | 'turnDraws'
  | 'turnNuts'
  | 'turnKicker'
  | 'turnNutFlushDraw'
  | 'riverMadeHand'
  | 'riverNuts'
  | 'riverKicker'
>;

function streetCards(hand: Hand): StreetCards {
  const flop = cardsOn(hand, 'flop');
  const turn = cardsOn(hand, 'turn');
  const river = cardsOn(hand, 'river');
  return {
    flopMadeHand: flop?.madeHand ?? null,
    flopDraws: flop?.draws ?? null,
    flopNuts: flop?.nuts ?? null,
    flopKicker: flop ? flop.kicker : null,
    flopNutFlushDraw: flop?.nutFlushDraw ?? null,
    turnMadeHand: turn?.madeHand ?? null,
    turnDraws: turn?.draws ?? null,
    turnNuts: turn?.nuts ?? null,
    turnKicker: turn ? turn.kicker : null,
    turnNutFlushDraw: turn?.nutFlushDraw ?? null,
    riverMadeHand: river?.madeHand ?? null,
    riverNuts: river?.nuts ?? null,
    riverKicker: river ? river.kicker : null,
  };
}

/**
 * The Hero's cards on the Board as it stands after `street` is dealt; null
 * when it wasn't, or the Hero had folded before it.
 */
function cardsOn(hand: Hand, street: keyof typeof BOARD_SIZE) {
  const hole = hand.hero.cards;
  const size = BOARD_SIZE[street];
  if (hole.length !== 2 || hand.board.length < size) return null;
  if (foldedBefore(hand, street)) return null;
  const board = hand.board.slice(0, size);
  const { madeHand, draws, combinationDraws } = classifyCombo(hole, board, {
    oneCardBackdoors: true,
  });
  return {
    madeHand,
    draws: [...draws, ...combinationDraws] as StreetDraw[],
    nuts: isNuts(hole, board),
    kicker: ONE_CARD_HANDS.includes(madeHand) ? kicker(hole, board) : null,
    nutFlushDraw: draws.includes('flush-draw') && nutFlushDraw(hole, board),
  };
}

const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river'];

function foldedBefore(hand: Hand, street: Street): boolean {
  return hand.actions.some(
    (action) =>
      action.type === 'fold' &&
      action.screenName === hand.hero.screenName &&
      STREETS.indexOf(action.street) < STREETS.indexOf(street),
  );
}

/** Every card, as the evaluator numbers them. */
const DECK_CODES = Array.from({ length: 52 }, (_, code) => code);

/** No two cards left in the deck beat the Hero's hand; a tie is still the nuts. */
function isNuts(hole: string[], board: string[]): boolean {
  const boardCodes = board.map(cardCode);
  const hero = strength([...hole.map(cardCode), ...boardCodes]);
  const used = new Set([...hole.map(cardCode), ...boardCodes]);
  const left = DECK_CODES.filter((code) => !used.has(code));
  // One array for every pair tried: the Board after two slots for the pair.
  const cards = [0, 0, ...boardCodes];
  for (let i = 0; i < left.length; i++) {
    cards[0] = left[i];
    for (let j = i + 1; j < left.length; j++) {
      cards[1] = left[j];
      if (strength(cards) > hero) return false;
    }
  }
  return true;
}

/** How high a card's rank is: the ace 0, the deuce 12. */
function rankIndex(card: string): number {
  return RANKS.indexOf(card.slice(0, -1).replace('10', 'T'));
}

/**
 * The Hero's card that isn't on the Board, rated against the ranks that
 * aren't on it either.
 */
function kicker(hole: string[], board: string[]): Kicker {
  const onBoard = new Set(board.map(rankIndex));
  const other = hole.map(rankIndex).find((rank) => !onBoard.has(rank))!;
  const above = [...RANKS].filter(
    (_, rank) => rank < other && !onBoard.has(rank),
  ).length;
  return KICKERS[Math.min(above, 2)];
}

/**
 * The Hero's highest card of the flush draw's suit is the highest of that
 * suit not on the Board. Called only with a flush draw: four of a suit.
 */
function nutFlushDraw(hole: string[], board: string[]): boolean {
  const suitOf = (card: string) => card.slice(-1);
  const all = [...hole, ...board];
  const suit = hole
    .map(suitOf)
    .find((s) => all.filter((card) => suitOf(card) === s).length === 4);
  if (suit === undefined) return false;
  const onBoard = new Set(
    board.filter((card) => suitOf(card) === suit).map(rankIndex),
  );
  const highestOut = [...RANKS].findIndex((_, rank) => !onBoard.has(rank));
  return hole.some(
    (card) => suitOf(card) === suit && rankIndex(card) === highestOut,
  );
}
