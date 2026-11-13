import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import type { Hand } from '../hand.js';
import { Discard, type DiscardReason } from './discard.js';
import { parseBlock, recogniseBlock } from './import.js';
import { isHandHistoryEntry, UnreadableUpload, ZIP_MAGIC } from './upload.js';

/*
 * Stored files read as a stream of Hands, however large: a .txt file, or
 * every .txt file in a zip, decoded and split into Hands as the bytes come,
 * the same way, format by format, as reading the whole text at once. Nothing
 * proportional to a file's size is held: a line or a Hand longer than any
 * Hand could be is dropped as text that is no Hand.
 */

/** A file as it streams in. */
export interface SourceFile {
  name: string;
  bytes: AsyncIterable<Uint8Array>;
}

/** What one piece of the files turned out to be. */
export type HandRead =
  | { kind: 'hand'; hand: Hand; text: string }
  /** A Hand its format recognised and could not read. */
  | { kind: 'discarded'; reason: DiscardReason }
  /** A run of text no format recognised, however long. */
  | { kind: 'unrecognised' };

/** Longer than any Hand: the longest real ones are a few thousand characters. */
const MAX_BLOCK_CHARS = 256 * 1024;

/** How much compressed input a zip is given at a time, which bounds what one step unpacks. */
const ZIP_PIECE_BYTES = 16 * 1024;

/** The texts of the files, as they decode: a text's pieces, then its end. */
type TextPiece = { text: string } | { end: true };

/**
 * Every Hand in the files, in order, read as the bytes come. Given `after`,
 * it resumes past that many Hands, read or not, as a cursor counts them:
 * those it only recognises, as `countHands` does, and reports nothing
 * before them.
 */
export async function* readHands(
  files: Iterable<SourceFile>,
  { after = 0 }: { after?: number } = {},
): AsyncGenerator<HandRead> {
  let skipped = 0;
  let inUnrecognised = false;
  for await (const block of blocksOf(files)) {
    const format = recogniseBlock(block);
    if (skipped < after) {
      if (format) skipped++;
      continue;
    }
    if (!format) {
      if (!inUnrecognised) yield { kind: 'unrecognised' };
      inUnrecognised = true;
      continue;
    }
    inUnrecognised = false;
    try {
      yield { kind: 'hand', hand: parseBlock(block, format), text: block };
    } catch (error) {
      if (!(error instanceof Discard)) throw error;
      yield { kind: 'discarded', reason: error.reason };
    }
  }
}

/**
 * How many Hands the files hold, read or not, and how many runs of text are
 * none; it stops reading once past `limit`.
 */
export async function countHands(
  files: Iterable<SourceFile>,
  limit: number,
): Promise<{ hands: number; unrecognised: number; overLimit: boolean }> {
  let hands = 0;
  let unrecognised = 0;
  let inUnrecognised = false;
  for await (const block of blocksOf(files)) {
    if (!recogniseBlock(block)) {
      if (!inUnrecognised) unrecognised++;
      inUnrecognised = true;
      continue;
    }
    inUnrecognised = false;
    hands++;
    if (hands > limit) return { hands, unrecognised, overLimit: true };
  }
  return { hands, unrecognised, overLimit: false };
}

/**
 * Each run of non-blank lines in the files' texts, trimmed: one Hand, or a
 * piece of text that is none. Hands are separated by blank lines and have
 * none inside. One too long to be a Hand comes as the empty string.
 */
async function* blocksOf(files: Iterable<SourceFile>): AsyncGenerator<string> {
  let lines: string[] = [];
  let size = 0;
  let tooLong = false;
  let partial = '';
  /** Dropping a line already too long, until its end. */
  let droppingLine = false;

  function* endBlock(): Generator<string> {
    if (tooLong) yield '';
    else if (lines.length > 0) yield lines.join('\n').trim();
    lines = [];
    size = 0;
    tooLong = false;
  }
  function* endLine(line: string): Generator<string> {
    if (/^[ \t\r]*$/.test(line)) {
      yield* endBlock();
      return;
    }
    if (tooLong) return;
    size += line.length + 1;
    if (size > MAX_BLOCK_CHARS) {
      tooLong = true;
      lines = [];
    } else {
      lines.push(line);
    }
  }

  for (const file of files) {
    for await (const piece of textsOf(file)) {
      if ('end' in piece) {
        if (!droppingLine) yield* endLine(partial);
        partial = '';
        droppingLine = false;
        yield* endBlock();
        continue;
      }
      let from = 0;
      for (;;) {
        const newline = piece.text.indexOf('\n', from);
        if (newline === -1) break;
        const rest = piece.text.slice(from, newline);
        if (!droppingLine) yield* endLine(partial + rest);
        partial = '';
        droppingLine = false;
        from = newline + 1;
      }
      if (droppingLine) continue;
      partial += piece.text.slice(from);
      if (partial.length > MAX_BLOCK_CHARS) {
        // A line this long belongs to no Hand: drop it, and its block.
        partial = '';
        droppingLine = true;
        tooLong = true;
        lines = [];
      }
    }
  }
}

