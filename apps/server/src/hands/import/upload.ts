import { unzipSync } from 'fflate';

/** A file that can't be turned into Hand History text at all. */
export class UnreadableUpload extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableUpload';
  }
}

/**
 * How much text one zip may unpack to. 2,000 Hands, the most one preview
 * reads, take a few MB of text; a zip that unpacks past this holds far more,
 * and unpacking it whole would take the server's memory.
 */
const MAX_TEXT_BYTES = 32 * 1024 * 1024;

export const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * The Hand History text in an uploaded file: a .txt or .xml file as is, or
 * every such file inside a zip, in order, separated by a blank line. This happens
 * before the import module, which only ever sees text.
 */
export function readUpload(
  name: string,
  bytes: Uint8Array,
  { maxTextBytes = MAX_TEXT_BYTES } = {},
): string {
  const isZip =
    ZIP_MAGIC.every((byte, index) => bytes[index] === byte) ||
    /\.zip$/i.test(name);
  if (!isZip) return decode(bytes);

  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (!isHandHistoryEntry(file.name)) return false;
        total += file.originalSize;
        if (total > maxTextBytes) throw new UnreadableUpload('too-large');
        return true;
      },
    });
  } catch (error) {
    if (error instanceof UnreadableUpload) throw error;
    throw new UnreadableUpload('not-a-zip');
  }
  const texts = Object.values(files);
  // The sizes a zip declares can lie; the unpacked text can't.
  if (texts.reduce((sum, file) => sum + file.length, 0) > maxTextBytes) {
    throw new UnreadableUpload('too-large');
  }
  return texts.map(decode).join('\n\n');
}

/**
 * .txt files, and the .xml files the iPoker client saves, leaving out the
 * copies macOS adds to the zips it makes.
 */
export function isHandHistoryEntry(path: string): boolean {
  return (
    /\.(txt|xml)$/i.test(path) &&
    !path.startsWith('__MACOSX/') &&
    !/(^|\/)\._/.test(path)
  );
}

function decode(bytes: Uint8Array): string {
  const decoder = new TextStreamDecoder();
  return decoder.decode(bytes) + decoder.end();
}

/**
 * Decodes a file's text, whole or arriving in pieces, the same way either
 * way: UTF-8 unless a byte order mark says UTF-16, the mark itself dropped.
 * Older iPoker clients save their files in cp1252 (the € as the byte 0x80),
 * whatever their XML declaration says, so from the first byte that can't be
 * UTF-8 on, the rest is read as cp1252, as long as everything before it is
 * ASCII, which reads the same in both, as it is in such a file. After a
 * character only UTF-8 writes, the file is UTF-8, and a stray byte that
 * can't be is just unreadable (U+FFFD).
 */
export class TextStreamDecoder {
  private encoding: 'utf-16le' | 'utf-16be' | 'utf-8' | 'cp1252' | null = null;
  /** Set once the encoding is settled for the rest of the file. */
  private decoder: TextDecoder | null = null;
  /** Whether a character only UTF-8 writes (or its byte order mark) has been read. */
  private utf8Only = false;
  /** Bytes not decoded yet: the file's first one, or a character cut across pieces. */
  private held: Uint8Array = new Uint8Array(0);

  decode(chunk: Uint8Array): string {
    return this.read(chunk, false);
  }

  end(): string {
    if (!this.encoding) {
      // Too short to hold a byte order mark.
      if (this.held.length === 0) return '';
      return this.read(new Uint8Array(0), true) + this.end();
    }
    if (this.decoder) return this.decoder.decode();
    const held = this.held;
    this.held = new Uint8Array(0);
    // A character the text ends before completing can't be UTF-8.
    return held.length === 0 ? '' : this.settle(held) + this.decoder!.decode();
  }

  private read(chunk: Uint8Array, ending: boolean): string {
    let bytes = concat(this.held, chunk);
    this.held = new Uint8Array(0);
    if (!this.encoding) {
      // Three bytes tell a byte order mark from none.
      if (bytes.length < 3 && !ending) {
        this.held = bytes;
        return '';
      }
      if (bytes[0] === 0xff && bytes[1] === 0xfe) this.encoding = 'utf-16le';
      else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        this.encoding = 'utf-16be';
      } else {
        this.encoding = 'utf-8';
        if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
          bytes = bytes.subarray(3);
          this.utf8Only = true;
        }
      }
      if (this.encoding !== 'utf-8') {
        this.decoder = new TextDecoder(this.encoding);
      }
    }
    if (this.decoder) return this.decoder.decode(bytes, { stream: true });
    const { valid, invalid } = utf8Prefix(bytes);
    const read = bytes.subarray(0, valid);
    if (read.some((byte) => byte >= 0x80)) this.utf8Only = true;
    const text = UTF8.decode(read);
    if (invalid) return text + this.settle(bytes.subarray(valid));
    // What is left is the start of a character the next piece completes.
    this.held = bytes.slice(valid);
    return text;
  }

  /** Settles the encoding at the first byte that can't be UTF-8, and reads on from it. */
  private settle(bytes: Uint8Array): string {
    if (this.utf8Only) {
      this.decoder = new TextDecoder('utf-8', { ignoreBOM: true });
    } else {
      this.encoding = 'cp1252';
      this.decoder = new TextDecoder('windows-1252');
    }
    return this.decoder.decode(bytes, { stream: true });
  }
}

const UTF8 = new TextDecoder('utf-8', { ignoreBOM: true });

/**
 * How many of the bytes are whole UTF-8 characters, and whether the ones
 * after them can't be UTF-8 (rather than a character cut short at the end).
 */
function utf8Prefix(bytes: Uint8Array): { valid: number; invalid: boolean } {
  let at = 0;
  while (at < bytes.length) {
    const lead = bytes[at];
    if (lead < 0x80) {
      at++;
      continue;
    }
    const length = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : 2;
    // The range the byte after the lead may take, ruling out overlong
    // forms, surrogates and anything past U+10FFFF.
    const [low, high] =
      lead === 0xe0
        ? [0xa0, 0xbf]
        : lead === 0xed
          ? [0x80, 0x9f]
          : lead === 0xf0
            ? [0x90, 0xbf]
            : lead === 0xf4
              ? [0x80, 0x8f]
              : [0x80, 0xbf];
    if (lead < 0xc2 || lead > 0xf4) return { valid: at, invalid: true };
    for (let next = 1; next < length; next++) {
      if (at + next >= bytes.length) return { valid: at, invalid: false };
      const byte = bytes[at + next];
      const [min, max] = next === 1 ? [low, high] : [0x80, 0xbf];
      if (byte < min || byte > max) return { valid: at, invalid: true };
    }
    at += length;
  }
  return { valid: at, invalid: false };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  const joined = new Uint8Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
}
