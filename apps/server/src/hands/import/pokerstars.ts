import type { Action, Hand, Post, Seat, Stake, Street } from '../hand.js';
import { Discard } from './discard.js';

/*
 * PokerStars' own Hand History layout. PokerTracker 4 exports PokerStars
 * Hands in this same layout, so one parser covers both.
 */

const HEADER = /^PokerStars (?:Zoom )?(?:Hand|Game) #(\d+):\s+(.*)$/;

export function isPokerStarsHand(block: string): boolean {
  return HEADER.test(firstLine(block));
}

export function parsePokerStarsHand(block: string): Hand {
  const lines = block.split(/\r?\n/).map((line) => line.trimEnd());
  const [, siteHandId, rest] = lines[0].match(HEADER) ?? [];
  const { stake, playedAt } = readHeader(rest);
  const table = lines[1]?.match(
    /^Table '(.+)' (\d+)-max(?: \(.*?\))? Seat #(\d+) is the button$/,
  );
  if (!table) throw new Discard('malformed');

  const seats = readSeats(lines);
  const hero = readHero(lines);
  const play = readPlay(lines, seats);

  return {
    site: 'pokerstars',
    siteHandId,
    sourceFormat: 'pokerstars',
    playedAt,
    tableName: table[1],
    tableSize: Number(table[2]),
    buttonSeat: Number(table[3]),
    stake,
    seats,
    hero,
    ...play,
  };
}

/** `Hold'em No Limit (€0.05/€0.10 EUR) - 2026/09/18 14:34:30 CET [2026/09/18 8:34:30 ET]` */
function readHeader(rest: string): { stake: Stake; playedAt: string } {
  if (/Tournament/i.test(rest)) throw new Discard('not-cash-holdem');
  const game = rest.match(
    /^Hold'em (No Limit|Pot Limit|Limit) \((\S+)\/(\S+?)(?: ([A-Z]{3}))?\) - (.*)$/,
  );
  if (!game) {
    throw new Discard(
      /^[\w' ]+ \(\S+\/\S+/.test(rest) ? 'not-cash-holdem' : 'malformed',
    );
  }
  const [, limit, smallBlind, bigBlind, code, dates] = game;
  return {
    stake: {
      limit:
        limit === 'No Limit'
          ? 'no-limit'
          : limit === 'Pot Limit'
            ? 'pot-limit'
            : 'fixed-limit',
      smallBlind: amount(smallBlind),
      bigBlind: amount(bigBlind),
      currency: code ?? currencyOf(bigBlind),
    },
    playedAt: easternTimeToUtc(dates),
  };
}

function readSeats(lines: string[]): Seat[] {
  const seats: Seat[] = [];
  for (const line of lines.slice(2)) {
    if (line.startsWith('***')) break;
    const seat = line.match(
      /^Seat (\d+): (.+) \((\S+) in chips(?:, [^)]*)?\)(.*)$/,
    );
    if (!seat) continue;
    seats.push({
      seat: Number(seat[1]),
      screenName: seat[2],
      startingStack: amount(seat[3]),
      sittingOut: /sitting out|out of hand/.test(seat[4]),
    });
  }
  if (seats.length === 0) throw new Discard('malformed');
  return seats.sort((a, b) => a.seat - b.seat);
}

function readHero(lines: string[]): Hand['hero'] {
  for (const line of lines) {
    const dealt = line.match(/^Dealt to (.+) \[(.+)\]$/);
    if (dealt) return { screenName: dealt[1], cards: cards(dealt[2]) };
  }
  throw new Discard('no-hero');
}

type Play = Pick<
  Hand,
  | 'posts'
  | 'actions'
  | 'board'
  | 'returned'
  | 'showdown'
  | 'shown'
  | 'collected'
  | 'rake'
>;

const AMOUNT = String.raw`(\S+?)`;
const ALL_IN = String.raw`( and is all-in)?`;

const POST_KINDS: Record<string, Post['kind']> = {
  'small blind': 'small-blind',
  'big blind': 'big-blind',
  'small & big blinds': 'small-and-big-blinds',
  'the ante': 'ante',
};

/**
 * Everything after the seats: blinds, Actions Street by Street, the board,
 * the Showdown and who collected what. Lines that change nothing in the Hand
 * (chat, players joining or leaving, "doesn't show hand") are skipped.
 */
