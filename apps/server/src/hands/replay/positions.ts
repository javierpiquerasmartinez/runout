import type { Hand } from '../hand.js';

export type Position =
  'UTG' | 'UTG+1' | 'MP' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

/**
 * Position names by how many players were dealt in, in preflop acting order.
 * Heads-up, the button posts the small blind and is called BTN.
 */
const BY_PLAYERS_DEALT: Record<number, Position[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  8: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

/**
 * Each dealt-in player's Position, in preflop acting order (UTG first, BB
 * last). Players sitting out aren't dealt in and have none.
 */
export function positions(hand: Hand): Map<string, Position> {
  const dealt = hand.seats.filter((seat) => !seat.sittingOut);
  const names = BY_PLAYERS_DEALT[dealt.length];
  if (!names) return new Map();
  // Clockwise from the button: BTN, SB, BB, then the earliest Position.
  const fromButton = [
    ...dealt.filter((seat) => seat.seat >= hand.buttonSeat),
    ...dealt.filter((seat) => seat.seat < hand.buttonSeat),
  ];
  const button = names.indexOf('BTN');
  const inActingOrder = [
    ...fromButton.slice(names.length - button),
    ...fromButton.slice(0, names.length - button),
  ];
  return new Map(
    inActingOrder.map((seat, index) => [seat.screenName, names[index]]),
  );
}
