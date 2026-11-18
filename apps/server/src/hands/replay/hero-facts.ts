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
import {
  boardTexture,
  cardChange,
  type BoardPairing,
  type BoardRank,
  type BoardSuits,
} from './board-texture.js';
import { positions, type Position } from './positions.js';
import {
  POSTFLOP_STREETS,
  streetStarts,
  type ActionWithTable,
  type PostflopStreet,
  type StreetStart,
} from './street-start.js';
import {
  preflopFacts,
  type Answer,
  type PreflopFacts,
} from './preflop-facts.js';
import { streetActions, type StreetActionFacts } from './street-actions.js';
import { timeline } from './timeline.js';

/**
 * The version of the rules `heroFacts` works the facts out by. It goes up
 * whenever a definition changes or a fact is added, and every Hand's facts
 * carry the version they were worked out by, so a job can bring the stale
 * ones up to date (ADR 0012).
 */
export const FACTS_VERSION = 8;

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
export interface HeroFacts
  extends PreflopFacts, BoardTextureFacts, PostflopFacts {
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
    ...preflopFacts(hand),
    ...boardTextureFacts(hand.board),
    ...streetCards(hand),
    ...postflopFacts(hand),
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

/**
 * The Made Hands that use exactly one of the Hero's cards. Two pair with one
 * card on a paired Board (A5 on A77) is among them: the Lab calls it top pair,
 * as its two pair always pairs both cards.
 */
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

// ---------------------------------------------------------------------------
// Each postflop Street (facts catalogue §3.1, §3.3 and §5)
// ---------------------------------------------------------------------------

/**
 * The Hero's facts on one postflop Street. Every one but `saw` is null when
 * the Street wasn't dealt or the Hero was no longer in. Stored once per
 * Street, prefixed with its name: `flopIp`, `turnLine`, `riverSpr`.
 */
export interface StreetFacts {
  /** Dealt, and the Hero hadn't folded, all in included. */
  saw: boolean;
  /** Players who hadn't folded as it began: 2 is heads-up, 3 or more multiway. */
  players: number | null;
  /** The Hero acts last on it among the players still in as it began. */
  ip: boolean | null;
  /** The Hero acts first on it among the players still in as it began. */
  first: boolean | null;
  /** In big blinds as it began, to two decimals. */
  pot: number | null;
  /** In big blinds as it began, to two decimals; see `StreetStart`. */
  effectiveStack: number | null;
  /** The effective stack over the pot as it began, to one decimal. */
  spr: number | null;
  /** The Hero had no chips left as it began. */
  allIn: boolean | null;
  /**
   * The Hero's Actions on it, a letter each: X check, B bet, C call,
   * R raise, F fold (`XR`, `BC`). Null when they made none, all in say.
   */
  line: string | null;
  /** The Hero's bet, % of the pot before it, whole. */
  betSize: number | null;
  /** The total of the Hero's first raise, as a multiple of the bet it raised, to two decimals. */
  raiseSize: number | null;
  /** The first bet the Hero faced, % of the pot before it, whole. */
  betSizeFaced: number | null;
  /** The first raise the Hero faced, as a multiple of the bet it raised. */
  raiseSizeFaced: number | null;
  /** How many bets, raises, calls and folds the Hero made on it, for AFq. */
  bets: number | null;
  raises: number | null;
  calls: number | null;
  folds: number | null;
}

/** `StreetFacts` under one Street's name: `ip` → `flopIp`. */
export type OnStreet<S extends PostflopStreet, T = StreetFacts> = {
  [K in keyof T & string as `${S}${Capitalize<K>}`]: T[K];
};

export type PostflopFacts = OnStreet<'flop'> &
  OnStreet<'turn'> &
  OnStreet<'river'> &
  OnStreet<'flop', StreetActionFacts<'flop'>> &
  OnStreet<'turn', StreetActionFacts<'turn'>> &
  OnStreet<'river', StreetActionFacts<'river'>>;

/** Prefixes each key of `facts` with the Street's name. */
export function onStreet<S extends PostflopStreet, T extends object>(
  street: S,
  facts: T,
): OnStreet<S, T> {
  return Object.fromEntries(
    Object.entries(facts).map(([key, value]) => [
      `${street}${key[0].toUpperCase()}${key.slice(1)}`,
      value,
    ]),
  ) as OnStreet<S, T>;
}

function postflopFacts(hand: Hand): PostflopFacts {
  const starts = streetStarts(hand);
  const actions = streetActions(hand, starts);
  const facts = POSTFLOP_STREETS.map((street) =>
    onStreet(street, {
      ...streetFacts(hand, starts[street]),
      ...actions[street],
    }),
  );
  return Object.assign({}, ...facts) as PostflopFacts;
}

const LETTERS: Record<Action['type'], string> = {
  check: 'X',
  bet: 'B',
  call: 'C',
  raise: 'R',
  fold: 'F',
};

function streetFacts(
  hand: Hand,
  start: StreetStart | null,
): StreetFacts {
  if (!start) {
    return {
      saw: false,
      players: null,
      ip: null,
      first: null,
      pot: null,
      effectiveStack: null,
      spr: null,
      allIn: null,
      line: null,
      betSize: null,
      raiseSize: null,
      betSizeFaced: null,
      raiseSizeFaced: null,
      bets: null,
      raises: null,
      calls: null,
      folds: null,
    };
  }
  const hero = hand.hero.screenName;
  const bb = (amount: number) => round(amount / hand.stake.bigBlind, 2);
  const { dealt, actions } = start;
  const own = actions.filter((played) => played.action.screenName === hero);
  const count = (type: Action['type']) =>
    own.filter((played) => played.action.type === type).length;
  // Faced: an opponent's, with the Hero still to answer it on the Street.
  const faced = (type: Action['type']) =>
    actions.find(
      (played, index) =>
        played.action.type === type &&
        played.action.screenName !== hero &&
        actions.slice(index + 1).some((a) => a.action.screenName === hero),
    );
  return {
    saw: true,
    players: start.inHand.length,
    ip: start.heroIp,
    first: start.heroFirst,
    pot: bb(dealt.pot),
    effectiveStack: bb(start.effectiveStack),
    spr: round(start.effectiveStack / dealt.pot, 1),
    allIn: start.heroAllIn,
    line: own.map((played) => LETTERS[played.action.type]).join('') || null,
    betSize: betSize(own.find((played) => played.action.type === 'bet')),
    raiseSize: raiseSize(own.find((played) => played.action.type === 'raise')),
    betSizeFaced: betSize(faced('bet')),
    raiseSizeFaced: raiseSize(faced('raise')),
    bets: count('bet'),
    raises: count('raise'),
    calls: count('call'),
    folds: count('fold'),
  };
}

/** A bet as a whole % of the pot before it. */
function betSize(played: ActionWithTable | undefined): number | null {
  if (played?.action.type !== 'bet') return null;
  return round((played.action.amount / played.before.pot) * 100, 0);
}

/** A raise's total as a multiple of the bet or raise it raised. */
function raiseSize(played: ActionWithTable | undefined): number | null {
  if (played?.action.type !== 'raise') return null;
  const raised = Math.max(...played.before.players.map((p) => p.bet));
  return round(played.action.to / raised, 2);
}

function round(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
