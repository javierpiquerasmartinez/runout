import type { Hand, Stake } from '../hand.js';
import { Discard } from './discard.js';
import { amount, firstLine, linesOf, stake, utcTime } from './reading.js';
import { readHand } from './stars-layout.js';

/*
 * PokerTracker 4's export of iPoker Hands: a text layout of PT4's own, not
 * the client's XML. It looks like PokerStars' but writes its own header and
 * table line, `Name: Raise (NF) €0.40` where PokerStars writes `Name: raises
 * €0.30 to €0.40`, cards suit first (`D10`, `HA`), no line for uncalled
 * bets, and the Showdown and who won in the summary. Each line is rewritten
 * as PokerStars writes it before the rest is read. Times are GMT, as the
 * header says. Exports from before PT4 wrote the client version and `/GMT`
 * (2011–2013) say no time zone, and are left for the client's XML.
 */

/** Any PT4 iPoker header, old ones included. */
const HEADER = /^﻿?GAME #\d+\b/;

/** `GAME #6100000201 Version:26.1.1.31 Uncalled:Y Texas Hold'em NL €0.05/€0.10 2026-01-15 21:14:03/GMT` */
const CURRENT_HEADER =
  /^﻿?GAME #(\d+) Version:\S+ Uncalled:(\S+) (.+) (\d{4})-(\d{2})-(\d{2}) (\d{1,2}:\d{2}:\d{2})\/GMT$/;

const LIMITS: Record<string, string> = {
  NL: 'no limit',
  PL: 'pot limit',
  FL: 'limit',
};

/** The seats a 6-max table takes on iPoker's ten-seat numbering. */
const SIX_MAX_SEATS = new Set([1, 3, 5, 6, 8, 10]);

const SEAT = /^Seat (\d+): (.+) \((\S+) in chips\)( DEALER)?$/;

export function isIPokerPt4Hand(block: string): boolean {
  return HEADER.test(firstLine(block));
}

