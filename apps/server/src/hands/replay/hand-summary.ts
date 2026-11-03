import type { Hand, PokerSite, Stake, Street } from '../hand.js';
import { heroResult } from './hero-result.js';
import { positions } from './positions.js';
import { BOARD_SIZE, timeline } from './timeline.js';

/** The languages a Hand Summary is written in: the UI's. */
export type SummaryLanguage = 'es' | 'en';

export const SUMMARY_LANGUAGES: readonly SummaryLanguage[] = ['es', 'en'];

/**
 * The Summary's own few words, and the locale its numbers, money and date
 * are written in. Poker verbs, Positions and "Hero" are never translated.
 */
const WORDS: Record<
  SummaryLanguage,
  {
    locale: string;
    streets: Record<Street, string>;
    showdown: string;
    shows: string;
    wins: string;
    result: string;
  }
> = {
  es: {
    locale: 'es-ES',
    streets: { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' },
    showdown: 'Showdown',
    shows: 'muestra',
    wins: 'gana',
    result: 'Resultado Hero',
  },
  en: {
    locale: 'en-US',
    streets: { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' },
    showdown: 'Showdown',
    shows: 'shows',
    wins: 'wins',
    result: 'Hero result',
  },
};

const SITE_NAMES: Record<PokerSite, string> = {
  pokerstars: 'PokerStars',
  ggpoker: 'GGPoker',
  winamax: 'Winamax',
  coinpoker: 'CoinPoker',
};

const LIMIT_PREFIX: Record<Stake['limit'], string> = {
  'no-limit': 'NL',
  'pot-limit': 'PL',
  'fixed-limit': 'FL',
};

/**
 * Currencies with no ISO 4217 code, which Intl can't format: each is written
 * like the ISO currency it tracks, with its own sign.
 */
const TICKERS: Record<string, { sign: string; writtenLike: string }> = {
  USDT: { sign: '₮', writtenLike: 'USD' },
};

const SUITS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

/**
 * The Hand Summary: the readable text of a whole Hand to paste into a chat.
 * Every amount is in big blinds, players other than the Hero go by Position,
 * and the date is the day the Hand was played in `timeZone`. It is written
 * for people and never read back in.
 */
export function handSummary(
  hand: Hand,
  { language, timeZone }: { language: SummaryLanguage; timeZone: string },
): string {
  const words = WORDS[language];
  const number = new Intl.NumberFormat(words.locale, {
    maximumFractionDigits: 2,
  });
  const bb = (amount: number, sign = false) =>
    `${sign && amount > 0 ? '+' : ''}${number.format(amount / hand.stake.bigBlind)}bb`;
  const positionOf = positions(hand);
  const hero = hand.hero.screenName;
  const actor = (name: string) =>
    name === hero ? 'Hero' : (positionOf.get(name) ?? name);
  const replay = timeline(hand);

  const ante = hand.posts.find((post) => post.kind === 'ante');
  const header = [
    SITE_NAMES[hand.site],
    stakeName(hand.stake, words.locale),
    ...(ante ? [`ante ${bb(ante.amount)}`] : []),
    hand.tableSize === 2 ? 'HU' : `${hand.tableSize}-max`,
    new Intl.DateTimeFormat(words.locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone,
    }).format(new Date(hand.playedAt)),
  ].join(' · ');
  const heroSeat = hand.seats.find((seat) => seat.screenName === hero)!;
  const heroLine = [
    `Hero ${positionOf.get(hero)} ${bb(heroSeat.startingStack)}`,
    ...(hand.hero.cards.length > 0 ? [cardsOf(hand.hero.cards)] : []),
  ].join(' · ');

  const lines = [header, heroLine, ''];
  for (const street of STREETS.filter(
    (street) => BOARD_SIZE[street] <= hand.board.length,
  )) {
    const items = streetActions(hand, street, actor, bb);
    let line = words.streets[street];
    if (street !== 'preflop') {
      // The deal of a Street: the pot as it begins, bets gathered.
      const dealt = replay.states.find(
        (state, index) =>
          index > 0 && state.street === street && state.action === null,
      );
      const cards = hand.board.slice(
        street === 'flop' ? 0 : BOARD_SIZE[street] - 1,
        BOARD_SIZE[street],
      );
      line += ` (${bb(dealt?.pot ?? 0)}) ${cardsOf(cards)}`;
    }
    if (items.length > 0) line += `: ${items.join(', ')}`;
    lines.push(line);
  }

  const result = replay.states.at(-1)!.result!;
  const won = new Map<string, number>();
  for (const { screenName, amount } of result.pots.flatMap((p) => p.winners)) {
    won.set(screenName, (won.get(screenName) ?? 0) + amount);
  }
  const winners = [...won]
    .map(([name, amount]) => `${actor(name)} ${words.wins} ${bb(amount)}`)
    .join(', ');
  const rake = hand.rake > 0 ? ` (rake ${bb(hand.rake)})` : '';
  const shown = result.revealed
    .filter((revealed) => revealed.screenName !== hero)
    .map(
      (revealed) =>
        `${actor(revealed.screenName)} ${words.shows} ${cardsOf(revealed.cards)}`,
    );
  lines.push(
    hand.showdown
      ? `${words.showdown}: ${[...(shown.length > 0 ? [shown.join(', ')] : []), winners + rake].join(' · ')}`
      : winners + rake,
  );
  lines.push(`${words.result}: ${bb(heroResult(hand).result, true)}`);
  return lines.join('\n');
}

/**
 * Each Action of a Street, in order: who, a verb, and what a bet or raise
 * is to on the Street. Preflop, a straddle comes first, and re-raises count
 * from the big blind as the first bet: raise, 3bet, 4bet…
 */
function streetActions(
  hand: Hand,
  street: Street,
  actor: (name: string) => string,
  bb: (amount: number) => string,
): string[] {
  const items: string[] = [];
  // What each player has bet on this Street so far.
  const bets = new Map<string, number>();
  const bet = (name: string) => bets.get(name) ?? 0;
  let level = 1;
  if (street === 'preflop') {
    for (const post of hand.posts) {
      const live =
        post.kind === 'ante'
          ? 0
          : post.kind === 'small-and-big-blinds'
            ? post.amount - hand.stake.smallBlind
            : post.amount;
      bets.set(post.screenName, bet(post.screenName) + live);
      if (post.kind === 'straddle') {
        items.push(`${actor(post.screenName)} straddle ${bb(post.amount)}`);
      }
    }
  }
  for (const action of hand.actions.filter((a) => a.street === street)) {
    const who = actor(action.screenName);
    const to =
      action.type === 'raise'
        ? action.to
        : action.type === 'call' || action.type === 'bet'
          ? bet(action.screenName) + action.amount
          : null;
    if (to === null) {
      items.push(`${who} ${action.type}`);
      continue;
    }
    bets.set(action.screenName, to);
    if (action.type === 'raise') level += 1;
    if (action.allIn) {
      items.push(`${who} all-in ${bb(to)}`);
    } else if (action.type === 'call') {
      items.push(`${who} call`);
    } else if (action.type === 'bet') {
      items.push(`${who} bet ${bb(to)}`);
    } else {
      const verb = street === 'preflop' && level > 2 ? `${level}bet` : 'raise';
      items.push(`${who} ${verb} ${bb(to)}`);
    }
  }
  return items;
}

/** The Stake by name, with its blinds in money: "NL50 (0,25 €/0,50 €)". */
function stakeName(stake: Stake, locale: string): string {
  const money = (amount: number) => {
    const ticker = TICKERS[stake.currency];
    const format = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: ticker?.writtenLike ?? stake.currency,
    });
    const written = ticker
      ? format
          .formatToParts(amount / 100)
          .map((part) => (part.type === 'currency' ? ticker.sign : part.value))
          .join('')
      : format.format(amount / 100);
    // Intl keeps the sign and the number together with a no-break space,
    // which a chat may not take as a space.
    return written.replace(/[\u00a0\u202f]/g, ' ');
  };
  return `${LIMIT_PREFIX[stake.limit]}${stake.bigBlind} (${money(stake.smallBlind)}/${money(stake.bigBlind)})`;
}

/** Cards rank then suit symbol, tens as "T": "A♠ T♦". */
function cardsOf(cards: string[]): string {
  return cards
    .map(
      (card) => `${card.slice(0, -1).replace('10', 'T')}${SUITS[card.at(-1)!]}`,
    )
    .join(' ');
}
