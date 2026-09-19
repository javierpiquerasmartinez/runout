import type { Hand } from '../hand.js';
import { Discard } from './discard.js';
import { firstLine, linesOf, stake, unreadGame, utcTime } from './reading.js';
import { readHand } from './stars-layout.js';

/*
 * GGPoker's layout, as PokerCraft downloads it and the Trackers export it:
 * PokerStars' with its own header, a hand ID with a letter prefix
 * ("RC", "HD"…), and no currency code, since GGPoker plays in dollars.
 */

const HEADER = /^Poker Hand #([A-Z]{0,3}\d+):\s+(.*)$/;

export function isGGPokerHand(block: string): boolean {
  return HEADER.test(firstLine(block));
}

export function parseGGPokerHand(block: string): Hand {
  const lines = linesOf(block);
  const header = lines[0].match(HEADER);
  if (!header) throw new Discard('malformed');
  const [, siteHandId, rest] = header;
  // `Hold'em No Limit ($0.05/$0.1) - 2026/09/12 19:02:11`
  const game = rest.match(
    /^Hold'em (No Limit|Pot Limit|Limit) \((\S+)\/(\S+?)\) - (.+)$/,
  );
  if (!game || /Tournament/i.test(rest)) throw unreadGame(rest);
  const [, limit, smallBlind, bigBlind, time] = game;
  const table = lines[1]?.match(
    /^Table '(.+)' (\d+)-max Seat #(\d+) is the button$/,
  );
  if (!table) throw new Discard('malformed');

  return readHand(
    lines,
    {
      siteHandId,
      stake: stake(limit, smallBlind, bigBlind),
      // GGPoker writes no time zone; its Hand Histories are in UTC.
      playedAt: utcTime(time),
      tableName: table[1],
      tableSize: Number(table[2]),
      buttonSeat: Number(table[3]),
    },
    { site: 'ggpoker', format: 'ggpoker', separator: ': ' },
  );
}
