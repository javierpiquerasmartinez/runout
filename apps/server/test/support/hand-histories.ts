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

/** The same text, with each PokerStars hand ID replaced by a new one. */
export function withFreshHandIds(text: string): string {
  const renamed = new Map<string, string>();
  return text.replace(/(PokerStars Hand #)(\d+)/g, (_, prefix, id) => {
    if (!renamed.has(id)) {
      renamed.set(id, `${randomInt(1e9, 1e10)}${randomInt(1e3, 1e4)}`);
    }
    return `${prefix}${renamed.get(id)}`;
  });
}
