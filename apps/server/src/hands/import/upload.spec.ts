import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { readUpload, TextStreamDecoder, UnreadableUpload } from './upload.js';

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

  it('reads an .xml file, as the iPoker client saves its sessions', () => {
    const text = fixture('ipoker-session.xml');

    expect(readUpload('alcala.xml', Buffer.from(text, 'utf8'))).toBe(text);
  });

  it('reads a file saved in cp1252, as older iPoker clients write the €, though it declares utf-8', () => {
    const bytes = readFileSync(
      new URL('./fixtures/ipoker-cp1252.xml', import.meta.url),
    );

    const text = readUpload('malaga.xml', bytes);

    expect(text).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(text).toContain('<gametype>Holdem NL €0.05/€0.10</gametype>');
    expect(text).toContain('<tablename>Málaga, 913000301</tablename>');
  });

  it('keeps reading a UTF-8 file as UTF-8 past a stray byte that cannot be UTF-8, whole or in pieces', () => {
    const bytes = Buffer.concat([
      Buffer.from('€1 ', 'utf8'),
      Buffer.from([0xff]),
      Buffer.from(' €2 ', 'utf8'),
      // A character the file ends before completing.
      Buffer.from([0xe2, 0x82]),
    ]);
    const expected = '€1 � €2 �';

    expect(readUpload('session.txt', bytes)).toBe(expected);
    for (let size = 1; size <= bytes.length; size++) {
      const decoder = new TextStreamDecoder();
      let text = '';
      for (let start = 0; start < bytes.length; start += size) {
        text += decoder.decode(bytes.subarray(start, start + size));
      }
      expect(text + decoder.end()).toBe(expected);
    }
  });

  it('reads each file in a zip in its own encoding', () => {
    const zip = zipSync({
      'old.xml': Buffer.from([0x80, 0x31]),
      'new.xml': strToU8('€2'),
    });

    expect(readUpload('tables.zip', zip)).toBe('€1\n\n€2');
  });

  it('extracts the .xml files in a zip like its .txt files', () => {
    const zip = zipSync({
      'tables/alcala.xml': strToU8('first'),
      'tables/notes.pdf': strToU8('not a hand history'),
      '__MACOSX/tables/._alcala.xml': strToU8('resource fork'),
      'tables/stars.txt': strToU8('second'),
      'tables/vantaa.XML': strToU8('third'),
    });

    expect(readUpload('tables.zip', zip)).toBe('first\n\nsecond\n\nthird');
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
