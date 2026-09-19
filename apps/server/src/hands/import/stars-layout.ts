import type {
  Action,
  Hand,
  PokerSite,
  Post,
  Seat,
  SourceFormat,
  Street,
} from '../hand.js';
import { Discard } from './discard.js';
import { amount, cards, uncalledBets } from './reading.js';

/*
 * The layout PokerStars made common: a header, the seats, then one line per
 * post and Action, with `*** FLOP ***`-style markers between Streets.
 * GGPoker and Winamax write their own variants of it. Each Poker Site's
 * module reads its header and hands the rest to `readHand`.
 */

/** The most seats a table can have: anything bigger isn't replayed. */
const MAX_SEATS = 9;

export interface Layout {
  site: PokerSite;
  format: SourceFormat;
  /** What comes between a Screen Name and what they did: ": " or " ". */
  separator: string;
}

/** What a Poker Site's module reads from the header and table lines. */
export type Header = Pick<
  Hand,
  'siteHandId' | 'playedAt' | 'stake' | 'tableName' | 'tableSize' | 'buttonSeat'
>;

/**
 * The whole Hand, given its header and every line of its text. The seats
 * start on the third line.
 */
export function readHand(
  lines: string[],
  header: Header,
  layout: Layout,
): Hand {
  if (header.tableSize > MAX_SEATS) throw new Discard('too-many-seats');
  const seats = readSeats(lines);
  if (seats.length > MAX_SEATS) throw new Discard('too-many-seats');
  const hero = readHero(lines);
  const play = readPlay(lines, seats, layout.separator);
  return {
    site: layout.site,
    sourceFormat: layout.format,
    ...header,
    seats,
    hero,
    ...play,
    returned:
      play.returned.length > 0
        ? play.returned
        : uncalledBets({ ...play, stake: header.stake }),
  };
}

/**
 * `Seat 1: Alder239 (€11.36 in chips)` or, on Winamax, `Seat 1: Alder (2€)`,
 * until the first marker.
 */
function readSeats(lines: string[]): Seat[] {
  const seats: Seat[] = [];
  for (const line of lines.slice(2)) {
    if (line.startsWith('***')) break;
    const seat = line.match(
      /^Seat (\d+): (.+) \((\S+?)(?: in chips)?(?:, [^)]*)?\)(.*)$/,
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

/** GGPoker also writes a `Dealt to` line, without cards, for everyone else. */
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
  straddle: 'straddle',
  'the ante': 'ante',
  ante: 'ante',
};

const POST = new RegExp(
  `^posts (small blind|big blind|small & big blinds|straddle|the ante|ante) ${AMOUNT}${ALL_IN}$`,
);

/** Markers that open preflop, or say nothing the Actions don't. */
const PREFLOP_MARKERS = new Set(['HOLE CARDS', 'ANTE/BLINDS', 'PRE-FLOP']);

/** What the house takes, as the summary's `Total pot` line itemises it. */
const FEES = /\| (?:Rake|Jackpot|Bingo|Fortune|Tax) (\S+)/g;

/**
 * Everything after the seats: blinds, Actions Street by Street, the board,
 * the Showdown and who collected what. Lines that change nothing in the Hand
 * (chat, players joining or leaving, "doesn't show hand") are skipped.
 */
function readPlay(lines: string[], seats: Seat[], separator: string): Play {
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
  let showdownMarker = false;

  for (const line of lines.slice(2)) {
    const marker = line.match(/^\*\*\* (.+?) \*\*\*(.*)$/);
    if (marker) {
      const [, name, rest] = marker;
      if (name === 'SUMMARY') inSummary = true;
      else if (name === 'SHOW DOWN' || name === 'SHOWDOWN') {
        showdownMarker = true;
      } else if (name === 'FLOP' || name === 'TURN' || name === 'RIVER') {
        street = name.toLowerCase() as Street;
        const dealt = [...rest.matchAll(/\[([^\]]+)\]/g)].at(-1);
        if (!dealt) throw new Discard('malformed');
        play.board.push(...cards(dealt[1]));
      } else if (!PREFLOP_MARKERS.has(name)) {
        // Running it twice and anything else we can't replay.
        throw new Discard('malformed');
      }
      continue;
    }

    if (inSummary) {
      if (line.startsWith('Total pot ')) {
        for (const fee of line.matchAll(FEES)) play.rake += amount(fee[1]);
      }
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
    const afterName = line.slice(name.length);

    const collected = afterName.match(
      /^ collected (\S+) from (?:(main |side )?pot(?:[- ](\d+))?)/,
    );
    if (collected) {
      const [, won, kind, side] = collected;
      play.collected.push({
        screenName: name,
        amount: amount(won),
        pot: kind === 'side ' ? Number(side ?? 1) : 0,
      });
      continue;
    }
    if (!afterName.startsWith(separator)) continue;
    const statement = afterName.slice(separator.length);

    const post = statement.match(POST);
    if (post) {
      play.posts.push({
        screenName: name,
        kind: POST_KINDS[post[1]],
        amount: amount(post[2]),
      });
      continue;
    }

    const shows = statement.match(/^shows \[([^\]]+)\]/);
    if (shows) {
      play.shown.push({ screenName: name, cards: cards(shows[1]) });
      continue;
    }

    const action = readAction(statement, street, name);
    if (action) play.actions.push(action);
    else if (/^(folds|checks|calls|bets|raises|posts)\b/.test(statement)) {
      // It looks like an Action but isn't one we can read: replaying without
      // it would be wrong, so the Hand is not imported.
      throw new Discard('malformed');
    }
  }
  // GGPoker marks a Showdown in every Hand, and a winner may show by choice
  // after everyone folded: it only counts with two or more players left.
  play.showdown = showdownMarker && stillIn(play) >= 2;
  return play;
}

/** How many players who took part never folded. */
function stillIn(play: Play): number {
  const players = new Set([
    ...play.posts.map((post) => post.screenName),
    ...play.actions.map((action) => action.screenName),
  ]);
  for (const action of play.actions) {
    if (action.type === 'fold') players.delete(action.screenName);
  }
  return players.size;
}

function readAction(
  statement: string,
  street: Street,
  screenName: string,
): Action | null {
  if (/^folds\b/.test(statement)) {
    return { street, screenName, type: 'fold', allIn: false };
  }
  if (statement === 'checks') {
    return { street, screenName, type: 'check', allIn: false };
  }
  const paid = statement.match(new RegExp(`^(calls|bets) ${AMOUNT}${ALL_IN}$`));
  if (paid) {
    return {
      street,
      screenName,
      type: paid[1] === 'calls' ? 'call' : 'bet',
      amount: amount(paid[2]),
      allIn: Boolean(paid[3]),
    };
  }
  const raise = statement.match(
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
