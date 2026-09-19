import { unzipSync } from 'fflate';

/** A file that can't be turned into Hand History text at all. */
export class UnreadableUpload extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableUpload';
  }
}

/**
 * How much text one zip may unpack to. Hand Histories compress about ten to
 * one, so a 20 MB zip of them stays well under this.
 */
const MAX_TEXT_BYTES = 256 * 1024 * 1024;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * The Hand History text in an uploaded file: a .txt file as is, or every
 * .txt file inside a zip, in order, separated by a blank line. This happens
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

/** .txt files, leaving out the copies macOS adds to the zips it makes. */
function isHandHistoryEntry(path: string): boolean {
  return (
    /\.txt$/i.test(path) &&
    !path.startsWith('__MACOSX/') &&
    !/(^|\/)\._/.test(path)
  );
}

/** UTF-8 unless a byte order mark says UTF-16; the mark itself is dropped. */
function decode(bytes: Uint8Array): string {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : 'utf-8';
  return new TextDecoder(encoding).decode(bytes);
}
