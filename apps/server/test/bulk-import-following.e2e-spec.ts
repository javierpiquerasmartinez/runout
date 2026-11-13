import request from 'supertest';
import { MemoryFileStore } from './support/memory-file-store.js';
import { startApp, type RunningApp } from './support/app.js';
import { freshDatabase } from './support/fresh-database.js';
import { newAccount } from './support/google.js';
import { manyHands } from './support/hand-histories.js';
import {
  startImportService,
  type RunningImportService,
} from './support/import-service.js';
import { TestClock } from './support/test-clock.js';

const SECRET = 'a-shared-secret-for-tests';
const DAY = 24 * 60 * 60 * 1000;

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
class HeldFileStore extends MemoryFileStore {
  private readonly holds: (Hold | null)[] = [];

  /** The next read not yet spoken for goes straight through. */
  letReadThrough(): void {
    this.holds.push(null);
  }

  /**
   * Holds the next read not yet spoken for before it brings byte `atByte`,
   * until `release`; `held` resolves once it is held there.
   */
  holdRead(atByte: number): { held: Promise<void>; release: () => void } {
    let release!: () => void;
    let reached!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const held = new Promise<void>((resolve) => (reached = resolve));
    this.holds.push({ atByte, reached, released });
    return { held, release };
  }

  override async *read(key: string): AsyncIterable<Uint8Array> {
    const hold = this.holds.shift() ?? null;
    let position = 0;
    for await (const chunk of super.read(key)) {
      // In small pieces, so that a hold lands close to where it is asked.
      for (let start = 0; start < chunk.length; start += 4096) {
        const piece = chunk.subarray(start, start + 4096);
        if (hold && position + piece.length > hold.atByte) {
          hold.reached();
          await hold.released;
        }
        position += piece.length;
        yield piece;
      }
    }
  }
}

