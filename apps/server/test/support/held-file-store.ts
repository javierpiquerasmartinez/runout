import { MemoryFileStore } from './memory-file-store.js';

interface Hold {
  atByte: number;
  reached: () => void;
  released: Promise<void>;
}

/**
 * A file store whose reads can be held at a point of the file, as a slow
 * stream would be, so that a test can act while the import is under way.
 * Reads take the holds in turn; a read with none left goes straight through.
 */
export class HeldFileStore extends MemoryFileStore {
  /** Each read's holds, in the order of the file. */
  private readonly holds: Hold[][] = [];

  /** The next read not yet spoken for goes straight through. */
  letReadThrough(): void {
    this.holds.push([]);
  }

  /**
   * Holds the next read not yet spoken for before it brings byte `atByte`,
   * until `release`; `held` resolves once it is held there.
   */
  holdRead(atByte: number): { held: Promise<void>; release: () => void } {
    return this.holdReadAt(atByte)[0];
  }

  /**
   * Holds the next read not yet spoken for before each of these bytes, in
   * turn, each until its own `release`.
   */
  holdReadAt(
    ...atBytes: number[]
  ): { held: Promise<void>; release: () => void }[] {
    const holds = atBytes.map((atByte) => {
      let release!: () => void;
      let reached!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      const held = new Promise<void>((resolve) => (reached = resolve));
      return { hold: { atByte, reached, released }, held, release };
    });
    this.holds.push(holds.map(({ hold }) => hold));
    return holds.map(({ held, release }) => ({ held, release }));
  }

  override async *read(key: string): AsyncIterable<Uint8Array> {
    const holds = this.holds.shift() ?? [];
    let position = 0;
    for await (const chunk of super.read(key)) {
      // In small pieces, so that a hold lands close to where it is asked.
      for (let start = 0; start < chunk.length; start += 4096) {
        const piece = chunk.subarray(start, start + 4096);
        while (holds[0] && position + piece.length > holds[0].atByte) {
          const hold = holds.shift()!;
          hold.reached();
          await hold.released;
        }
        position += piece.length;
        yield piece;
      }
    }
  }
}

/** The byte at which the `hand`th Hand (from 0) of a PokerStars `text` starts. */
export function startOfHand(text: string, hand: number): number {
  let at = -1;
  for (let found = 0; found <= hand; found++) {
    at = text.indexOf('PokerStars Hand #', at + 1);
  }
  return Buffer.byteLength(text.slice(0, at));
}
