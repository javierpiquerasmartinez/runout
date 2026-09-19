import type { Action, Hand, Street } from '../hand.js';
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
  /** Who acts next, or null once the Hand is over. */
  toAct: string | null;
  /** In seat order, like `seats`. */
  players: PlayerState[];
  /** The Action that led here; null at the Initial State. */
  action: Action | null;
}

export interface PlayerState {
  screenName: string;
  stack: number;
  /** What the player has put in on this Street. */
  bet: number;
  folded: boolean;
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
  }));
  const update = (name: string, change: (p: PlayerState) => PlayerState) => {
    players = players.map((p) => (p.screenName === name ? change(p) : p));
  };
  let pot = 0;
  for (const post of hand.posts) {
    // Antes and the dead part of a small-and-big post go straight to the pot.
    const live =
      post.kind === 'ante'
        ? 0
        : post.kind === 'small-and-big-blinds'
          ? post.amount - hand.stake.smallBlind
          : post.amount;
    pot += post.amount;
    update(post.screenName, (p) => ({
      ...p,
      stack: p.stack - post.amount,
      bet: p.bet + live,
    }));
  }

  const states: TableState[] = [
    {
      street: 'preflop',
      board: [],
      pot,
      toAct: hand.actions[0]?.screenName ?? null,
      players,
      action: null,
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
    pot += paid;
    update(action.screenName, (p) => ({
      ...p,
      stack: p.stack - paid,
      bet: p.bet + paid,
      folded: p.folded || action.type === 'fold',
    }));

    const next = hand.actions[index + 1];
    // Once a Street closes, the next one is dealt; after the last Action,
    // whatever the board still holds (an all-in runout) is dealt at once.
    const board = next
      ? hand.board.slice(0, BOARD_SIZE[next.street])
      : hand.board;
    const street = next ? next.street : streetOf(board.length);
    if (street !== action.street) {
      players = players.map((p) => ({ ...p, bet: 0 }));
    }
    states.push({
      street,
      board,
      pot,
      toAct: next?.screenName ?? null,
      players,
      action,
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

function streetOf(boardSize: number): Street {
  if (boardSize >= 5) return 'river';
  if (boardSize === 4) return 'turn';
  if (boardSize === 3) return 'flop';
  return 'preflop';
}
