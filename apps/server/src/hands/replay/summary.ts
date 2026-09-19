import type { Hand, Street } from '../hand.js';
import { positions, type Position } from './positions.js';

export interface HandSummary {
  /** Who took part: the Hero first if they did, then in preflop acting order. */
  positions: Position[];
  /** Everything put in the pot, before rake, as an Amount. */
  finalPot: number;
  finalStreet: Street;
  showdown: boolean;
}

const STREET_BY_BOARD_SIZE: Record<number, Street> = {
  0: 'preflop',
  3: 'flop',
  4: 'turn',
  5: 'river',
};

export function summarise(hand: Hand): HandSummary {
  return {
    positions: positionsInvolved(hand),
    finalPot: finalPot(hand),
    finalStreet: STREET_BY_BOARD_SIZE[hand.board.length] ?? 'preflop',
    showdown: hand.showdown,
  };
}

/** A player takes part by making any Action other than folding. */
function positionsInvolved(hand: Hand): Position[] {
  const positionOf = positions(hand);
  const involved = new Set(
    hand.actions
      .filter((action) => action.type !== 'fold')
      .map((action) => action.screenName),
  );
  const inOrder = [...positionOf.keys()].filter((name) => involved.has(name));
  const heroFirst = inOrder.includes(hand.hero.screenName)
    ? [
        hand.hero.screenName,
        ...inOrder.filter((name) => name !== hand.hero.screenName),
      ]
    : inOrder;
  return heroFirst.map((name) => positionOf.get(name)!);
}

function finalPot(hand: Hand): number {
  let pot = 0;
  // What each player has bet on the current Street, so a raise "to" a total
  // only adds the difference.
  let street: Street = 'preflop';
  let bets = new Map<string, number>();
  const bet = (name: string) => bets.get(name) ?? 0;

  for (const post of hand.posts) {
    pot += post.amount;
    const live =
      post.kind === 'ante'
        ? 0
        : post.kind === 'small-and-big-blinds'
          ? post.amount - hand.stake.smallBlind
          : post.amount;
    bets.set(post.screenName, bet(post.screenName) + live);
  }
  for (const action of hand.actions) {
    if (action.street !== street) {
      street = action.street;
      bets = new Map();
    }
    if (action.type === 'call' || action.type === 'bet') {
      pot += action.amount;
      bets.set(action.screenName, bet(action.screenName) + action.amount);
    } else if (action.type === 'raise') {
      pot += action.to - bet(action.screenName);
      bets.set(action.screenName, action.to);
    }
  }
  for (const returned of hand.returned) pot -= returned.amount;
  return pot;
}
