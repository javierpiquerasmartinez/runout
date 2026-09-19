import type { Hand, Stake } from '../hand.js';
import { Discard } from './discard.js';
import { firstLine, linesOf, stake, unreadGame } from './reading.js';
import { readHand } from './stars-layout.js';

/*
 * PokerStars' own Hand History layout. PokerTracker 4, Hold'em Manager 3 and
 * Hand2Note export PokerStars Hands in this same layout, so one parser covers
 * all of them.
 */

const HEADER = /^PokerStars (?:Zoom )?(?:Hand|Game) #(\d+):\s+(.*)$/;

export function isPokerStarsHand(block: string): boolean {
  return HEADER.test(firstLine(block));
}

export function parsePokerStarsHand(block: string): Hand {
  const lines = linesOf(block);
  const header = lines[0].match(HEADER);
  // Reached when the format was picked by hand for text that isn't in it.
  if (!header) throw new Discard('malformed');
  const [, siteHandId, rest] = header;
  const game = readGame(rest);
  const table = lines[1]?.match(
    /^Table '(.+)' (\d+)-max(?: \(.*?\))? Seat #(\d+) is the button$/,
  );
  if (!table) throw new Discard('malformed');

  return readHand(
    lines,
    {
      siteHandId,
      ...game,
      tableName: table[1],
      tableSize: Number(table[2]),
      buttonSeat: Number(table[3]),
    },
    { site: 'pokerstars', format: 'pokerstars', separator: ': ' },
  );
}

/** `Hold'em No Limit (€0.05/€0.10 EUR) - 2026/09/18 14:34:30 CET [2026/09/18 8:34:30 ET]` */
function readGame(rest: string): { stake: Stake; playedAt: string } {
  const game = rest.match(
    /^Hold'em (No Limit|Pot Limit|Limit) \((\S+)\/(\S+?)(?: ([A-Z]{3}))?\) - (.*)$/,
  );
  if (!game || /Tournament/i.test(rest)) throw unreadGame(rest);
  const [, limit, smallBlind, bigBlind, currency, dates] = game;
  return {
    stake: stake(limit, smallBlind, bigBlind, currency),
    playedAt: easternTimeToUtc(dates),
  };
}

/**
 * PokerStars prints the time in US Eastern Time, in brackets after the local
 * time or on its own. The local label can't be trusted ("CET" in summer), so
 * the Eastern time is the one read.
 */
function easternTimeToUtc(dates: string): string {
  const match = dates.match(
    /(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2}) ET\b/,
  );
  if (!match) throw new Discard('malformed');
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  // The offset at the wall-clock instant is right except within an hour of a
  // DST change; a second pass settles it.
  let utc = wallClock - offsetOf('America/New_York', wallClock);
  utc = wallClock - offsetOf('America/New_York', utc);
  return new Date(utc).toISOString();
}

/** How far ahead of UTC `timeZone`'s wall clock is at `instant`, in ms. */
function offsetOf(timeZone: string, instant: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)]),
  );
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}