describe('Following and cancelling a Bulk Import (e2e)', () => {
  let store: HeldFileStore;
  let clock: TestClock;
  let service: RunningImportService | undefined;
  let api: RunningApp;
  let database: { url: string; drop(): Promise<void> };

  /** The API and the import service, on a database of their own and one clock. */
  async function start() {
    database = await freshDatabase();
    store = new HeldFileStore();
    clock = new TestClock();
    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
      clock,
    });
    api = await startApp({
      databaseUrl: database.url,
      importService: { address: service.address, secret: SECRET },
      fileStore: store,
      clock,
    });
  }

  afterEach(async () => {
    await api?.close();
    await service?.close();
    await database?.drop();
  });

  function asAccount(token: string) {
    const http = request(api.httpServer);
    return {
      start: (files: { name: string; size: number }[]) =>
        http
          .post('/api/library/bulk-imports')
          .set('Authorization', `Bearer ${token}`)
          .send({ files }),
      list: () =>
        http
          .get('/api/library/bulk-imports')
          .set('Authorization', `Bearer ${token}`),
      cancel: (id: string) =>
        http
          .post(`/api/library/bulk-imports/${id}/cancel`)
          .set('Authorization', `Bearer ${token}`),
      libraryTotal: async () =>
        (
          await http
            .get('/api/library/hands')
            .set('Authorization', `Bearer ${token}`)
            .expect(200)
        ).body.total as number,
      /** Starts a Bulk Import of one text file and uploads it as the browser would. */
      upload: async (name: string, text: string): Promise<string> => {
        const bytes = Buffer.from(text);
        const started = await http
          .post('/api/library/bulk-imports')
          .set('Authorization', `Bearer ${token}`)
          .send({ files: [{ name, size: bytes.length }] })
          .expect(201);
        const id = started.body.id as string;
        const urls = await http
          .post(`/api/library/bulk-imports/${id}/files/0/parts`)
          .set('Authorization', `Bearer ${token}`)
          .send({ parts: [1] })
          .expect(201);
        const [{ partNumber, url }] = urls.body.parts as {
          partNumber: number;
          url: string;
        }[];
        await http
          .post(`/api/library/bulk-imports/${id}/complete`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            files: [
              { parts: [{ partNumber, etag: store.receive(url, bytes) }] },
            ],
          })
          .expect(201);
        return id;
      },
    };
  }

  /** The byte at which the `hand`th Hand (from 0) of `text` starts. */
  function startOfHand(text: string, hand: number): number {
    let at = -1;
    for (let found = 0; found <= hand; found++) {
      at = text.indexOf('PokerStars Hand #', at + 1);
    }
    return Buffer.byteLength(text.slice(0, at));
  }

  it('lists an import for 30 days after it ended, and not after', async () => {
    await start();
    const account = asAccount((await newAccount(api.httpServer)).token);
    await account.upload('export.txt', manyHands(3));
    await service!.settled();

    await clock.advance(30 * DAY - 1000);
    expect((await account.list().expect(200)).body).toHaveLength(1);

    await clock.advance(2000);
    expect((await account.list().expect(200)).body).toEqual([]);
  });

  it('stops a cancelled import before its next batch, keeping the Hands already imported', async () => {
    await start();
    const account = asAccount((await newAccount(api.httpServer)).token);
    const text = manyHands(1500);
    // The first read counts; the second adds the Hands, and is held in its second batch.
    store.letReadThrough();
    const adding = store.holdRead(startOfHand(text, 1200));
    const id = await account.upload('export.txt', text);
    await adding.held;
    await expect
      .poll(async () => (await account.list().expect(200)).body[0].processed)
      .toBe(1000);

    const cancelled = await account.cancel(id).expect(201);
    adding.release();
    await service!.settled();

    expect(cancelled.body).toMatchObject({ id, status: 'cancelled' });
    expect(await account.libraryTotal()).toBe(1000);
    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({
      status: 'cancelled',
      processed: 1000,
      imported: 1000,
      finishedAt: clock.now().toISOString(),
    });
    expect(store.files()).toEqual([]);
  });

  it('adds nothing of an import cancelled while its files are counted', async () => {
    await start();
    const account = asAccount((await newAccount(api.httpServer)).token);
    const text = manyHands(50);
    const counting = store.holdRead(startOfHand(text, 25));
    const id = await account.upload('export.txt', text);
    await counting.held;

    await account.cancel(id).expect(201);
    counting.release();
    await service!.settled();

    expect(await account.libraryTotal()).toBe(0);
    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({ status: 'cancelled', imported: 0 });
  });

  it('cancels an import still waiting for the service, which then adds nothing', async () => {
    await start();
    const account = asAccount((await newAccount(api.httpServer)).token);
    await service!.close();
    const id = await account.upload('export.txt', manyHands(4));

    await account.cancel(id).expect(201);
    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
      clock,
    });
    await service.settled();

    expect(await account.libraryTotal()).toBe(0);
    expect(store.files()).toEqual([]);
  });

  it('refuses to cancel an import that has ended, or another Account’s', async () => {
    await start();
    const one = asAccount((await newAccount(api.httpServer)).token);
    const other = asAccount((await newAccount(api.httpServer)).token);
    const started = await one
      .start([{ name: 'export.txt', size: 1000 }])
      .expect(201);
    const done = await one.upload('done.txt', manyHands(2));
    await service!.settled();

    await other.cancel(started.body.id).expect(404);
    await one.cancel(done).expect(404);
    await one.cancel('not-an-id').expect(404);
    const listed = (await one.list().expect(200)).body as {
      id: string;
      status: string;
    }[];
    expect(listed.find(({ id }) => id === started.body.id)?.status).toBe(
      'uploading',
    );
    expect(listed.find(({ id }) => id === done)?.status).toBe('completed');
  });

  it('cancels an import still uploading', async () => {
    await start();
    const account = asAccount((await newAccount(api.httpServer)).token);
    const started = await account
      .start([{ name: 'export.txt', size: 1000 }])
      .expect(201);

    await account.cancel(started.body.id).expect(201);

    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({ status: 'cancelled' });
  });
});
