import type { Action, Hand, Post, Seat, Stake, Street } from '../hand.js';
import { Discard } from './discard.js';
import type { SessionLayout } from './pieces.js';
import { uncalledBets, wallClockTime } from './reading.js';

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

/**
 * Where iPoker seats each table size on its ten table positions, smallest
 * first: a session that doesn't say its table size is the smallest whose
 * positions hold every seat taken.
 */
const TABLE_LAYOUTS: [size: number, seats: number[]][] = [
  [2, [3, 8]],
  [6, [1, 3, 5, 6, 8, 10]],
  [9, [1, 2, 3, 4, 5, 6, 8, 9, 10]],
  [10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
];

/** Games iPoker names that aren't hold'em, whether or not their Stakes follow. */
const OTHER_GAMES = /^(?:Omaha|Six Plus Holdem|[57] Card Stud|PL)\b/;

/** The limits of `<gametype>`, as clients in English, Spanish and Russian write them. */
const LIMITS: Record<string, Stake['limit']> = {
  NL: 'no-limit',
  PL: 'pot-limit',
  // Spanish: sin límite, límite de bote.
  SL: 'no-limit',
  LP: 'pot-limit',
  // Russian: без лимита.
  БЛ: 'no-limit',
  L: 'fixed-limit',
  FL: 'fixed-limit',
};

const CURRENCY_SIGNS: Record<string, string> = {
  '€': 'EUR',
  $: 'USD',
  '£': 'GBP',
};

const CURRENCY_CODES = new Set(Intl.supportedValuesOf('currency'));

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

/** The table size of a Hand whose session doesn't write one, from the seats taken. */
export function ipokerTableSize(seats: Pick<Seat, 'seat'>[]): number {
  const taken = seats.map(({ seat }) => seat);
  const layout = TABLE_LAYOUTS.find(([, positions]) =>
    taken.every((seat) => positions.includes(seat)),
  );
  return layout ? layout[0] : Math.max(...taken);
}

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
  const handStake = stakeOf(
    text(general, 'gametype') ?? '',
    text(general, 'tablecurrency'),
  );
  const siteHandId = game.attributes.gamecode;
  if (!siteHandId || !/^\d+$/.test(siteHandId)) throw new Discard('malformed');
  const tableName = text(general, 'tablename');
  if (!tableName) throw new Discard('malformed');

  const gameGeneral = body(game.body, 'general') ?? '';
  const startdate = text(gameGeneral, 'startdate');
  if (!startdate) throw new Discard('malformed');
  const players = elements(gameGeneral, 'player')
    .map(({ attributes }) => attributes)
    // An empty seat may be written as a player with no name and nothing in.
    .filter(
      (player) =>
        player.name !== '' ||
        ![player.chips, player.bet, player.win].every(
          (written) => written === undefined || amount(written) === 0,
        ),
    );
  // A Hand run more than once pays each Run apart (`board2win`) and deals
  // a board per Run; one board is not the whole of it.
  if (
    players.some((player) => 'board2win' in player) ||
    elements(game.body, 'cards').some(
      ({ attributes }) => (attributes.board ?? 'board1') !== 'board1',
    )
  ) {
    throw new Discard('run-it-twice');
  }
  const rounds = readRounds(game.body);
  const seats: Seat[] = players
    .map((player) => ({
      seat: Number(player.seat),
      screenName: player.name ?? '',
      startingStack: amount(player.chips ?? ''),
      sittingOut: sitsOut(player.name ?? '', rounds),
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
    Number(text(general, 'tablesize')) || ipokerTableSize(seats);
  if (tableSize > MAX_SEATS || seats.length > MAX_SEATS) {
    throw new Discard('too-many-seats');
  }
  const dealer = players.find((player) => player.dealer === '1');
  if (!dealer) throw new Discard('malformed');

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
      throw new Discard('unbalanced');
    }
  }
  const returned = uncalledBets({ ...play, stake: handStake });
  // Before version 20 the client counts an uncalled bet in the `win` of
  // whoever made it, as if they had won it back.
  const winsReturned = !returnsUncalledBets(general);
  const collected = players
    .map((player) => {
      const back = winsReturned
        ? (returned.find((bet) => bet.screenName === player.name)?.amount ?? 0)
        : 0;
      const won = amount(player.win ?? '') - back;
      if (won < 0) throw new Discard('unbalanced');
      return { screenName: player.name, amount: won };
    })
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
  if (rake < 0 || rake !== leftInPot) throw new Discard('unbalanced');

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

/**
 * The Stakes of a session's `<gametype>` (`Holdem NL €0.05/€0.10`) in the
 * currency of its table: `<tablecurrency>` where the client writes it,
 * otherwise the sign of the blinds (`€`, or a code such as `RSD`). Not
 * `<currency>`, the player's account's, which can differ.
 */
function stakeOf(gametype: string, tableCurrency: string | null): Stake {
  const holdem = gametype.match(/^Holdem (\S+) (\S+)\/(\S+)$/);
  if (!holdem) {
    // Omaha (`PL €0.05/€0.10`, `Omaha PL …`) and the rest of iPoker's games.
    throw new Discard(
      OTHER_GAMES.test(gametype) ||
        (/\S+\/\S+$/.test(gametype) && !gametype.startsWith('Holdem '))
        ? 'not-cash-holdem'
        : 'malformed',
    );
  }
  const limit = LIMITS[holdem[1]];
  if (!limit) throw new Discard('malformed');
  const signs = [holdem[2], holdem[3]].map((blind) =>
    blind.replace(/[\d.,]/g, ''),
  );
  if (signs[0] !== signs[1]) throw new Discard('malformed');
  const signed =
    CURRENCY_SIGNS[signs[0]] ??
    (CURRENCY_CODES.has(signs[0]) ? signs[0] : undefined);
  const currency = tableCurrency || signed;
  if (
    !currency ||
    !CURRENCY_CODES.has(currency) ||
    (signs[0] !== '' && signed !== currency)
  ) {
    throw new Discard('malformed');
  }
  return {
    limit,
    smallBlind: amount(holdem[2]),
    bigBlind: amount(holdem[3]),
    currency,
  };
}

/**
 * Whether the client hands uncalled bets back apart from what was won: from
 * version 20 on, or earlier when the session says so.
 */
function returnsUncalledBets(general: string): boolean {
  if (text(general, 'uncalled_bet_enabled') === 'true') return true;
  const major = Number(text(general, 'client_version')?.split('.')[0]);
  return major >= 20;
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
  /** Who was dealt Hole Cards, seen or not. */
  dealt: Set<string>;
} {
  const actions: Written[] = [];
  const board: string[] = [];
  const pockets = new Map<string, string[]>();
  const dealt = new Set<string>();
  for (const round of elements(game, 'round')) {
    const street = ROUNDS[round.attributes.no ?? ''];
    if (!street) throw new Discard('malformed');
    for (const cards of elements(round.body, 'cards')) {
      const { type, player } = cards.attributes;
      const faces = decode(cards.body).trim().split(/\s+/);
      if (type === 'Pocket') {
        if (player) dealt.add(player);
        // Cards nobody saw are written `X`.
        if (faces.every((card) => card !== 'X') && player) {
          pockets.set(player, faces.map(card));
        }
      } else if (BOARD_CARDS[type ?? ''] === street) {
        board.push(...faces.map(card));
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
  return { actions, board, pockets, dealt };
}

/**
 * Whether a player is seated but not dealt in: they sit out (code 8 or 9),
 * or the game neither deals them cards nor has them do anything.
 */
function sitsOut(
  screenName: string,
  rounds: { actions: Written[]; dealt: Set<string> },
): boolean {
  const theirs = rounds.actions.filter(({ player }) => player === screenName);
  if (theirs.some(({ type }) => SITTING_OUT.has(type))) return true;
  return theirs.length === 0 && !rounds.dealt.has(screenName);
}

/** Action codes for a player who sits out the Hand: 8 from its start, 9 on not posting. */
const SITTING_OUT = new Set(['8', '9']);

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
  const notDealt = new Set(
    seats.filter((seat) => seat.sittingOut).map((seat) => seat.screenName),
  );
  for (const { street: on, player: screenName, type, sum } of written) {
    if (!stacks.has(screenName)) throw new Discard('malformed');
    // Someone not dealt in may only have posted an ante first.
    if (notDealt.has(screenName) && type !== '15' && !SITTING_OUT.has(type)) {
      throw new Discard('malformed');
    }
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
      case '15': {
        // An ante is dead money: no part of the bet on the Street.
        if (street !== 'preflop') throw new Discard('malformed');
        const posted = amount(sum);
        putIn.set(screenName, (putIn.get(screenName) ?? 0) + posted);
        posts.push({ screenName, kind: 'ante', amount: posted });
        break;
      }
      case '8':
      case '9':
        // Sitting out: seated, not dealt in, nothing to replay.
        break;
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
      case '6':
      case '7': {
        // An all-in writes what the player put in with it: a call, a bet or
        // a raise, whichever it came to.
        const chips = amount(sum);
        const to = bet + chips;
        let move: Action;
        if (to <= facing) {
          move = { street, screenName, type: 'call', amount: chips, allIn };
        } else if (facing === 0) {
          move = { street, screenName, type: 'bet', amount: chips, allIn };
        } else {
          move = {
            street,
            screenName,
            type: 'raise',
            amount: to - facing,
            to,
            allIn,
          };
        }
        if (chips === 0 || !paid(chips)) throw new Discard('malformed');
        actions.push({ ...move, allIn: true });
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

/**
 * An Amount in hundredths, as each client writes it: `€1,026.75`, `0,01€`,
 * `RSD45.70`, `$1,295`. A separator followed by one or two digits at the
 * end is the decimal one, a dot or a comma; one followed by three digits
 * groups thousands, as a space may too. Anything else isn't read.
 */
function amount(written: string): number {
  const match = written.match(
    /^[^\d\s]*\s*(\d{1,3}(?:([,.  ])\d{3})?(?:\2\d{3})*|\d+)(?:([.,])(\d{1,2}))?\s*[^\d\s]*$/,
  );
  // The same mark can't both group thousands and set off the cents.
  if (!match || (match[2] && match[2] === match[3])) {
    throw new Discard('malformed');
  }
  const whole = Number(match[1].replace(/\D/g, ''));
  return whole * 100 + Number((match[4] ?? '').padEnd(2, '0'));
}

/** `HA` → "Ah", `D10` → "10d": iPoker writes the suit first. */
function card(written: string): string {
  const match = written.match(/^([SHDC])(10|[2-9JQKA])$/);
  if (!match) throw new Discard('malformed');
  return `${match[2]}${match[1].toLowerCase()}`;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * A date on a Spanish wall clock, in ISO 8601, in each layout iPoker's
 * clients have written: `2026-07-20`, `2017/01/23`, `18.05.2021` and
 * `20-Apr-2012`, each followed by `21:00:05`.
 */
function madridTime(written: string): string {
  const match = written.match(
    /^(?:(\d{4})([-/])(\d{2})\2(\d{2})|(\d{2})\.(\d{2})\.(\d{4})|(\d{2})-([A-Z][a-z]{2})-(\d{4})) (\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (!match) throw new Discard('malformed');
  const [year, month, day] = match[1]
    ? [match[1], match[3], match[4]].map(Number)
    : match[5]
      ? [match[7], match[6], match[5]].map(Number)
      : [Number(match[10]), MONTHS.indexOf(match[9]) + 1, Number(match[8])];
  const [hour, minute, second] = match.slice(11).map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
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