export function parseIPokerPt4Hand(block: string): Hand {
  const lines = linesOf(block);
  const first = lines[0];
  if (!HEADER.test(first)) throw new Discard('malformed');
  const header = first.match(CURRENT_HEADER);
  if (!header) {
    throw new Discard(
      / Version:/.test(first) && first.endsWith('/GMT')
        ? 'malformed'
        : 'old-export',
    );
  }
  const [, siteHandId, uncalled, game, year, month, day, time] = header;
  // Only the layout that leaves uncalled bets out of the pot is known.
  if (uncalled !== 'Y') throw new Discard('malformed');
  const holdem = game.match(/^Texas Hold'em (NL|PL|FL) (\S+)\/(\S+)$/);
  if (!holdem) {
    // Omaha and the rest of iPoker's games.
    throw new Discard(/\S+\/\S+$/.test(game) ? 'not-cash-holdem' : 'malformed');
  }
  const handStake = stake(LIMITS[holdem[1]], holdem[2], holdem[3]);
  const table = lines[1]?.match(/^Table (.+)$/);
  if (!table) throw new Discard('malformed');

  const seats = lines.flatMap((line) => {
    const seat = line.match(SEAT);
    return seat
      ? [
          {
            seat: Number(seat[1]),
            screenName: seat[2],
            stack: amount(seat[3]),
            dealer: Boolean(seat[4]),
          },
        ]
      : [];
  });
  const dealers = seats.filter((seat) => seat.dealer);
  if (dealers.length !== 1) throw new Discard('malformed');

  const { rewritten, putIn, pot } = asPokerStars(lines, seats, handStake);
  const hand = readHand(
    rewritten,
    {
      siteHandId,
      stake: handStake,
      playedAt: utcTime(`${year}/${month}/${day} ${time}`),
      tableName: table[1],
      tableSize: tableSize(seats.map((seat) => seat.seat)),
      buttonSeat: dealers[0].seat,
    },
    { site: 'ipoker', format: 'ipoker-pt4', separator: ': ' },
  );
  // The money must add up to the cent: what was put in and not handed
  // back is what was won and the Rake.
  const won = sum(hand.collected.map((paid) => paid.amount));
  const kept = putIn - sum(hand.returned.map((back) => back.amount));
  if (won !== pot || kept !== won + hand.rake) throw new Discard('unbalanced');
  return hand;
}

/**
 * PT4 writes no table size. iPoker numbers seats as a ten-seat table, so a
 * 6-max table sits players in 1, 3, 5, 6, 8 and 10; anything else is read
 * by its highest seat.
 */
function tableSize(seats: number[]): number {
  const highest = Math.max(...seats);
  if (highest <= 6 || seats.every((seat) => SIX_MAX_SEATS.has(seat))) return 6;
  return highest <= 9 ? 9 : 10;
}

function sum(amounts: number[]): number {
  return amounts.reduce((total, each) => total + each, 0);
}

/** `HA` → "Ah", `D10` → "Td", as PokerStars writes them; null for `X`, a card not shown. */
function card(written: string): string | null {
  if (written === 'X') return null;
  const match = written.match(/^([SHDC])(10|[2-9JQKA])$/i);
  if (!match) throw new Discard('malformed');
  return `${match[2] === '10' ? 'T' : match[2].toUpperCase()}${match[1].toLowerCase()}`;
}

/** Hundredths as a plain Amount: `0.40`. */
function written(hundredths: number): string {
  return (hundredths / 100).toFixed(2);
}

interface Seated {
  seat: number;
  screenName: string;
  stack: number;
}

/**
 * The Hand's lines as PokerStars writes them, what was put in altogether
 * and the pot the summary says was won. The summary's Showdown and winners
 * are written before it, where PokerStars has them.
 */
function asPokerStars(
  lines: string[],
  seats: Seated[],
  handStake: Stake,
): { rewritten: string[]; putIn: number; pot: number } {
  const stacks = new Map(seats.map((seat) => [seat.screenName, seat.stack]));
  // Longest first, so a name that prefixes another can't steal its lines.
  const names = [...stacks.keys()].sort((a, b) => b.length - a.length);
  const rewritten = lines.slice(0, 2);
  const shows: { seat: number; line: string }[] = [];
  const wins: string[] = [];
  const folded = new Set<string>();
  const streets = new Set<string>();
  let bets = new Map<string, number>();
  let putIn = 0;
  let pot: number | null = null;
  let rake = 0;
  let inSummary = false;

  for (const line of lines.slice(2)) {
    if (SEAT.test(line)) {
      rewritten.push(line);
      continue;
    }
    const marker = line.match(/^\*\*\* (.+?) \*\*\*(?: \[([^\]]+)\])?$/);
    if (marker) {
      const [, name, dealt] = marker;
      if (name === 'SUMMARY') {
        inSummary = true;
      } else if (name === 'HOLE CARDS' && !dealt) {
        rewritten.push(line);
      } else if (/^(FLOP|TURN|RIVER)$/.test(name) && dealt) {
        // A second board on a Street: the Hand was run more than once.
        if (streets.has(name)) throw new Discard('run-it-twice');
        streets.add(name);
        bets = new Map();
        rewritten.push(`*** ${name} *** [${cardsOf(dealt).join(' ')}]`);
      } else if (/^\w+ (FLOP|TURN|RIVER|SHOWDOWN|SHOW DOWN)$/.test(name)) {
        throw new Discard('run-it-twice');
      } else {
        throw new Discard('malformed');
      }
      continue;
    }

    const dealt = line.match(/^Dealt to (.+) \[(.+)\]$/);
    if (dealt && !inSummary) {
      rewritten.push(`Dealt to ${dealt[1]} [${cardsOf(dealt[2]).join(' ')}]`);
      continue;
    }

    if (inSummary) {
      const total = line.match(/^Total pot (\S+) Rake (\S+)$/);
      if (total) {
        if (pot !== null) throw new Discard('malformed');
        pot = amount(total[1]);
        rake = amount(total[2]);
        continue;
      }
    }

    const name = names.find((candidate) => line.startsWith(`${candidate}: `));
    if (!name) throw new Discard('malformed');
    const statement = line.slice(name.length + 2);
    const seat = seats.find((each) => each.screenName === name)!.seat;

    if (inSummary) {
      const shown = statement.match(/^(?:Shows|Mucks) \[([^\]]+)\]/);
      const winning = statement.match(/^wins (\S+)$/);
      if (shown) {
        const cards = shown[1].trim().split(/\s+/).map(card);
        // A player who folded and showed, or showed one card, shows nothing
        // the Showdown needs.
        if (!folded.has(name) && cards.every(Boolean)) {
          shows.push({ seat, line: `${name}: shows [${cards.join(' ')}]` });
        }
      } else if (winning) {
        wins.push(`${name} collected ${written(amount(winning[1]))} from pot`);
      } else {
        throw new Discard('malformed');
      }
      continue;
    }

    const bet = bets.get(name) ?? 0;
    const facing = Math.max(0, ...bets.values());
    /** Puts `chips` more in, saying so if they were the player's last. */
    const pay = (chips: number, live = chips) => {
      const left = stacks.get(name)! - chips;
      if (chips <= 0 || left < 0) throw new Discard('malformed');
      stacks.set(name, left);
      bets.set(name, bet + live);
      putIn += chips;
      return left === 0 ? ' and is all-in' : '';
    };
    let match: RegExpMatchArray | null;

    if ((match = statement.match(/^Post (SB|BB|Ante)( Allin)? (\S+)$/))) {
      const [, blind, allIn, posted] = match;
      const chips = amount(posted);
      const both =
        blind === 'BB' && chips === handStake.smallBlind + handStake.bigBlind;
      const kind =
        blind === 'SB'
          ? 'small blind'
          : blind === 'Ante'
            ? 'ante'
            : both
              ? 'small & big blinds'
              : 'big blind';
      const live = blind === 'Ante' ? 0 : both ? handStake.bigBlind : chips;
      const suffix = pay(chips, live);
      if (Boolean(allIn) !== Boolean(suffix)) throw new Discard('malformed');
      rewritten.push(`${name}: posts ${kind} ${written(chips)}${suffix}`);
    } else if (statement === 'Fold') {
      folded.add(name);
      rewritten.push(`${name}: folds`);
    } else if (statement === 'Check') {
      rewritten.push(`${name}: checks`);
    } else if ((match = statement.match(/^(Call|Bet) (\S+)$/))) {
      const chips = amount(match[2]);
      const verb = match[1] === 'Call' ? 'calls' : 'bets';
      rewritten.push(`${name}: ${verb} ${written(chips)}${pay(chips)}`);
    } else if ((match = statement.match(/^Raise(?: \(NF\))? (\S+)$/))) {
      // A raise writes what the player's bet on the Street is raised to.
      const to = amount(match[1]);
      if (to <= facing) throw new Discard('malformed');
      const suffix = pay(to - bet);
      rewritten.push(
        `${name}: raises ${written(to - facing)} to ${written(to)}${suffix}`,
      );
    } else if ((match = statement.match(/^Allin (\S+)$/))) {
      // An all-in writes the chips the player had left, which says whether
      // it bets, calls or raises.
      const chips = amount(match[1]);
      if (chips !== stacks.get(name)) throw new Discard('malformed');
      const to = bet + chips;
      const suffix = pay(chips);
      rewritten.push(
        facing === 0
          ? `${name}: bets ${written(chips)}${suffix}`
          : to <= facing
            ? `${name}: calls ${written(chips)}${suffix}`
            : `${name}: raises ${written(to - facing)} to ${written(to)}${suffix}`,
      );
    } else {
      // Anything else would be replayed wrong without it.
      throw new Discard('malformed');
    }
  }
  if (pot === null) throw new Discard('malformed');

  rewritten.push(
    '*** SHOW DOWN ***',
    ...shows.sort((a, b) => a.seat - b.seat).map((shown) => shown.line),
    ...wins,
    '*** SUMMARY ***',
    `Total pot ${written(pot)} | Rake ${written(rake)}`,
  );
  return { rewritten, putIn, pot };
}

/** `D10 S7 H2` → ["Td", "7s", "2h"]; every card must be known. */
function cardsOf(text: string): string[] {
  const cards = text.trim().split(/\s+/).map(card);
  if (!cards.every(Boolean)) throw new Discard('malformed');
  return cards as string[];
}
