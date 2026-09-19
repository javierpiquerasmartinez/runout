import type { Action, Hand, Street } from '../hand.js';
import { bestHand, type MadeHand } from './evaluator.js';
import { positions, type Position } from './positions.js';

/**
 * A Hand as Playback steps through it, one table state per step: the Initial
 * State, then each Action, each Street as it is dealt, and the end of the
 * Hand. The web only indexes into it.
 */
export interface Timeline {
  /** The players dealt in, in seat order. */
  seats: TimelineSeat[];
  buttonSeat: number;
  hero: { screenName: string; cards: string[] };
  /**
   * `states[0]` is the Initial State. An Action that closes a Street is shown
   * with the bets still in front of the players; the next state deals the
   * next Street, bets gathered into the pot. The last state is the end of
   * the Hand: its result, and Showdown if there was one.
   */
  states: TableState[];
  /** Whether the Hand reached Showdown after its last Action. */
  showdown: boolean;
}

export interface TimelineSeat {
  seat: number;
  screenName: string;
  position: Position;
  startingStack: number;
}

export interface TableState {
  street: Street;
  /** The community cards dealt so far. */
  board: string[];
  /** Everything in the middle, bets on this Street included, as an Amount. */
  pot: number;
  /**
   * What has been gathered into the middle, bets still in play on this
   * Street left out: the main pot first, then each side pot.
   */
  pots: Pot[];
  /** Who acts next on this Street, or null when nobody does. */
  toAct: string | null;
  /** In seat order, like `seats`. */
  players: PlayerState[];
  /** The Action that led here; null at the Initial State, a deal and the end. */
  action: Action | null;
  /**
   * The smaller Stack of the two deepest players still in the Hand as this
   * Street began, or null once fewer than two are left.
   */
  effectiveStack: number | null;
  /** The effective stack over the pot as this Street began; null preflop. */
  spr: number | null;
  /** How the Hand ended, on its last state only. */
  result: HandResult | null;
}

export interface Pot {
  amount: number;
  /** Who can win it, in seat order. */
  contestants: string[];
}

export interface PlayerState {
  screenName: string;
  stack: number;
  /** What the player has put in on this Street. */
  bet: number;
  folded: boolean;
  /** Everything they have in the pot, bet included; nothing left behind. */
  allIn: boolean;
  /** Everything the player has put in the pot so far, net of bets returned. */
  committed: number;
}

export interface HandResult {
  /**
   * The hands shown at Showdown, in seat order. Nobody's if the Hand was won
   * without one; a hand mucked there, the Hero's included, isn't one.
   */
  revealed: { screenName: string; cards: string[]; madeHand: MadeHand }[];
  /**
   * Each pot, as in `pots`, with what each winner took from it after rake.
   * When the Hand History's pots don't match these, a single pot holds
   * everything and every winner, rather than a guess at who won which.
   */
  pots: PaidPot[];
  /** What the room kept. */
  rake: number;
}

export interface PaidPot extends Pot {
  winners: { screenName: string; amount: number }[];
}

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

const BOARD_SIZE: Record<Street, number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
};

