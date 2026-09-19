import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { readUpload, UnreadableUpload } from './upload.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Reading an uploaded Hand History file', () => {
  it('reads a .txt file as UTF-8, without its byte order mark', () => {
    const text = fixture('pokerstars-showdown.txt');
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(text, 'utf8'),
    ]);

    expect(readUpload('session.txt', bytes)).toBe(text);
  });

  it('reads a file written in UTF-16, as some Poker Sites save them', () => {
    const text = fixture('pokerstars-showdown.txt');
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(text, 'utf16le'),
    ]);

    expect(readUpload('session.txt', bytes)).toBe(text);
  });

  it('extracts every .txt file in a zip, in order, and ignores anything else', () => {
    const zip = zipSync({
      'march/hh-1.txt': strToU8('first'),
      'march/notes.pdf': strToU8('not a hand history'),
      '__MACOSX/march/._hh-1.txt': strToU8('resource fork'),
      'march/hh-2.TXT': strToU8('second'),
    });

    expect(readUpload('march.zip', zip)).toBe('first\n\nsecond');
  });

  it('recognises a zip by its content, whatever its name', () => {
    const zip = zipSync({ 'hh.txt': strToU8('inside') });

    expect(readUpload('export', zip)).toBe('inside');
  });

  it('refuses a zip it cannot open', () => {
    const zip = zipSync({ 'hh.txt': strToU8('inside') }).slice(0, 20);

    expect(() => readUpload('broken.zip', zip)).toThrow(UnreadableUpload);
  });

  it('refuses a zip whose text would unpack past the size limit', () => {
    const zip = zipSync({ 'hh.txt': new Uint8Array(2048) }, { level: 9 });

    expect(() => readUpload('bomb.zip', zip, { maxTextBytes: 1024 })).toThrow(
      UnreadableUpload,
    );
  });
});
