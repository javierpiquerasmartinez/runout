import type { Hand } from '../hand.js';
import { Discard } from './discard.js';
import {
  amount,
  firstLine,
  linesOf,
  stake,
  unreadGame,
  utcTime,
} from './reading.js';
import { readHand } from './stars-layout.js';

/*
 * CoinPoker's layout, as its client exports it: PokerStars' with its own
 * header, Amounts in USDT ("₮0.10"), the Hero written as `Hero` and every
 * opponent under a name hashed for that Hand alone. A few lines are its own:
 * `ALLIN`, `RETURN`, a `STRADDLE` posted after the hole cards and a Splash
 * (`SPLASH dropped`). They are rewritten as PokerStars writes them before
 * the rest is read.
 */

/** `CoinPoker Hand #160064400025: NLH (₮0.05/₮0.10) 2026/10/19 17:55:42 CEST` */
const HEADER = /^CoinPoker Hand #(\d+): (.+)$/;

/** How far ahead of UTC each time zone label is, in hours. */
const TIME_ZONES: Record<string, number> = { UTC: 0, GMT: 0, CET: 1, CEST: 2 };

export function isCoinPokerHand(block: string): boolean {
  return HEADER.test(firstLine(block));
}

export function parseCoinPokerHand(block: string): Hand {
  const lines = linesOf(block);
  const header = lines[0].match(HEADER);
  if (!header) throw new Discard('malformed');
  const [, siteHandId, rest] = header;
  const game = rest.match(
    /^(\S+) \((\S+)\/(\S+)\) (\d{4}\/\d{2}\/\d{2} \d{1,2}:\d{2}:\d{2}) (\w+)$/,
  );
  if (!game) throw new Discard('malformed');
  const [, name, smallBlind, bigBlind, time, zone] = game;
  // Omaha ("PLO") and the rest of CoinPoker's games.
  if (name !== 'NLH') throw unreadGame(rest);
  const table = lines[1]?.match(
    /^Table '(.+)' (\d+)-max Seat #(\d+) is the button$/,
  );
  if (!table) throw new Discard('malformed');
  if (lines.some((line) => /^Hand was run (?!once$)/.test(line))) {
    throw new Discard('run-it-twice');
  }

  const splash = lines
    .map((line) => line.match(/^SPLASH dropped (\S+)$/))
    .reduce((sum, dropped) => sum + (dropped ? amount(dropped[1]) : 0), 0);
  const hand = readHand(
    asPokerStars(lines),
    {
      siteHandId,
      stake: stake('no limit', smallBlind, bigBlind),
      playedAt: zonedTime(time, zone),
      tableName: table[1],
      tableSize: Number(table[2]),
      buttonSeat: Number(table[3]),
    },
    { site: 'coinpoker', format: 'coinpoker', separator: ': ' },
  );
  return splash > 0 ? { ...hand, splash } : hand;
}

/** `2026/10/19 17:55:42` on a wall clock labelled `CEST`, in ISO 8601. */
function zonedTime(time: string, zone: string): string {
  const offset = TIME_ZONES[zone];
  if (offset === undefined) throw new Discard('malformed');
  const wallClock = new Date(utcTime(time)).getTime();
  return new Date(wallClock - offset * 3_600_000).toISOString();
}

/**
 * CoinPoker's own lines, written the way PokerStars writes them. An `ALLIN`
 * gives only the chips added, so whether it bets, calls or raises, and to
 * what, follows from the bets already on the Street.
 */
function asPokerStars(lines: string[]): string[] {
  let bets = new Map<string, number>();
  const rewritten: string[] = [];
  for (const line of lines) {
    if (/^\*\*\* (FLOP|TURN|RIVER) \*\*\*/.test(line)) bets = new Map();
    if (line.startsWith('SPLASH dropped ')) continue;

    const statement = line.match(/^(.+?): (.+)$/);
    if (!statement) {
      rewritten.push(line);
      continue;
    }
    const [, name, what] = statement;
    const bet = bets.get(name) ?? 0;
    const facing = Math.max(0, ...bets.values());
    let match: RegExpMatchArray | null;

    if ((match = what.match(/^ALLIN (\S+)$/))) {
      const to = bet + amount(match[1]);
      bets.set(name, to);
      rewritten.push(
        facing === 0
          ? `${name}: bets ${match[1]} and is all-in`
          : to <= facing
            ? `${name}: calls ${match[1]} and is all-in`
            : `${name}: raises ${usdt(to - facing)} to ${usdt(to)} and is all-in`,
      );
    } else if ((match = what.match(/^RETURN (\S+)$/))) {
      rewritten.push(`Uncalled bet (${match[1]}) returned to ${name}`);
    } else if ((match = what.match(/^STRADDLE (\S+)$/))) {
      bets.set(name, bet + amount(match[1]));
      rewritten.push(`${name}: posts straddle ${match[1]}`);
    } else {
      // A new player's blind, posted out of turn, is a big blind like any.
      const plain = what.replace(/^posts auto big blind /, 'posts big blind ');
      if ((match = plain.match(/^(?:posts .+|calls|bets) (\S+)$/))) {
        bets.set(name, bet + amount(match[1]));
      } else if ((match = plain.match(/^raises \S+ to (\S+)$/))) {
        bets.set(name, amount(match[1]));
      }
      rewritten.push(`${name}: ${plain}`);
    }
  }
  return rewritten;
}

/** Hundredths of USDT as CoinPoker writes them: `₮1.51`. */
function usdt(hundredths: number): string {
  return `₮${(hundredths / 100).toFixed(2)}`;
}
