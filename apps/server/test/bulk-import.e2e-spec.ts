import { strToU8, zipSync } from 'fflate';
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
  async function start(
    options: { limit?: number; libraryCapacity?: number } = {},
  ) {
    database = await freshDatabase();
    store = new MemoryFileStore();
    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
      limit: options.limit,
      libraryCapacity: options.libraryCapacity,
    });
    api = await startApp({
      databaseUrl: database.url,
      importService: { address: service.address, secret: SECRET },
      fileStore: store,
      libraryCapacity: options.libraryCapacity,
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

  /** Starts a Bulk Import of one text file and uploads it as the browser would. */
  function upload(
    account: ReturnType<typeof asAccount>,
    name: string,
    text: string,
  ): Promise<string> {
    return uploadFiles(account, [{ name, bytes: Buffer.from(text) }]);
  }

  /** Starts a Bulk Import of these files and uploads each in one part. */
  async function uploadFiles(
    account: ReturnType<typeof asAccount>,
    files: { name: string; bytes: Uint8Array }[],
  ): Promise<string> {
    const started = await account
      .start(files.map(({ name, bytes }) => ({ name, size: bytes.length })))
      .expect(201);
    const id = started.body.id as string;
    const uploaded = [];
    for (const [index, { bytes }] of files.entries()) {
      const urls = await account.partUrls(id, index, [1]).expect(201);
      const [{ partNumber, url }] = urls.body.parts as {
        partNumber: number;
        url: string;
      }[];
      uploaded.push({
        parts: [{ partNumber, etag: store.receive(url, bytes) }],
      });
    }
    await account.complete(id, uploaded).expect(201);
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

  it('imports text files and zips together, each Hand in its own format', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);
    const stars = manyHands(30);
    const gg = freshHandHistory('ggpoker-session.txt');
    const winamax = freshHandHistory('winamax-session.txt');
    const zip = zipSync({
      'export/gg.txt': strToU8(gg),
      'export/notes.pdf': strToU8('not a hand history'),
      'export/wina.txt': strToU8(winamax),
    });

    await uploadFiles(account, [
      { name: 'stars.txt', bytes: Buffer.from(stars) },
      { name: 'export.zip', bytes: zip },
    ]);
    await service!.settled();

    const [listed] = (await account.list().expect(200)).body;
    expect(listed.status).toBe('completed');
    expect(listed.files.map((file: { name: string }) => file.name)).toEqual([
      'stars.txt',
      'export.zip',
    ]);
    expect(listed.total).toBeGreaterThan(30);
    expect(listed.processed).toBe(listed.total);
    expect(listed.imported).toBe(await account.libraryTotal());
    const sites = await request(api.httpServer)
      .get('/api/library/hands?pageSize=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      new Set(sites.body.hands.map((hand: { site: string }) => hand.site)),
    ).toEqual(new Set(['pokerstars', 'ggpoker', 'winamax']));
  });

  it('ends an import of more Hands than the limit, adding none of them', async () => {
    await start({ limit: 20 });
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);

    await upload(account, 'too-many.txt', manyHands(21));
    await service!.settled();

    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({
      status: 'completed',
      reason: 'too-many-hands',
      imported: 0,
    });
    expect(await account.libraryTotal()).toBe(0);
    expect(store.files()).toEqual([]);
  });

  it('takes an import of exactly the limit', async () => {
    await start({ limit: 20 });
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);

    await upload(account, 'just-enough.txt', manyHands(20));
    await service!.settled();

    expect(await account.libraryTotal()).toBe(20);
  });

  it('counts a run of text that is no Hand, and ends saying so when nothing is one', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);

    await upload(account, 'notes.txt', 'Dear diary,\n\nnot a hand at all.');
    await service!.settled();

    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({
      status: 'completed',
      reason: 'unrecognised-format',
      total: 0,
      imported: 0,
      notImported: { 'unrecognised-format': 1 },
    });
    expect(store.files()).toEqual([]);
  });

  it('ends an import whose zip is not one, saying why', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);

    await upload(account, 'broken.zip', 'PK\u0003\u0004 not really a zip');
    await service!.settled();

    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({
      status: 'completed',
      reason: 'unreadable-file',
    });
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

  /** The import's record as stored, every column of it. */
  async function storedRecord(id: string): Promise<Record<string, unknown>> {
    const client = new pg.Client(database.url);
    await client.connect();
    try {
      const { rows } = await client.query(
        'select * from bulk_imports where id = $1',
        [id],
      );
      return rows[0] as Record<string, unknown>;
    } finally {
      await client.end();
    }
  }

  it('skips the Hands it cannot read, counting them per reason, and keeps none of their text', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);
    const tenMax = freshHandHistory('pokerstars-ten-max.txt');

    const id = await upload(
      account,
      'export.txt',
      `${manyHands(10)}${freshHandHistory('ggpoker-discarded.txt')}\n\n\n${tenMax}`,
    );
    await service!.settled();

    expect(await account.libraryTotal()).toBe(10);
    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({
      status: 'completed',
      total: 13,
      processed: 13,
      imported: 10,
      notImported: { 'not-cash-holdem': 2, 'too-many-seats': 1 },
      reason: null,
    });
    const stored = JSON.stringify(await storedRecord(id));
    expect(stored).not.toContain('Hand #');
    expect(stored).not.toContain(/Hand #(\d+)/.exec(tenMax)![1]);
  });

  /** Where the `index`th Hand (from 0) starts in a text of `manyHands`, in bytes. */
  function byteOfHand(text: string, index: number): number {
    let at = -1;
    for (let hand = 0; hand <= index; hand++) {
      at = text.indexOf('PokerStars Hand #', at + 1);
    }
    return Buffer.byteLength(text.slice(0, at));
  }

  /** Waits until the Account's only import has gone through `processed` Hands. */
  async function untilProcessed(
    account: ReturnType<typeof asAccount>,
    processed: number,
  ): Promise<void> {
    for (let tries = 0; tries < 200; tries++) {
      const [listed] = (await account.list().expect(200)).body;
      if (listed.processed >= processed) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`The import never got to ${processed} Hands`);
  }

  it('resumes an import interrupted by a restart, without duplicating a Hand', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);
    const text = manyHands(2500);
    // The first read counts; the second stops halfway into the second batch.
    const release = store.pauseRead({
      afterBytes: byteOfHand(text, 1500),
      skip: 1,
    });

    await upload(account, 'export.txt', text);
    await untilProcessed(account, 1000);
    const stopping = service!.close();
    release();
    await stopping;
    const [stopped] = (await account.list().expect(200)).body;
    expect(stopped.status).toBe('running');
    expect(stopped.processed).toBeLessThan(2500);

    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
    });
    await service.settled();

    expect(await account.libraryTotal()).toBe(2500);
    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({
      status: 'completed',
      total: 2500,
      processed: 2500,
      imported: 2500,
      duplicates: 0,
    });
  }, 30_000);

  it('tries a failing batch again, and goes on once it works', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);
    const text = manyHands(1500);
    // Past the count, two reads in a row lose storage in the second batch.
    store.failReads({ afterBytes: byteOfHand(text, 1200), times: 2, skip: 1 });

    await upload(account, 'export.txt', text);
    await service!.settled();

    expect(await account.libraryTotal()).toBe(1500);
    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({
      status: 'completed',
      imported: 1500,
      duplicates: 0,
    });
  }, 30_000);

  it('fails an import whose batch fails three times, keeping the Hands of the batches before', async () => {
    await start();
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);
    const text = manyHands(1500);
    store.failReads({ afterBytes: byteOfHand(text, 1200), times: 3, skip: 1 });

    const id = await upload(account, 'export.txt', text);
    await service!.settled();

    expect(await account.libraryTotal()).toBe(1000);
    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({
      status: 'failed',
      total: 1500,
      processed: 1000,
      imported: 1000,
      finishedAt: expect.any(String),
    });
    // What Administrators will be told: the technical failure, and no Hand.
    expect(await storedRecord(id)).toMatchObject({
      failure_code: 'ECONNRESET',
    });
    // Kept, to be retried.
    expect(store.files()).toHaveLength(1);
  }, 30_000);

  it('ends as a full Library once it reaches its capacity, counting the Hands that did not fit', async () => {
    await start({ libraryCapacity: 1200 });
    const { token } = await newAccount(api.httpServer);
    const account = asAccount(token);
    const session = freshHandHistory('pokerstars-session.txt');
    await account.importSmall(session);
    const before = await account.libraryTotal();

    // Its first Hands are already there: duplicates take no room.
    await upload(account, 'export.txt', `${session}\n\n${manyHands(1500)}`);
    await service!.settled();

    expect(await account.libraryTotal()).toBe(1200);
    const [listed] = (await account.list().expect(200)).body;
    expect(listed).toMatchObject({
      status: 'completed',
      reason: 'library-full',
      imported: 1200 - before,
      duplicates: before,
      notImported: { 'library-full': 1500 - (1200 - before) },
      finishedAt: expect.any(String),
    });
    expect(store.files()).toEqual([]);
  }, 30_000);
});
