import type { Action, Hand, Post, Seat, Street } from '../hand.js';
import { Discard } from './discard.js';
import type { SessionLayout } from './pieces.js';
import { amount, stake, uncalledBets, wallClockTime } from './reading.js';

/*
 * iPoker's layout, as its client saves it with "Store Hand History Locally"
 * on (Hold'em Manager's archive is the same): one XML session per table, a
 * header with the Hero (`<nickname>`), the Stakes (`<gametype>`) and the
 * table, then a `<game>` per Hand. Each game lists its players, with what
 * each put in (`bet`) and won (`win`), and its rounds: 0 the blinds, then
 * preflop, flop, turn and river, each with its cards and Actions. Actions
 * are numbered (`no`) and not always written in that order. No time zone is
 * written: each skin writes its own local time, read as Spain's, where the
 * skins we play are.
 */

/** A session holds a Hand per game; each Hand's text is its header and its game. */
export const IPOKER_SESSION: SessionLayout = {
  opens: /^(?:<\?xml[^>]*\?>\s*)?<session[\s>]/,
  handOpen: /<game[\s>]/,
  handClose: '</game>',
  close: '</session>',
  handText: (header, game) => `${header}${game}\n</session>`,
};

const TIME_ZONE = 'Europe/Madrid';

/** The most seats a table can have: anything bigger isn't replayed. */
const MAX_SEATS = 9;

/** The table sizes iPoker deals, for a session that doesn't say its own. */
const TABLE_SIZES = [2, 6, 8, 9, 10];

const LIMITS: Record<string, string> = {
  NL: 'no limit',
  PL: 'pot limit',
  L: 'limit',
  FL: 'limit',
};

/** The Street each round is, by its `no`; round 0 holds the blinds. */
const ROUNDS: Record<string, Street> = {
  '0': 'preflop',
  '1': 'preflop',
  '2': 'flop',
  '3': 'turn',
  '4': 'river',
};

const BOARD_CARDS: Record<string, Street> = {
  Flop: 'flop',
  Turn: 'turn',
  River: 'river',
};

export function isIPokerHand(block: string): boolean {
  return IPOKER_SESSION.opens.test(block) && /<game[\s>]/.test(block);
}

