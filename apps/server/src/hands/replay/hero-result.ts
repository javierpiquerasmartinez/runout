import type { Hand } from '../hand.js';
import { timeline } from './timeline.js';

export interface HeroResult {
  /**
   * What the Hero collected minus what they put in, as an Amount: net of
   * uncalled bets handed back, after rake, with their share of any Splash.
   */
  result: number;
  /** Whether the Hero was still in the Hand when it reached Showdown. */
  reachedShowdown: boolean;
}

/**
 * The Hero's Result, read off the Hand's timeline: their Stack once the pots
 * are paid out, against the Stack they started with.
 */
export function heroResult(hand: Hand): HeroResult {
  const { seats, states, showdown } = timeline(hand);
  const name = hand.hero.screenName;
  const start = seats.find((seat) => seat.screenName === name)!;
  const end = states.at(-1)!.players.find((p) => p.screenName === name)!;
  return {
    result: end.stack - start.startingStack,
    reachedShowdown: showdown && !end.folded,
  };
}