/** The texts of one file: itself, or each .txt file in it when it is a zip. */
async function* textsOf(file: SourceFile): AsyncGenerator<TextPiece> {
  const iterator = file.bytes[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) return;
  const bytes = (async function* () {
    yield first.value;
    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      yield next.value;
    }
  })();
  const isZip =
    ZIP_MAGIC.every((byte, index) => first.value[index] === byte) ||
    /\.zip$/i.test(file.name);
  yield* isZip ? zipTexts(bytes) : decoded(bytes);
}

/** A text's bytes, decoded as they come: UTF-8 unless a byte order mark says UTF-16. */
async function* decoded(
  bytes: AsyncIterable<Uint8Array>,
): AsyncGenerator<TextPiece> {
  const decoder = new TextStreamDecoder();
  for await (const chunk of bytes) {
    const text = decoder.decode(chunk);
    if (text) yield { text };
  }
  const text = decoder.end();
  if (text) yield { text };
  yield { end: true };
}

/** Each .txt file in a zip, decoded as it unpacks, entry after entry. */
async function* zipTexts(
  bytes: AsyncIterable<Uint8Array>,
): AsyncGenerator<TextPiece> {
  const out: TextPiece[] = [];
  let failure: unknown = null;
  let entries = 0;
  const unzip = new Unzip((entry) => {
    entries++;
    if (!isHandHistoryEntry(entry.name)) return;
    const decoder = new TextStreamDecoder();
    entry.ondata = (error, data, final) => {
      if (error) {
        failure = error;
        return;
      }
      const text = decoder.decode(data);
      if (text) out.push({ text });
      if (final) {
        const rest = decoder.end();
        if (rest) out.push({ text: rest });
        out.push({ end: true });
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  const push = (piece: Uint8Array, final: boolean) => {
    try {
      unzip.push(piece, final);
    } catch {
      throw new UnreadableUpload('not-a-zip');
    }
    if (failure) throw new UnreadableUpload('not-a-zip');
  };
  for await (const chunk of bytes) {
    for (let start = 0; start < chunk.length; start += ZIP_PIECE_BYTES) {
      push(chunk.subarray(start, start + ZIP_PIECE_BYTES), false);
      yield* out.splice(0);
    }
  }
  push(new Uint8Array(0), true);
  yield* out.splice(0);
  // Streaming passes over bytes that are no zip without a word.
  if (entries === 0) throw new UnreadableUpload('not-a-zip');
}

/** Decodes a text arriving in pieces, deciding its encoding from its first two bytes. */
class TextStreamDecoder {
  private decoder: TextDecoder | null = null;
  private start: Uint8Array = new Uint8Array(0);

  decode(chunk: Uint8Array): string {
    if (!this.decoder) {
      this.start = concat(this.start, chunk);
      if (this.start.length < 2) return '';
      this.decoder = new TextDecoder(encodingOf(this.start));
      return this.decoder.decode(this.start, { stream: true });
    }
    return this.decoder.decode(chunk, { stream: true });
  }

  end(): string {
    if (!this.decoder) {
      if (this.start.length === 0) return '';
      return new TextDecoder('utf-8').decode(this.start);
    }
    return this.decoder.decode();
  }
}

function encodingOf(start: Uint8Array): string {
  if (start[0] === 0xff && start[1] === 0xfe) return 'utf-16le';
  if (start[0] === 0xfe && start[1] === 0xff) return 'utf-16be';
  return 'utf-8';
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const joined = new Uint8Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
}
