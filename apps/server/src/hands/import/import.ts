import type { Hand } from '../hand.js';
import { Discard, type DiscardReason } from './discard.js';
import { isPokerStarsHand, parsePokerStarsHand } from './pokerstars.js';

export type { DiscardReason };

export interface Discarded {
  /** The text that was discarded, exactly as it came in. */
  text: string;
  reason: DiscardReason;
}

export interface ImportResult {
  hands: Hand[];
  discarded: Discarded[];
}

/**
 * Reads Hand History text holding any number of Hands. A Hand that can't be
 * read is discarded with its reason and never blocks the rest.
 */
export function importHandHistory(text: string): ImportResult {
  const result: ImportResult = { hands: [], discarded: [] };
  // Consecutive pieces that aren't Hands are one discarded entry, not many.
  let unrecognised: { start: number; end: number } | null = null;
  const flushUnrecognised = () => {
    if (!unrecognised) return;
    result.discarded.push({
      text: text.slice(unrecognised.start, unrecognised.end),
      reason: 'unrecognised-format',
    });
    unrecognised = null;
  };
  const extendUnrecognised = (start: number, end: number) => {
    unrecognised = { start: unrecognised?.start ?? start, end };
  };

  for (const { start, end } of blocks(text)) {
    const block = text.slice(start, end);
    if (!isPokerStarsHand(block)) {
      extendUnrecognised(start, end);
      continue;
    }
    flushUnrecognised();
    try {
      result.hands.push(parsePokerStarsHand(block));
    } catch (error) {
      if (!(error instanceof Discard)) throw error;
      result.discarded.push({ text: block, reason: error.reason });
    }
  }
  flushUnrecognised();
  return result;
}

/**
 * Where each run of non-blank lines starts and ends. Hands are separated by
 * blank lines and have none inside, so each run is one Hand, or a piece of
 * text that isn't one.
 */
function blocks(text: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  const runs = /\S(?:[^\n]|\n(?![ \t\r]*\n))*/g;
  for (const run of text.matchAll(runs)) {
    const trimmed = run[0].trimEnd();
    found.push({ start: run.index, end: run.index + trimmed.length });
  }
  return found;
}
