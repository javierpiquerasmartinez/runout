import type { Hand } from '../hand.js';
import { potShares } from './equity.js';
import { BOARD_SIZE, timeline, type Timeline } from './timeline.js';

export interface HeroResult {
  /**
   * What the Hero collected minus what they put in, as an Amount: net of
   * uncalled bets handed back, after rake, with their share of any Splash.
   */
  result: number;
  /**
   * The Result with luck taken out of all-ins, as an Amount to the
   * hundredth: when the betting was over before the river and every player
   * still in had shown their cards, each pot the Hero was in counts by their equity in
   * it, after its share of the rake, instead of by what they took from it.
   * Otherwise it equals the Result.
   */
  allInEv: number;
  /** Whether the Hero was still in the Hand when it reached Showdown. */
  reachedShowdown: boolean;
  /**
   * The Hero's share of the Hand's Rake, by what they put in the pot over
   * the whole Hand against what every player put in, as an Amount: bets
   * handed back are left out, and so is a Splash, which no player put in.
   */
  rakeGenerated: number;
}

/** The Hero's Result without All-in EV, which alone needs every board to come worked out. */
export type HeroOutcome = Omit<HeroResult, 'allInEv'>;

/**
 * The Hero's Result, read off the Hand's timeline: their Stack once the pots
 * are paid out, against the Stack they started with. Working out All-in EV
 * can take a third of a second for a preflop all-in, which blocks the
 * thread: a server works it out in `HeroResults`' threads.
 */
export function heroResult(hand: Hand): HeroResult {
  const replay = timeline(hand);
  const outcome = outcomeOf(hand, replay);
  return {
    ...outcome,
    allInEv: outcome.result - (allInLuck(hand, replay) ?? 0),
  };
}

/** The Hero's Result, Showdown and Rake Generated: quick, as no all-in is worked out. */
export function heroOutcome(hand: Hand): HeroOutcome {
  return outcomeOf(hand, timeline(hand));
}

function outcomeOf(hand: Hand, replay: Timeline): HeroOutcome {
  const { seats, states, showdown } = replay;
  const name = hand.hero.screenName;
  const start = seats.find((seat) => seat.screenName === name)!;
  const end = states.at(-1)!.players.find((p) => p.screenName === name)!;
  const result = end.stack - start.startingStack;
  const putIn = end.committed;
  const everyonePutIn = states
    .at(-1)!
    .players.reduce((sum, player) => sum + player.committed, 0);
  return {
    result,
    reachedShowdown: showdown && !end.folded,
    rakeGenerated:
      hand.rake === 0 || everyonePutIn === 0
        ? 0
        : Math.round((hand.rake * putIn) / everyonePutIn),
  };
}

/**
 * How much more the Hero took from the pots than their equity in them (less,
 * when negative), when the Hand was decided by an all-in before the river;
 * otherwise null.
 */
function allInLuck(hand: Hand, replay: Timeline): number | null {
  const name = hand.hero.screenName;
  const last = replay.states.at(-1)!;
  const stillIn = last.players.filter((p) => !p.folded);
  // Betting is over once at most one player still in has chips behind.
  const bettingOver = stillIn.filter((p) => !p.allIn).length <= 1;
  const board = hand.board.slice(
    0,
    BOARD_SIZE[hand.actions.at(-1)?.street ?? 'preflop'],
  );
  if (
    !bettingOver ||
    stillIn.length < 2 ||
    board.length === 5 ||
    !stillIn.some((p) => p.screenName === name)
  ) {
    return null;
  }

  const holes = new Map<string, string[]>();
  for (const { screenName } of stillIn) {
    const cards =
      screenName === name
        ? hand.hero.cards
        : hand.shown.find((s) => s.screenName === screenName)?.cards;
    if (cards?.length !== 2) return null;
    holes.set(screenName, cards);
  }

  // Rake and Fees come out of every pot alike.
  const total = last.pots.reduce((sum, pot) => sum + pot.amount, 0);
  const kept = (total - hand.rake - hand.fees) / total;
  const shares = potShares(
    name,
    holes,
    board,
    last.pots.map((pot) => pot.contestants),
  );
  const equity = last.pots.reduce(
    (sum, pot, index) => sum + pot.amount * kept * shares[index],
    0,
  );
  const collected = last
    .result!.pots.flatMap((pot) => pot.winners)
    .filter((winner) => winner.screenName === name)
    .reduce((sum, winner) => sum + winner.amount, 0);
  return collected - Math.round(equity);
}