export function parseIPokerHand(block: string): Hand {
  const gameAt = block.search(/<game[\s>]/);
  if (gameAt === -1) throw new Discard('malformed');
  const header = block.slice(0, gameAt);
  const games = elements(block.slice(gameAt), 'game');
  if (games.length !== 1) throw new Discard('malformed');
  const [game] = games;

  const general = body(header, 'general');
  if (general === null) throw new Discard('malformed');
  if (/<tournament/.test(general) || text(general, 'mode') === 'play') {
    throw new Discard('not-cash-holdem');
  }
  const gametype = text(general, 'gametype') ?? '';
  const holdem = gametype.match(/^Holdem (NL|PL|FL|L) (\S+)\/(\S+)$/);
  if (!holdem) {
    // Omaha (`PL €0.05/€0.10`, `Omaha PL …`) and the rest of iPoker's games.
    throw new Discard(
      /\S+\/\S+$/.test(gametype) ? 'not-cash-holdem' : 'malformed',
    );
  }
  const currency = text(general, 'tablecurrency') ?? '';
  const handStake = stake(
    LIMITS[holdem[1]],
    holdem[2],
    holdem[3],
    /^[A-Z]{3}$/.test(currency) ? currency : undefined,
  );
  const siteHandId = game.attributes.gamecode;
  if (!siteHandId || !/^\d+$/.test(siteHandId)) throw new Discard('malformed');
  const tableName = text(general, 'tablename');
  if (!tableName) throw new Discard('malformed');

  const gameGeneral = body(game.body, 'general') ?? '';
  const startdate = text(gameGeneral, 'startdate');
  if (!startdate) throw new Discard('malformed');
  const players = elements(gameGeneral, 'player').map(
    ({ attributes }) => attributes,
  );
  const seats: Seat[] = players
    .map((player) => ({
      seat: Number(player.seat),
      screenName: player.name ?? '',
      startingStack: amount(player.chips ?? ''),
      sittingOut: false,
    }))
    .sort((a, b) => a.seat - b.seat);
  if (
    seats.length === 0 ||
    seats.some(({ seat, screenName }) => !(seat > 0) || screenName === '') ||
    new Set(seats.map(({ seat }) => seat)).size < seats.length ||
    new Set(seats.map(({ screenName }) => screenName)).size < seats.length
  ) {
    throw new Discard('malformed');
  }
  const tableSize =
    Number(text(general, 'tablesize')) ||
    TABLE_SIZES.find((size) => size >= seats.at(-1)!.seat) ||
    seats.at(-1)!.seat;
  if (tableSize > MAX_SEATS || seats.length > MAX_SEATS) {
    throw new Discard('too-many-seats');
  }
  const dealer = players.find((player) => player.dealer === '1');
  if (!dealer) throw new Discard('malformed');

  const rounds = readRounds(game.body);
  const nickname = text(general, 'nickname');
  const heroCards = rounds.pockets.get(nickname ?? '');
  if (!nickname || !seats.some((seat) => seat.screenName === nickname)) {
    throw new Discard('no-hero');
  }
  if (!heroCards) throw new Discard('no-hero');
  if (heroCards.length !== 2) throw new Discard('malformed');

  const play = readPlay(rounds.actions, seats);
  // What each player put in, as the game itself totals it.
  for (const player of players) {
    if (amount(player.bet ?? '') !== (play.putIn.get(player.name) ?? 0)) {
      throw new Discard('malformed');
    }
  }
  const returned = uncalledBets({ ...play, stake: handStake });
  const collected = players
    .map((player) => ({
      screenName: player.name,
      amount: amount(player.win ?? ''),
    }))
    .filter((won) => won.amount > 0);
  const inPot =
    [...play.putIn.values()].reduce((sum, put) => sum + put, 0) -
    returned.reduce((sum, back) => sum + back.amount, 0);
  const leftInPot = inPot - collected.reduce((sum, won) => sum + won.amount, 0);
  const rakeAmounts = players.filter((player) => 'rakeamount' in player);
  const rake =
    rakeAmounts.length > 0
      ? rakeAmounts.reduce((sum, player) => sum + amount(player.rakeamount), 0)
      : leftInPot;
  // The money must add up to the cent, Rake and all.
  if (rake < 0 || rake !== leftInPot) throw new Discard('malformed');

  const stillIn = new Set(
    [...play.posts, ...play.actions].map((move) => move.screenName),
  );
  for (const action of play.actions) {
    if (action.type === 'fold') stillIn.delete(action.screenName);
  }
  const showdown = stillIn.size >= 2;

  return {
    site: 'ipoker',
    siteHandId,
    sourceFormat: 'ipoker',
    playedAt: madridTime(startdate),
    tableName,
    tableSize,
    buttonSeat: Number(dealer.seat),
    stake: handStake,
    seats,
    hero: { screenName: nickname, cards: heroCards },
    posts: play.posts,
    actions: play.actions,
    board: rounds.board,
    returned,
    showdown,
    shown: showdown
      ? seats.flatMap(({ screenName }) => {
          const cards = rounds.pockets.get(screenName);
          return stillIn.has(screenName) && cards
            ? [{ screenName, cards }]
            : [];
        })
      : [],
    collected,
    rake,
    fees: 0,
  };
}

interface Written {
  no: number;
  street: Street;
  player: string;
  type: string;
  sum: string;
}

/** The game's Actions, in their `no` order, its board and the Hole Cards it shows. */
function readRounds(game: string): {
  actions: Written[];
  board: string[];
  pockets: Map<string, string[]>;
} {
  const actions: Written[] = [];
  const board: string[] = [];
  const pockets = new Map<string, string[]>();
  for (const round of elements(game, 'round')) {
    const street = ROUNDS[round.attributes.no ?? ''];
    if (!street) throw new Discard('malformed');
    for (const cards of elements(round.body, 'cards')) {
      const { type, player } = cards.attributes;
      const dealt = decode(cards.body).trim().split(/\s+/);
      if (type === 'Pocket') {
        // Cards nobody saw are written `X`.
        if (dealt.every((card) => card !== 'X') && player) {
          pockets.set(player, dealt.map(card));
        }
      } else if (BOARD_CARDS[type ?? ''] === street) {
        board.push(...dealt.map(card));
      } else {
        throw new Discard('malformed');
      }
    }
    for (const action of elements(round.body, 'action')) {
      const { no, player, type, sum } = action.attributes;
      if (!no || !/^\d+$/.test(no) || !player || !type) {
        throw new Discard('malformed');
      }
      actions.push({ no: Number(no), street, player, type, sum: sum ?? '' });
    }
  }
  actions.sort((a, b) => a.no - b.no);
  const order: Street[] = ['preflop', 'flop', 'turn', 'river'];
  actions.forEach((action, index) => {
    const before = actions[index - 1];
    if (before && order.indexOf(action.street) < order.indexOf(before.street)) {
      throw new Discard('malformed');
    }
  });
  return { actions, board, pockets };
}

