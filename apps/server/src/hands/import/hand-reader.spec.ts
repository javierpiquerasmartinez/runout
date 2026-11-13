import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import {
  countHands,
  readHands,
  type HandRead,
  type SourceFile,
} from './hand-reader.js';
import { importHandHistory } from './import.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

/** A file whose bytes come in pieces of `size`, as a stream brings them. */
function file(name: string, bytes: Uint8Array, size = 1024): SourceFile {
  return {
    name,
    bytes: (async function* () {
      for (let start = 0; start < bytes.length; start += size) {
        yield bytes.subarray(start, start + size);
      }
    })(),
  };
}

function text(name: string, content: string, size?: number): SourceFile {
  return file(name, Buffer.from(content, 'utf8'), size);
}

async function all(files: SourceFile[]): Promise<HandRead[]> {
  const read: HandRead[] = [];
  for await (const item of readHands(files)) read.push(item);
  return read;
}

function siteHandIds(read: HandRead[]): string[] {
  return read.flatMap((item) =>
    item.kind === 'hand' ? [item.hand.siteHandId] : [],
  );
}

describe('Reading the Hands of stored files as a stream', () => {
  it('reads the same Hands, with the same texts, as reading the whole text at once', async () => {
    const content = fixture('pokerstars-session.txt');
    const whole = importHandHistory(content);

    const read = await all([text('session.txt', content)]);

    expect(siteHandIds(read)).toEqual(
      whole.hands.map((hand) => hand.siteHandId),
    );
    expect(
      read.flatMap((item) => (item.kind === 'hand' ? [item.text] : [])),
    ).toEqual(whole.texts);
  });

  it('reads a Hand split across a stream’s chunks, however small they are', async () => {
    const content = fixture('pokerstars-showdown.txt');
    const whole = importHandHistory(content);

    const read = await all([text('session.txt', content, 7)]);

    expect(siteHandIds(read)).toEqual(
      whole.hands.map((hand) => hand.siteHandId),
    );
  });

  it('keeps a character whose bytes are split across chunks', async () => {
    const content = fixture('winamax-session.txt');
    const whole = importHandHistory(content);

    const read = await all([text('session.txt', content, 3)]);

    expect(
      read.flatMap((item) => (item.kind === 'hand' ? [item.text] : [])),
    ).toEqual(whole.texts);
  });

  it('reads every .txt file in a zip, ignoring anything else', async () => {
    const zip = zipSync({
      'march/stars.txt': strToU8(fixture('pokerstars-session.txt')),
      'march/notes.pdf': strToU8('not a hand history'),
      '__MACOSX/march/._stars.txt': strToU8('resource fork'),
      'march/gg.TXT': strToU8(fixture('ggpoker-session.txt')),
    });
    const expected = [
      ...importHandHistory(fixture('pokerstars-session.txt')).hands,
      ...importHandHistory(fixture('ggpoker-session.txt')).hands,
    ].map((hand) => hand.siteHandId);

    const read = await all([file('march.zip', zip, 100)]);

    expect(siteHandIds(read)).toEqual(expected);
  });

  it('reads several files, text and zip, in order, each Hand in its own format', async () => {
    const zip = zipSync({
      'wina.txt': strToU8(fixture('winamax-session.txt')),
    });

    const read = await all([
      text('stars.txt', fixture('pokerstars-session.txt')),
      file('wina.zip', zip),
      text('coin.txt', fixture('coinpoker-session.txt')),
    ]);

    const sites = new Set(
      read.flatMap((item) => (item.kind === 'hand' ? [item.hand.site] : [])),
    );
    expect(sites).toEqual(new Set(['pokerstars', 'winamax', 'coinpoker']));
    expect(siteHandIds(read)).toEqual(
      [
        'pokerstars-session.txt',
        'winamax-session.txt',
        'coinpoker-session.txt',
      ].flatMap((name) =>
        importHandHistory(fixture(name)).hands.map((hand) => hand.siteHandId),
      ),
    );
  });

  it('reads a file written in UTF-16', async () => {
    const content = fixture('pokerstars-showdown.txt');
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(content, 'utf16le'),
    ]);

    const read = await all([file('session.txt', bytes, 5)]);

    expect(siteHandIds(read)).toEqual(
      importHandHistory(content).hands.map((hand) => hand.siteHandId),
    );
  });

  it('says why a Hand it recognised could not be read, and counts a run of other text once', async () => {
    const read = await all([
      text(
        'mixed.txt',
        `${fixture('ggpoker-discarded.txt')}\n\nnot a hand\n\nnor this\n\n${fixture('pokerstars-showdown.txt')}`,
      ),
    ]);
    const whole = importHandHistory(fixture('ggpoker-discarded.txt'));

    const discarded = read.filter((item) => item.kind === 'discarded');
    expect(
      discarded.map((item) => item.kind === 'discarded' && item.reason),
    ).toEqual(
      whole.discarded
        .filter((entry) => entry.reason !== 'unrecognised-format')
        .map((entry) => entry.reason),
    );
    expect(
      read.filter((item) => item.kind === 'unrecognised').length,
    ).toBeGreaterThanOrEqual(1);
    expect(read.at(-1)?.kind).toBe('hand');
  });

  it('holds no line longer than a Hand could have: a file without line breaks is no Hand', async () => {
    const endless = 'x'.repeat(5_000_000);

    const read = await all([
      text(
        'endless.txt',
        `${endless}\n\n${fixture('pokerstars-showdown.txt')}`,
        64 * 1024,
      ),
    ]);

    expect(read[0]).toEqual({ kind: 'unrecognised' });
    expect(siteHandIds(read)).toEqual(
      importHandHistory(fixture('pokerstars-showdown.txt')).hands.map(
        (hand) => hand.siteHandId,
      ),
    );
  });

  it('resumes after the Hands already gone through, reporting nothing before them', async () => {
    const content = `${fixture('ggpoker-discarded.txt')}\n\nnot a hand\n\n${fixture('pokerstars-session.txt')}`;
    const whole = (await all([text('mixed.txt', content)])).filter(
      (item) => item.kind !== 'unrecognised',
    );
    const after = 3;

    const resumed: HandRead[] = [];
    for await (const item of readHands([text('mixed.txt', content)], {
      after,
    })) {
      resumed.push(item);
    }

    expect(resumed.filter((item) => item.kind !== 'unrecognised')).toEqual(
      whole.slice(after),
    );
    expect(resumed[0]).toEqual(whole[after]);
  });

  it('refuses a file that is not a zip though named like one', async () => {
    await expect(
      all([text('broken.zip', 'PK\u0003\u0004 not really')]),
    ).rejects.toThrow();
  });
});

describe('Counting the Hands of stored files', () => {
  it('counts the Hands it recognises, and the runs of text that are none', async () => {
    const content = `${fixture('pokerstars-session.txt')}\n\nnot a hand`;

    const counted = await countHands([text('session.txt', content)], 1000);

    expect(counted).toEqual({
      hands:
        importHandHistory(content).hands.length +
        importHandHistory(content).discarded.filter(
          (d) => d.reason !== 'unrecognised-format',
        ).length,
      unrecognised: 1,
      overLimit: false,
    });
  });

  it('stops counting past the limit', async () => {
    const hand = fixture('pokerstars-showdown.txt');
    let pieces = 0;
    const many: SourceFile = {
      name: 'many.txt',
      bytes: (async function* () {
        // Far more Hands than the limit, of which only what is read is ever made.
        for (let index = 0; index < 1_000_000; index++) {
          pieces++;
          yield Buffer.from(`${hand}\n\n`);
        }
      })(),
    };

    const counted = await countHands([many], 5);

    expect(counted.overLimit).toBe(true);
    expect(counted.hands).toBe(6);
    expect(pieces).toBeLessThan(10);
  });
});
