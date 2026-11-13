import { createHash, randomUUID } from 'node:crypto';
import {
  UnknownPart,
  type FileStore,
  type UploadedPart,
} from '../../src/file-store/file-store.js';

/** Something a read meets once past a point of the file. */
type Fault = { afterBytes: number; skip: number } & (
  { kind: 'fail'; error: Error } | { kind: 'hold'; released: Promise<void> }
);

interface Upload {
  key: string;
  parts: Map<number, { etag: string; bytes: Uint8Array }>;
}

/**
 * A file store held in memory, for tests. Its part URLs aren't fetched:
 * `receive` takes a part's bytes as the browser's PUT would.
 */
export class MemoryFileStore implements FileStore {
  private readonly uploads = new Map<string, Upload>();
  private readonly stored = new Map<string, Uint8Array>();

  startUpload(key: string): Promise<string> {
    const uploadId = randomUUID();
    this.uploads.set(uploadId, { key, parts: new Map() });
    return Promise.resolve(uploadId);
  }

  partUrls(
    key: string,
    uploadId: string,
    partNumbers: number[],
  ): Promise<{ partNumber: number; url: string }[]> {
    return Promise.resolve(
      partNumbers.map((partNumber) => ({
        partNumber,
        url: `memory://${encodeURIComponent(key)}?uploadId=${uploadId}&partNumber=${partNumber}`,
      })),
    );
  }

  /** Takes the bytes PUT to a part URL, and answers with the part's ETag. */
  receive(url: string, bytes: Uint8Array): string {
    const parsed = new URL(url);
    const upload = this.uploads.get(parsed.searchParams.get('uploadId')!);
    if (!upload) throw new Error(`No upload for ${url}`);
    const etag = `"${createHash('md5').update(bytes).digest('hex')}"`;
    upload.parts.set(Number(parsed.searchParams.get('partNumber')), {
      etag,
      bytes,
    });
    return etag;
  }

  uploadedParts(_key: string, uploadId: string): Promise<UploadedPart[]> {
    const upload = this.uploads.get(uploadId);
    return Promise.resolve(
      [...(upload?.parts ?? new Map()).entries()]
        .map(([partNumber, { etag }]) => ({ partNumber, etag }))
        .sort((a, b) => a.partNumber - b.partNumber),
    );
  }

  completeUpload(
    key: string,
    uploadId: string,
    parts: UploadedPart[],
  ): Promise<void> {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) {
      return Promise.reject(new UnknownPart(`No upload ${uploadId}`));
    }
    const chunks: Uint8Array[] = [];
    for (const { partNumber, etag } of parts) {
      const part = upload.parts.get(partNumber);
      if (!part || part.etag !== etag) {
        return Promise.reject(new UnknownPart(`No part ${partNumber}`));
      }
      chunks.push(part.bytes);
    }
    this.uploads.delete(uploadId);
    this.stored.set(key, Buffer.concat(chunks));
    return Promise.resolve();
  }

  async *read(key: string): AsyncIterable<Uint8Array> {
    const bytes = this.stored.get(key);
    if (!bytes) throw new Error(`No file at ${key}`);
    const next = this.faults[0];
    const fault = next?.skip === 0 ? this.faults.shift() : undefined;
    if (next && !fault) next.skip--;
    // In pieces, as a stream would bring them.
    for (let start = 0; start < bytes.length; start += 64 * 1024) {
      if (fault && start >= fault.afterBytes) {
        if (fault.kind === 'fail') throw fault.error;
        await fault.released;
      }
      yield bytes.subarray(start, start + 64 * 1024);
    }
  }

  /** What the reads to come will meet, in order: a read meets the first whose `skip` is used up. */
  private readonly faults: Fault[] = [];

  /**
   * The next `times` reads after the first `skip` fail once past
   * `afterBytes`, as a connection to storage dropped mid-file would.
   */
  failReads(options: {
    afterBytes: number;
    times: number;
    skip?: number;
  }): void {
    const error = Object.assign(new Error('Connection reset by storage'), {
      code: 'ECONNRESET',
    });
    for (let time = 0; time < options.times; time++) {
      this.faults.push({
        kind: 'fail',
        afterBytes: options.afterBytes,
        skip: time === 0 ? (options.skip ?? 0) : 0,
        error,
      });
    }
  }

  /**
   * The next read after the first `skip` stops past `afterBytes` until the
   * returned function is called.
   */
  pauseRead(options: { afterBytes: number; skip?: number }): () => void {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    this.faults.push({
      kind: 'hold',
      afterBytes: options.afterBytes,
      skip: options.skip ?? 0,
      released,
    });
    return release;
  }

  delete(key: string, uploadId?: string): Promise<void> {
    this.stored.delete(key);
    if (uploadId) this.uploads.delete(uploadId);
    return Promise.resolve();
  }

  /** The keys of the files it holds, uploads not completed left out. */
  files(): string[] {
    return [...this.stored.keys()];
  }
}
