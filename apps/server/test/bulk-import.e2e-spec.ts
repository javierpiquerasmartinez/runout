import pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import { MemoryFileStore } from './support/memory-file-store.js';
import { startApp, type RunningApp } from './support/app.js';
import { freshDatabase } from './support/fresh-database.js';
import { newAccount } from './support/google.js';
import { freshHandHistory, manyHands } from './support/hand-histories.js';
import {
  startImportService,
  type RunningImportService,
} from './support/import-service.js';

const SECRET = 'a-shared-secret-for-tests';

describe('A Bulk Import (e2e)', () => {
  let store: MemoryFileStore;
  let service: RunningImportService | undefined;
  let api: RunningApp;
  let database: { url: string; drop(): Promise<void> };

  /**
   * The API and the import service, on a database of their own: an import
   * service takes any waiting import it finds, other files' included.
   */
  async function start() {
    database = await freshDatabase();
    store = new MemoryFileStore();
    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
    });
    api = await startApp({
      databaseUrl: database.url,
      importService: { address: service.address, secret: SECRET },
      fileStore: store,
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
      partUrls: (id: string, file: number, parts: number[]) =>
        http
          .post(`/api/library/bulk-imports/${id}/files/${file}/parts`)
          .set('Authorization', `Bearer ${token}`)
          .send({ parts }),
      complete: (
        id: string,
        files: { parts: { partNumber: number; etag: string }[] }[],
      ) =>
        http
          .post(`/api/library/bulk-imports/${id}/complete`)
          .set('Authorization', `Bearer ${token}`)
          .send({ files }),
      list: () =>
        http
          .get('/api/library/bulk-imports')
          .set('Authorization', `Bearer ${token}`),
      libraryTotal: async () =>
        (
          await http
            .get('/api/library/hands')
            .set('Authorization', `Bearer ${token}`)
            .expect(200)
        ).body.total as number,
      stats: async () =>
        (
          await http
            .get('/api/library/stats')
            .set('Authorization', `Bearer ${token}`)
            .expect(200)
        ).body as { hands: number },
      importSmall: async (text: string) => {
        const read = await http
          .post('/api/library/imports/previews')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', Buffer.from(text), 'session.txt')
          .expect(201);
        await http
          .post('/api/library/imports')
          .set('Authorization', `Bearer ${token}`)
          .send({ previews: [read.body.id] })
          .expect(201);
      },
    };
  }

  /** Starts a Bulk Import of one file and uploads it as the browser would. */
  async function upload(
    account: ReturnType<typeof asAccount>,
    name: string,
    text: string,
  ): Promise<string> {
    const bytes = Buffer.from(text);
    const started = await account
      .start([{ name, size: bytes.length }])
      .expect(201);
    const id = started.body.id as string;
    const urls = await account.partUrls(id, 0, [1]).expect(201);
    const [{ partNumber, url }] = urls.body.parts as {
      partNumber: number;
      url: string;
    }[];
    const etag = store.receive(url, bytes);
    await account.complete(id, [{ parts: [{ partNumber, etag }] }]).expect(201);
    return id;
  }

  it('adds every Hand of an uploaded file to the Library, with its Hero Stats', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);

    const id = await upload(account, 'export.txt', manyHands(1500));
    await service!.settled();

    expect(await account.libraryTotal()).toBe(1500);
    expect((await account.stats()).hands).toBe(1500);
    const listed = await account.list().expect(200);
    expect(listed.body).toEqual([
      expect.objectContaining({
        id,
        status: 'completed',
        files: [{ name: 'export.txt', size: expect.any(Number) }],
        total: 1500,
        processed: 1500,
        imported: 1500,
        duplicates: 0,
      }),
    ]);
  });

  it('counts the Hands already in the Library as duplicates and adds them once', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);
    const session = freshHandHistory('pokerstars-session.txt');
    await account.importSmall(session);
    const before = await account.libraryTotal();

    await upload(account, 'export.txt', `${session}\n\n${manyHands(10)}`);
    await service!.settled();

    expect(await account.libraryTotal()).toBe(before + 10);
    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({
      status: 'completed',
      imported: 10,
      duplicates: before,
    });
  });

  it('is uploading until the upload is complete, and adds nothing before', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);

    const started = await account
      .start([{ name: 'export.txt', size: 1000 }])
      .expect(201);
    await service!.settled();

    expect((await account.list().expect(200)).body).toEqual([
      expect.objectContaining({ id: started.body.id, status: 'uploading' }),
    ]);
    expect(await account.libraryTotal()).toBe(0);
  });

  it('deletes the file from storage once the import completes', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);

    await upload(asAccount(token), 'export.txt', manyHands(5));
    await service!.settled();

    expect(store.files()).toEqual([]);
  });

  it('lists only the Account’s own imports', async () => {
    await start();
    const one = asAccount((await newAccount(api.httpServer)).token);
    const other = asAccount((await newAccount(api.httpServer)).token);

    await upload(one, 'export.txt', manyHands(3));
    await service!.settled();

    expect((await other.list().expect(200)).body).toEqual([]);
  });

  it('is refused without signing in', async () => {
    await start();

    await request(api.httpServer)
      .post('/api/library/bulk-imports')
      .send({ files: [{ name: 'export.txt', size: 10 }] })
      .expect(401);
  });

  it('runs an import left waiting as soon as the service starts', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);
    await service!.close();

    // The wake finds nobody; the import waits for the service.
    await upload(account, 'export.txt', manyHands(4));
    expect((await account.list().expect(200)).body[0].status).toBe('waiting');

    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
    });
    await service.settled();

    expect(await account.libraryTotal()).toBe(4);
  });

  it('runs no database query once nothing is left', async () => {
    await start();
    const name = new URL(database.url).pathname.slice(1);
    const observer = new pg.Client(inject('databaseUrl'));
    await observer.connect();
    try {
      const { token } = await newAccount(api.httpServer);
      await upload(asAccount(token), 'export.txt', manyHands(5));
      await service!.settled();
      await api.close();

      const {
        rows: [{ now }],
        // As text: a Date would drop the microseconds.
      } = await observer.query<{ now: string }>(
        'select clock_timestamp()::text as now',
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      const { rows } = await observer.query<{ count: string }>(
        `select count(*) from pg_stat_activity
          where datname = $1
            and (state_change > $2::timestamptz or backend_start > $2::timestamptz)`,
        [name, now],
      );

      expect(Number(rows[0].count)).toBe(0);
    } finally {
      await observer.end();
    }
  });
});
