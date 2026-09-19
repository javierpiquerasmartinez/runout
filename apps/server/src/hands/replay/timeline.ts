import type { Action, Hand, Street } from '../hand.js';
import { bestHand, type MadeHand } from './evaluator.js';
import { positions, type Position } from './positions.js';

/**
 * A Hand as Playback steps through it: the Initial State, then one table
 * state per Action. The web only indexes into it by Action.
 */
export interface Timeline {
  /** The players dealt in, in seat order. */
  seats: TimelineSeat[];
  buttonSeat: number;
  hero: { screenName: string; cards: string[] };
  /** `states[0]` is the Initial State; `states[n]` is the table after Action n. */
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
  /** Who acts next, or null once the Hand is over. */
  toAct: string | null;
  /** In seat order, like `seats`. */
  players: PlayerState[];
  /** The Action that led here; null at the Initial State. */
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
   * The cards face up at Showdown, in seat order: whoever showed, and the
   * Hero if they got there. Nobody's, if the Hand was won without one.
   */
  revealed: { screenName: string; cards: string[]; madeHand: MadeHand }[];
  /** Each pot, as in `pots`, with who took how much of it. */
  pots: (Pot & { winners: { screenName: string; amount: number }[] })[];
}

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

  // Effective stack and SPR are read as each Street begins; preflop, from
  // the Stacks the players sat down with.
  let effectiveStack = secondDeepest(seats.map((seat) => seat.startingStack));
  let spr: number | null = null;

  const states: TableState[] = [
    {
      street: 'preflop',
      board: [],
      pot: potOf(players),
      pots: potsOf(players),
      toAct: hand.actions[0]?.screenName ?? null,
      players,
      action: null,
      effectiveStack,
      spr,
      result: null,
    },
  ];
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

    const next = hand.actions[index + 1];
    // Once a Street closes, the next one is dealt; after the last Action,
    // whatever the board still holds (an all-in runout) is dealt at once.
    const board = next
      ? hand.board.slice(0, BOARD_SIZE[next.street])
      : hand.board;
    const street = next ? next.street : streetOf(board.length);
    let result: HandResult | null = null;
    if (!next) {
      // The Hand is over: uncalled bets go back, every bet is gathered in
      // and the pots are paid out.
      for (const returned of hand.returned) {
        update(returned.screenName, (p) => ({
          ...p,
          stack: p.stack + returned.amount,
          bet: p.bet - returned.amount,
          committed: p.committed - returned.amount,
          allIn: false,
        }));
      }
      players = players.map((p) => ({ ...p, bet: 0 }));
      result = resultOf(hand, players, board);
    } else if (street !== action.street) {
      players = players.map((p) => ({ ...p, bet: 0 }));
    }
    if (street !== action.street) {
      const live = players.filter((p) => !p.folded);
      effectiveStack = secondDeepest(live.map((p) => p.stack));
      const pot = potOf(players);
      spr = effectiveStack === null ? null : effectiveStack / pot;
    }
    if (result) {
      // Winnings come in last, so they don't count as a Stack to play with.
      for (const { screenName, amount } of hand.collected) {
        update(screenName, (p) => ({ ...p, stack: p.stack + amount }));
      }
    }
    states.push({
      street,
      board,
      pot: potOf(players),
      pots: potsOf(players),
      toAct: next?.screenName ?? null,
      players,
      action,
      effectiveStack,
      spr,
      result,
    });
  });

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
  const pots = potsOf(players).map((pot) => ({
    ...pot,
    winners: [] as { screenName: string; amount: number }[],
  }));
  for (const { screenName, amount, pot } of hand.collected) {
    // The Hand History numbers side pots from 1, the main pot being 0.
    const target = pots[Math.min(pot ?? 0, pots.length - 1)];
    target?.winners.push({ screenName, amount });
  }

  const revealed: HandResult['revealed'] = [];
  if (hand.showdown) {
    for (const player of players) {
      if (player.folded) continue;
      const cards =
        hand.shown.find((s) => s.screenName === player.screenName)?.cards ??
        (player.screenName === hand.hero.screenName ? hand.hero.cards : null);
      if (!cards) continue;
      revealed.push({
        screenName: player.screenName,
        cards,
        madeHand: bestHand([...cards, ...board]),
      });
    }
  }
  return { revealed, pots };
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