/** The posts and Actions, and what each player put in altogether. */
function readPlay(
  written: Written[],
  seats: Seat[],
): Pick<Hand, 'posts' | 'actions'> & { putIn: Map<string, number> } {
  const stacks = new Map(
    seats.map((seat) => [seat.screenName, seat.startingStack]),
  );
  const posts: Post[] = [];
  const actions: Action[] = [];
  const putIn = new Map<string, number>();
  let street: Street = 'preflop';
  let bets = new Map<string, number>();
  for (const { street: on, player: screenName, type, sum } of written) {
    if (!stacks.has(screenName)) throw new Discard('malformed');
    if (on !== street) {
      street = on;
      bets = new Map();
    }
    const bet = bets.get(screenName) ?? 0;
    const facing = Math.max(0, ...bets.values());
    const paid = (chips: number) => {
      bets.set(screenName, bet + chips);
      const total = (putIn.get(screenName) ?? 0) + chips;
      putIn.set(screenName, total);
      return total === stacks.get(screenName);
    };
    const allIn = false;
    switch (type) {
      case '1':
      case '2': {
        if (street !== 'preflop') throw new Discard('malformed');
        const posted = amount(sum);
        paid(posted);
        posts.push({
          screenName,
          kind: type === '1' ? 'small-blind' : 'big-blind',
          amount: posted,
        });
        break;
      }
      case '0':
        actions.push({ street, screenName, type: 'fold', allIn });
        break;
      case '4':
        actions.push({ street, screenName, type: 'check', allIn });
        break;
      case '3':
      case '5': {
        const chips = amount(sum);
        actions.push({
          street,
          screenName,
          type: type === '3' ? 'call' : 'bet',
          amount: chips,
          allIn: paid(chips),
        });
        break;
      }
      case '23': {
        // A raise writes what the player's bet on the Street is raised to.
        const to = amount(sum);
        if (to <= facing) throw new Discard('malformed');
        actions.push({
          street,
          screenName,
          type: 'raise',
          amount: to - facing,
          to,
          allIn: paid(to - bet),
        });
        break;
      }
      default:
        // Anything else would be replayed wrong without it.
        throw new Discard('malformed');
    }
  }
  return { posts, actions, putIn };
}

/** `HA` → "Ah", `D10` → "10d": iPoker writes the suit first. */
function card(written: string): string {
  const match = written.match(/^([SHDC])(10|[2-9JQKA])$/);
  if (!match) throw new Discard('malformed');
  return `${match[2]}${match[1].toLowerCase()}`;
}

/** `2026-07-20 21:00:05` on a Spanish wall clock, in ISO 8601. */
function madridTime(written: string): string {
  const match = written.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (!match) throw new Discard('malformed');
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) {
    throw new Discard('malformed');
  }
  return wallClockTime(TIME_ZONE, year, month, day, hour, minute, second);
}

interface Element {
  attributes: Record<string, string>;
  body: string;
}

/** Each `<name …>…</name>` or `<name …/>` in the XML, in order, not nested in one another. */
function elements(xml: string, name: string): Element[] {
  const pattern = new RegExp(
    `<${name}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${name}\\s*>)`,
    'g',
  );
  return [...xml.matchAll(pattern)].map((match) => ({
    attributes: attributesOf(match[1] ?? ''),
    body: match[2] ?? '',
  }));
}

/** What is inside the first `<name>` of the XML, as written; null when there is none. */
function body(xml: string, name: string): string | null {
  const [found] = elements(xml, name);
  return found ? found.body : null;
}

/** The text inside the first `<name>` of the XML; null when there is none. */
function text(xml: string, name: string): string | null {
  const found = body(xml, name);
  return found === null ? null : decode(found).trim();
}

function attributesOf(written: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [, name, double, single] of written.matchAll(
    /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    attributes[name] = decode(double ?? single);
  }
  return attributes;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decode(written: string): string {
  return written.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi,
    (entity, decimal, hex, name) =>
      decimal
        ? String.fromCodePoint(Number(decimal))
        : hex
          ? String.fromCodePoint(parseInt(hex, 16))
          : (ENTITIES[name] ?? entity),
  );
}
