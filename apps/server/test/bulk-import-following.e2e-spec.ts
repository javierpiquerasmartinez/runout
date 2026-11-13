import request from 'supertest';
import { HeldFileStore, startOfHand } from './support/held-file-store.js';
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
    const done = await one.upload('done.txt', manyHands(2));
    await service!.settled();
    const started = await one
      .start([{ name: 'export.txt', size: 1000 }])
      .expect(201);

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