export function timeline(hand: Hand): Timeline {
  const positionOf = positions(hand);
  const seats = hand.seats
    .filter((seat) => positionOf.has(seat.screenName))
    .map((seat) => ({
      seat: seat.seat,
      screenName: seat.screenName,
      position: positionOf.get(seat.screenName)!,
      startingStack: seat.startingStack,
    }));

  let players: PlayerState[] = seats.map((seat) => ({
    screenName: seat.screenName,
    stack: seat.startingStack,
    bet: 0,
    folded: false,
    allIn: false,
    committed: 0,
  }));
  const update = (name: string, change: (p: PlayerState) => PlayerState) => {
    players = players.map((p) => (p.screenName === name ? change(p) : p));
  };
  const pay = (name: string, amount: number, live: number) =>
    update(name, (p) => ({
      ...p,
      stack: p.stack - amount,
      bet: p.bet + live,
      committed: p.committed + amount,
      allIn: p.stack - amount === 0,
    }));

  for (const post of hand.posts) {
    // Antes and the dead part of a small-and-big post go straight to the pot.
    const live =
      post.kind === 'ante'
        ? 0
        : post.kind === 'small-and-big-blinds'
          ? post.amount - hand.stake.smallBlind
          : post.amount;
    pay(post.screenName, post.amount, live);
  }

  // Effective stack and SPR are read as each Street begins. Preflop there's
  // no SPR, and the effective stack follows the players still in, counting
  // what they have in front of them.
  const preflopEffectiveStack = () =>
    secondDeepest(players.filter((p) => !p.folded).map((p) => p.stack + p.bet));
  let effectiveStack = preflopEffectiveStack();
  let spr: number | null = null;
  let board: string[] = [];
  // Uncalled bets, handed back once nobody acts again.
  let unreturned: Hand['returned'] = [];

  const states: TableState[] = [];
  const push = (
    state: Pick<TableState, 'street' | 'toAct' | 'action' | 'result'>,
  ) =>
    states.push({
      ...state,
      board,
      pot: potOf(players),
      pots: potsOf(players),
      players,
      effectiveStack,
      spr,
    });
  // Bets go into the middle, uncalled ones back to their owners first.
  // Paying back is paying in reverse, and leaves the player with chips.
  const gather = () => {
    for (const { screenName, amount } of unreturned) {
      pay(screenName, -amount, -amount);
    }
    unreturned = [];
    players = players.map((p) => ({ ...p, bet: 0 }));
  };
  const deal = (street: Street, toAct: string | null) => {
    gather();
    board = hand.board.slice(0, BOARD_SIZE[street]);
    effectiveStack = secondDeepest(
      players.filter((p) => !p.folded).map((p) => p.stack),
    );
    spr = effectiveStack === null ? null : effectiveStack / potOf(players);
    push({ street, toAct, action: null, result: null });
  };

  push({
    street: 'preflop',
    toAct: hand.actions[0]?.screenName ?? null,
    action: null,
    result: null,
  });
  hand.actions.forEach((action, index) => {
    const paid =
      action.type === 'call' || action.type === 'bet'
        ? action.amount
        : action.type === 'raise'
          ? action.to -
            (players.find((p) => p.screenName === action.screenName)?.bet ?? 0)
          : 0;
    if (paid > 0) pay(action.screenName, paid, paid);
    if (action.type === 'fold') {
      update(action.screenName, (p) => ({ ...p, folded: true }));
    }
    if (action.street === 'preflop') effectiveStack = preflopEffectiveStack();

    const next = hand.actions[index + 1];
    const closesStreet = next?.street !== action.street;
    push({
      street: action.street,
      toAct: closesStreet ? null : next.screenName,
      action,
      result: null,
    });
    if (next && closesStreet) deal(next.street, next.screenName);
  });

  // Whatever the board still holds (an all-in runout) is dealt Street by
  // Street, then the Hand ends: the pots are paid out.
  unreturned = hand.returned;
  const finalStreet = streetOf(hand.board.length);
  const reached = STREETS.indexOf(hand.actions.at(-1)?.street ?? 'preflop');
  for (const street of STREETS.slice(reached + 1)) {
    if (STREETS.indexOf(street) > STREETS.indexOf(finalStreet)) break;
    deal(street, null);
  }
  gather();
  board = hand.board;
  const result = resultOf(hand, players, board);
  // Winnings come in last, so they don't count as a Stack to play with.
  for (const { screenName, amount } of hand.collected) {
    update(screenName, (p) => ({ ...p, stack: p.stack + amount }));
  }
  push({ street: finalStreet, toAct: null, action: null, result });

  return {
    seats,
    buttonSeat: hand.buttonSeat,
    hero: hand.hero,
    states,
    showdown: hand.showdown,
  };
}

function potOf(players: PlayerState[]): number {
  return players.reduce((sum, p) => sum + p.committed, 0);
}

/**
 * Splits what has been gathered into the middle into the main pot and side
 * pots. Each player all in for less than the rest caps a pot at what they
 * put in; above it, only those who put in more can win.
 */
function potsOf(players: PlayerState[]): Pot[] {
  const gathered = players.map((p) => ({
    screenName: p.screenName,
    amount: p.committed - p.bet,
    live: !p.folded,
  }));
  // Only an all-in whose bets have all been gathered caps a pot yet.
  const caps = [
    ...new Set(
      players
        .filter((p) => p.allIn && !p.folded && p.bet === 0)
        .map((p) => p.committed),
    ),
  ].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let floor = 0;
  for (const cap of [...caps, Infinity]) {
    const amount = gathered.reduce(
      (sum, g) => sum + Math.max(0, Math.min(g.amount, cap) - floor),
      0,
    );
    const contestants = gathered
      .filter(
        (g) =>
          g.live && (cap === Infinity ? g.amount > floor : g.amount >= cap),
      )
      .map((g) => g.screenName);
    if (amount > 0) pots.push({ amount, contestants });
    floor = cap;
  }
  return pots;
}

function resultOf(
  hand: Hand,
  players: PlayerState[],
  board: string[],
): HandResult {
  const worked = potsOf(players);
  // The Hand History numbers side pots from 1, the main pot being 0.
  const matches = hand.collected.every(
    ({ pot }) =>
      (pot === undefined && worked.length === 1) ||
      (pot !== undefined && pot < worked.length),
  );
  const pots: PaidPot[] = matches
    ? worked.map((pot) => ({ ...pot, winners: [] }))
    : [
        {
          amount: worked.reduce((sum, pot) => sum + pot.amount, 0),
          contestants: worked[0]?.contestants ?? [],
          winners: [],
        },
      ];
  for (const { screenName, amount, pot } of hand.collected) {
    const { winners } = pots[matches ? (pot ?? 0) : 0];
    const winner = winners.find((w) => w.screenName === screenName);
    if (winner) winner.amount += amount;
    else winners.push({ screenName, amount });
  }

  const revealed: HandResult['revealed'] = [];
  if (hand.showdown) {
    for (const player of players) {
      if (player.folded) continue;
      const shown = hand.shown.find((s) => s.screenName === player.screenName);
      if (!shown) continue;
      revealed.push({
        screenName: player.screenName,
        cards: shown.cards,
        madeHand: bestHand([...shown.cards, ...board]),
      });
    }
  }
  return { revealed, pots, rake: hand.rake };
}

/** The second-biggest Stack, or null with fewer than two. */
function secondDeepest(stacks: number[]): number | null {
  if (stacks.length < 2) return null;
  return [...stacks].sort((a, b) => b - a)[1];
}

function streetOf(boardSize: number): Street {
  if (boardSize >= 5) return 'river';
  if (boardSize === 4) return 'turn';
  if (boardSize === 3) return 'flop';
  return 'preflop';
}
