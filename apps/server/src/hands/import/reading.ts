import type { Hand, Stake, Street } from '../hand.js';
import { Discard } from './discard.js';

/*
 * Pieces every format reads the same way: Amounts, cards and currencies.
 */

/** `€1,234.56`, `$5` or `0.10€` → hundredths: 123456, 500, 10. */
export function amount(text: string): number {
  const match = text.match(/^[^\d]*([\d,]+)(?:\.(\d{1,2}))?[^\d]*$/);
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

/** The ISO 4217 code of the symbol before or after an Amount. */
export function currencyOf(text: string): string {
  const code =
    CURRENCY_SYMBOLS[text.charAt(0)] ??
    CURRENCY_SYMBOLS[text.charAt(text.length - 1)];
  if (!code) throw new Discard('malformed');
  return code;
}

const LIMITS: Record<string, Stake['limit']> = {
  'no limit': 'no-limit',
  'pot limit': 'pot-limit',
  limit: 'fixed-limit',
  'fixed limit': 'fixed-limit',
};

/** A Stake from its limit as written ("No Limit") and its two blinds. */
export function stake(
  limit: string,
  smallBlind: string,
  bigBlind: string,
  currency?: string,
): Stake {
  const kind = LIMITS[limit.toLowerCase()];
  if (!kind) throw new Discard('malformed');
  return {
    limit: kind,
    smallBlind: amount(smallBlind),
    bigBlind: amount(bigBlind),
    currency: currency ?? currencyOf(bigBlind),
  };
}

/**
 * Why a header's game can't be read: a game with blinds that isn't cash
 * hold'em ("Omaha Pot Limit ($0.05/$0.1)", a tournament), or else garbage.
 */
export function unreadGame(game: string): Discard {
  return new Discard(
    /Tournament/i.test(game) || /^[\w' -]+ \(\S+\/\S+/.test(game)
      ? 'not-cash-holdem'
      : 'malformed',
  );
}

/** `2026/09/12 19:02:11`, read as UTC, in ISO 8601. */
export function utcTime(text: string): string {
  const match = text.match(
    /^(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (!match) throw new Discard('malformed');
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  ).toISOString();
}

/** The first line of a piece of text, where every format says what it is. */
export function firstLine(block: string): string {
  return block.split(/\r?\n/, 1)[0];
}

export function linesOf(block: string): string[] {
  return block.split(/\r?\n/).map((line) => line.trimEnd());
}

/** `Js 8s` → ["Js", "8s"], with tens written as "10". */
export function cards(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((card) => {
      if (!/^[2-9TJQKA][cdhs]$/.test(card)) throw new Discard('malformed');
      return card.replace(/^T/, '10');
    });
}

/**
 * The bets nobody matched, for layouts that don't print them. On each Street
 * whoever put in the most gets back what the next biggest bet didn't cover:
 * the others folded or were all-in for less.
 */
export function uncalledBets(
  hand: Pick<Hand, 'posts' | 'actions' | 'stake'>,
): Hand['returned'] {
  const bets = new Map<Street, Map<string, number>>();
  const betsOn = (street: Street) => {
    if (!bets.has(street)) bets.set(street, new Map());
    return bets.get(street)!;
  };
  const preflop = betsOn('preflop');
  for (const post of hand.posts) {
    // Antes and the dead part of a small-and-big post match nothing.
    const live =
      post.kind === 'ante'
        ? 0
        : post.kind === 'small-and-big-blinds'
          ? post.amount - hand.stake.smallBlind
          : post.amount;
    preflop.set(post.screenName, (preflop.get(post.screenName) ?? 0) + live);
  }
  for (const action of hand.actions) {
    const street = betsOn(action.street);
    const before = street.get(action.screenName) ?? 0;
    if (action.type === 'call' || action.type === 'bet') {
      street.set(action.screenName, before + action.amount);
    } else if (action.type === 'raise') {
      street.set(action.screenName, action.to);
    }
  }

  const returned: Hand['returned'] = [];
  for (const street of bets.values()) {
    const [top, next] = [...street].sort(([, a], [, b]) => b - a);
    if (!top) continue;
    const uncovered = top[1] - (next?.[1] ?? 0);
    if (uncovered > 0) returned.push({ screenName: top[0], amount: uncovered });
  }
  return returned;
}
