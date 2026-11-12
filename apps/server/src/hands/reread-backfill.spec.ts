import { readFileSync } from 'node:fs';
import { keyOf } from './hand-store.js';
import { importHandHistory } from './import/import.js';
import { rereadColumns } from './reread-backfill.js';

const text = readFileSync(
  new URL('./import/fixtures/coinpoker-ante.txt', import.meta.url),
  'utf8',
);
const histories = importHandHistory(text).texts;
const [, , allIn] = importHandHistory(text).hands;
const allInText = histories[2]!;

describe('Reading a stored Hand again', () => {
  it('works out its columns from its Hand History as import does', () => {
    expect(rereadColumns(allInText, keyOf(allIn))).toMatchObject({
      content: allIn,
      heroResult: 3934,
      heroAllInEv: 2068,
      heroReachedShowdown: true,
      finalPot: 6716,
      rake: 200,
      heroRakeGenerated: 77,
    });
  });

  it('reads nothing from a text that is no longer that same Hand', () => {
    const [first] = importHandHistory(text).hands;

    expect(rereadColumns(allInText, keyOf(first))).toBeNull();
    expect(rereadColumns(text, keyOf(allIn))).toBeNull();
    expect(rereadColumns('not a Hand History', keyOf(allIn))).toBeNull();
  });
});
