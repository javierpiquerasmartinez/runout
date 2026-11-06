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
  const clockwiseFrom = (first: number) => [
    ...dealt.filter((seat) => seat.seat >= first),
    ...dealt.filter((seat) => seat.seat < first),
  ];

  let inActingOrder;
  const bigBlindSeat = findBigBlind(hand, dealt);
  if (dealt.some((seat) => seat.seat === hand.buttonSeat) || !bigBlindSeat) {
    // Clockwise from the button: BTN, SB, BB, then the earliest Position.
    const fromButton = clockwiseFrom(hand.buttonSeat);
    const button = names.indexOf('BTN');
    inActingOrder = [
      ...fromButton.slice(names.length - button),
      ...fromButton.slice(0, names.length - button),
    ];
  } else {
    // A dead button (its seat empty or sitting out): the big blind acts last
    // preflop, so the Positions run clockwise from the seat after it.
    inActingOrder = clockwiseFrom(bigBlindSeat.seat + 1);
  }
  return new Map(
    inActingOrder.map((seat, index) => [seat.screenName, names[index]]),
  );
}

/**
 * The big blind's seat. A player posting to come in also posts a big blind,
 * and Hand Histories don't always list the real one first: the big blind is
 * the first big-blind poster clockwise after the small blind, or the first
 * listed when there is no small blind.
 */
function findBigBlind(hand: Hand, dealt: Hand['seats']) {
  const seatOf = (name: string | undefined) =>
    dealt.find((seat) => seat.screenName === name);
  const posters = hand.posts
    .filter((post) => post.kind === 'big-blind')
    .flatMap((post) => seatOf(post.screenName) ?? []);
  const smallBlind = seatOf(
    hand.posts.find((post) => post.kind === 'small-blind')?.screenName,
  );
  if (!smallBlind || posters.length < 2) return posters[0];
  // Seats clockwise from the small blind: those after it, then those before.
  const after = (seat: number) =>
    seat > smallBlind.seat ? seat - smallBlind.seat : seat + 100;
  return posters.reduce((first, seat) =>
    after(seat.seat) < after(first.seat) ? seat : first,
  );
}