function readPlay(lines: string[], seats: Seat[]): Play {
  const play: Play = {
    posts: [],
    actions: [],
    board: [],
    returned: [],
    showdown: false,
    shown: [],
    collected: [],
    rake: 0,
  };
  // Longest first, so a name that prefixes another can't steal its lines.
  const names = seats
    .map((seat) => seat.screenName)
    .sort((a, b) => b.length - a.length);
  let street: Street = 'preflop';
  let inSummary = false;

  for (const line of lines.slice(2)) {
    const marker = line.match(/^\*\*\* (.+?) \*\*\*(.*)$/);
    if (marker) {
      const [, name, rest] = marker;
      if (name === 'SUMMARY') inSummary = true;
      else if (name === 'SHOW DOWN') play.showdown = true;
      else if (name === 'FLOP' || name === 'TURN' || name === 'RIVER') {
        street = name.toLowerCase() as Street;
        const dealt = [...rest.matchAll(/\[([^\]]+)\]/g)].at(-1);
        if (!dealt) throw new Discard('malformed');
        play.board.push(...cards(dealt[1]));
      } else if (name !== 'HOLE CARDS') {
        // Running it twice and anything else we can't replay.
        throw new Discard('malformed');
      }
      continue;
    }

    if (inSummary) {
      const total = line.match(/^Total pot .*\| Rake (\S+)/);
      if (total) play.rake = amount(total[1]);
      continue;
    }

    const returned = line.match(/^Uncalled bet \((\S+)\) returned to (.+)$/);
    if (returned) {
      play.returned.push({
        screenName: returned[2],
        amount: amount(returned[1]),
      });
      continue;
    }

    const name = names.find((candidate) => line.startsWith(candidate));
    if (!name) continue;
    const said = line.slice(name.length);

    const collected = said.match(/^ collected (\S+) from (?:main |side )?pot/);
    if (collected) {
      play.collected.push({ screenName: name, amount: amount(collected[1]) });
      continue;
    }
    if (!said.startsWith(': ')) continue;
    const move = said.slice(2);

    const post = move.match(
      new RegExp(
        `^posts (small blind|big blind|small & big blinds|the ante) ${AMOUNT}${ALL_IN}$`,
      ),
    );
    if (post) {
      play.posts.push({
        screenName: name,
        kind: POST_KINDS[post[1]],
        amount: amount(post[2]),
      });
      continue;
    }

    const shows = move.match(/^shows \[([^\]]+)\]/);
    if (shows) {
      play.shown.push({ screenName: name, cards: cards(shows[1]) });
      continue;
    }

    const action = readAction(move, street, name);
    if (action) play.actions.push(action);
    else if (/^(folds|checks|calls|bets|raises|posts)\b/.test(move)) {
      // It looks like an Action but isn't one we can read: replaying without
      // it would be wrong, so the Hand is not imported.
      throw new Discard('malformed');
    }
  }
  return play;
}

function readAction(
  move: string,
  street: Street,
  screenName: string,
): Action | null {
  if (/^folds\b/.test(move)) {
    return { street, screenName, type: 'fold', allIn: false };
  }
  if (move === 'checks') {
    return { street, screenName, type: 'check', allIn: false };
  }
  const paid = move.match(new RegExp(`^(calls|bets) ${AMOUNT}${ALL_IN}$`));
  if (paid) {
    return {
      street,
      screenName,
      type: paid[1] === 'calls' ? 'call' : 'bet',
      amount: amount(paid[2]),
      allIn: Boolean(paid[3]),
    };
  }
  const raise = move.match(
    new RegExp(`^raises ${AMOUNT} to ${AMOUNT}${ALL_IN}$`),
  );
  if (raise) {
    return {
      street,
      screenName,
      type: 'raise',
      amount: amount(raise[1]),
      to: amount(raise[2]),
      allIn: Boolean(raise[3]),
    };
  }
  return null;
}

/** `€1,234.56` → 123456 hundredths. */
export function amount(text: string): number {
  const match = text.match(/^[^\d]*([\d,]+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Discard('malformed');
  const whole = Number(match[1].replace(/,/g, ''));
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  return whole * 100 + fraction;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  $: 'USD',
  '£': 'GBP',
};

function currencyOf(text: string): string {
  const code = CURRENCY_SYMBOLS[text.charAt(0)];
  if (!code) throw new Discard('malformed');
  return code;
}

/** `Js 8s` → ["Js", "8s"], with tens written as "10". */
function cards(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((card) => {
      if (!/^[2-9TJQKA][cdhs]$/.test(card)) throw new Discard('malformed');
      return card.replace(/^T/, '10');
    });
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

function firstLine(block: string): string {
  return block.split(/\r?\n/, 1)[0];
}
