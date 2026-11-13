import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

/** A fixture Hand History exactly as it is in the corpus. */
export function fixture(name: string): string {
  return readFileSync(
    new URL(`../../src/hands/import/fixtures/${name}`, import.meta.url),
    'utf8',
  );
}

/**
 * A fixture Hand History whose Hands get hand IDs no other call returns.
 * Every e2e test shares one database, where the same Hand is only ever
 * imported once, so a test that imports a fixture needs Hands of its own.
 */
export function freshHandHistory(name: string): string {
  return withFreshHandIds(fixture(name));
}

/** The same text, with each PokerStars or CoinPoker hand ID replaced by a new one. */
export function withFreshHandIds(text: string): string {
  const renamed = new Map<string, string>();
  return text.replace(
    /((?:PokerStars|CoinPoker) Hand #)(\d+)/g,
    (_, prefix, id) => {
      if (!renamed.has(id)) {
        renamed.set(id, `${randomInt(1e9, 1e10)}${randomInt(1e3, 1e4)}`);
      }
      return `${prefix}${renamed.get(id)}`;
    },
  );
}

/** The Hand History of one Hand of a fixture, by its hand ID. */
export function oneHand(name: string, siteHandId: string): string {
  const hand = fixture(name)
    .split(
      /(?=^(?:Poker Hand #|Winamax Poker|CoinPoker Hand #|PokerStars Hand #))/m,
    )
    .find((text) => text.includes(siteHandId));
  if (!hand) throw new Error(`No Hand ${siteHandId} in ${name}`);
  return hand;
}

/**
 * `count` Hands of PokerStars, none of them imported before: the Hands of a
 * PokerStars fixture, over and over, each time with hand IDs of their own.
 */
export function manyHands(
  count: number,
  name: string = 'pokerstars-session.txt',
): string {
  const hands: string[] = [];
  while (hands.length < count) {
    hands.push(
      ...freshHandHistory(name)
        .split(/(?=^PokerStars Hand #)/m)
        .filter((hand) => hand.startsWith('PokerStars Hand #'))
        .map((hand) => `${hand.trim()}\n\n\n`),
    );
  }
  return hands.slice(0, count).join('');
}
