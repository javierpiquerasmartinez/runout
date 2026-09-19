import type { Hand } from '../hand.js';
import { Discard } from './discard.js';
import { firstLine, linesOf, stake, unreadGame, utcTime } from './reading.js';
import { readHand } from './stars-layout.js';

/*
 * Winamax's layout: PokerStars' with its own header and table line, no colon
 * between a Screen Name and its Action, the currency after each Amount
 * ("0.10€"), times in UTC, and no line for uncalled bets.
 */

/** `Winamax Poker - CashGame - HandId: #20954312-7731-1757700000 - Holdem no limit (0.05€/0.10€) - 2026/09/12 18:40:00 UTC` */
const HEADER =
  /^Winamax Poker - (.+?) - HandId: #([\d-]+) - (.+) - (\S+ \S+) UTC$/;

export function isWinamaxHand(block: string): boolean {
  return HEADER.test(firstLine(block));
}

export function parseWinamaxHand(block: string): Hand {
  const lines = linesOf(block);
  const header = lines[0].match(HEADER);
  if (!header) throw new Discard('malformed');
  const [, room, siteHandId, rest, time] = header;
  // Tournaments and the like name themselves where cash games say CashGame.
  if (room !== 'CashGame') throw new Discard('not-cash-holdem');
  const game = rest.match(
    /^Holdem (no limit|pot limit|fixed limit) \((\S+)\/(\S+)\)$/,
  );
  if (!game) throw unreadGame(rest);
  const [, limit, smallBlind, bigBlind] = game;
  const table = lines[1]?.match(
    /^Table: '(.+)' (\d+)-max \((real|play) money\) Seat #(\d+) is the button$/,
  );
  if (!table) throw new Discard('malformed');
  if (table[3] !== 'real') throw new Discard('not-cash-holdem');

  return readHand(
    lines,
    {
      siteHandId,
      stake: stake(limit, smallBlind, bigBlind),
      playedAt: utcTime(time),
      tableName: table[1],
      tableSize: Number(table[2]),
      buttonSeat: Number(table[4]),
    },
    { site: 'winamax', format: 'winamax', separator: ' ' },
  );
}
