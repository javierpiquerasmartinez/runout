import type { Hand, SourceFormat } from '../hand.js';
import { Discard, type DiscardReason } from './discard.js';
import { isGGPokerHand, parseGGPokerHand } from './ggpoker.js';
import { isPokerStarsHand, parsePokerStarsHand } from './pokerstars.js';
import { isWinamaxHand, parseWinamaxHand } from './winamax.js';

export type { DiscardReason };

interface Format {
  /** Whether a piece of text looks like a Hand in this format. */
  recognises(block: string): boolean;
  /** Reads a Hand it recognised; throws `Discard` when it can't. */
  parse(block: string): Hand;
}

/** Every format detection tries, in the order it tries them. */
const FORMATS: Record<SourceFormat, Format> = {
  pokerstars: { recognises: isPokerStarsHand, parse: parsePokerStarsHand },
  ggpoker: { recognises: isGGPokerHand, parse: parseGGPokerHand },
  winamax: { recognises: isWinamaxHand, parse: parseWinamaxHand },
};

export const SOURCE_FORMATS = Object.keys(FORMATS) as SourceFormat[];

export interface Discarded {
  /** The text that was discarded, exactly as it came in. */
  text: string;
  reason: DiscardReason;
}

export interface ImportResult {
  /**
   * The format the Hands were read in: the one picked by hand, or else the
   * one most Hands were detected in. `null` when nothing was recognised.
   */
  format: SourceFormat | null;
  /** The formats the text was tried against, in order. */
  tried: SourceFormat[];
  hands: Hand[];
  discarded: Discarded[];
}

/**
 * Reads Hand History text holding any number of Hands. Each Hand's format is
 * detected on its own unless `format` picks one by hand. A Hand that can't be
 * read is discarded with its reason and never blocks the rest.
 */
export function importHandHistory(
  text: string,
  options: { format?: SourceFormat } = {},
): ImportResult {
  const tried = options.format ? [options.format] : SOURCE_FORMATS;
  const result: ImportResult = {
    format: null,
    tried,
    hands: [],
    discarded: [],
  };
  const detected = new Map<SourceFormat, number>();
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
    // A format picked by hand reads every block, without detection's say.
    const format =
      options.format ?? tried.find((name) => FORMATS[name].recognises(block));
    if (!format) {
      extendUnrecognised(start, end);
      continue;
    }
    flushUnrecognised();
    detected.set(format, (detected.get(format) ?? 0) + 1);
    try {
      result.hands.push(FORMATS[format].parse(block));
    } catch (error) {
      if (!(error instanceof Discard)) throw error;
      result.discarded.push({ text: block, reason: error.reason });
    }
  }
  flushUnrecognised();
  result.format =
    options.format ??
    [...detected].sort(([, a], [, b]) => b - a).at(0)?.[0] ??
    null;
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
