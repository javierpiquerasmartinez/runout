import pg from 'pg';
import request from 'supertest';
import { ADMINISTRATOR_EMAIL, signInAdministrator } from './support/admin.js';
import { startApp, type RunningApp } from './support/app.js';
import { freshDatabase } from './support/fresh-database.js';
import { newAccount } from './support/google.js';
import { manyHands } from './support/hand-histories.js';
import {
  startImportService,
  type RunningImportService,
} from './support/import-service.js';
import { MemoryFileStore } from './support/memory-file-store.js';
import { TestClock } from './support/test-clock.js';

const SECRET = 'a-shared-secret-for-tests';
const MINUTE = 60_000;

describe('The Importaciones tab (e2e)', () => {
  let store: MemoryFileStore;
  let clock: TestClock;
  let service: RunningImportService | undefined;
  let api: RunningApp;
  let database: { url: string; drop(): Promise<void> };
  let administrator: string;

  /**
   * The API and the import service on a database of their own, so that the
   * tab lists only this test's imports.
   */
  beforeEach(async () => {
    database = await freshDatabase();
    store = new MemoryFileStore();
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
      administratorEmails: [ADMINISTRATOR_EMAIL],
    });
    administrator = (await signInAdministrator(api)).token;
  });

  afterEach(async () => {
    await api?.close();
    await service?.close();
    await database?.drop();
  });

  const tab = (query = '', token = administrator) =>
    request(api.httpServer)
      .get(`/api/admin/bulk-imports${query}`)
      .set('Authorization', `Bearer ${token}`);

  const cancel = (id: string, token = administrator) =>
    request(api.httpServer)
      .post(`/api/admin/bulk-imports/${id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

  /** A new Account with this email, and its own Bulk Imports. */
  async function importer(email: string) {
    const account = await newAccount(api.httpServer, undefined, email);
    const http = request(api.httpServer);
    const auth = `Bearer ${account.token}`;
    return {
      ...account,
      list: async () =>
        (
          await http
            .get('/api/library/bulk-imports')
            .set('Authorization', auth)
            .expect(200)
        ).body as { id: string; status: string }[],
      libraryTotal: async () =>
        (
          await http
            .get('/api/library/hands')
            .set('Authorization', auth)
            .expect(200)
        ).body.total as number,
      /** Starts a Bulk Import of one text file and uploads it as the browser would. */
      upload: async (name: string, text: string): Promise<string> => {
        const bytes = Buffer.from(text);
        const started = await http
          .post('/api/library/bulk-imports')
          .set('Authorization', auth)
          .send({ files: [{ name, size: bytes.length }] })
          .expect(201);
        const id = started.body.id as string;
        const urls = await http
          .post(`/api/library/bulk-imports/${id}/files/0/parts`)
          .set('Authorization', auth)
          .send({ parts: [1] })
          .expect(201);
        const [{ partNumber, url }] = urls.body.parts as {
          partNumber: number;
          url: string;
        }[];
        await http
          .post(`/api/library/bulk-imports/${id}/complete`)
          .set('Authorization', auth)
          .send({
            files: [
              { parts: [{ partNumber, etag: store.receive(url, bytes) }] },
            ],
          })
          .expect(201);
        return id;
      },
      /** Starts one and leaves it uploading. */
      startUploading: async (name: string): Promise<string> =>
        (
          await http
            .post('/api/library/bulk-imports')
            .set('Authorization', auth)
            .send({ files: [{ name, size: 1000 }] })
            .expect(201)
        ).body.id as string,
    };
  }

  /**
   * Sets an import as failing or stalling would. Those come from the import
   * service's failures and the hourly check, built apart from this tab.
   */
  async function mark(
    id: string,
    fields: { status?: string; failureCode?: string; stalled?: boolean },
  ) {
    const client = new pg.Client(database.url);
    await client.connect();
    try {
      await client.query(
        `update bulk_imports set
           status = coalesce($2, status),
           failure_code = coalesce($3, failure_code),
           stalled = coalesce($4, stalled),
           finished_at = case when $2 = 'failed' then now() else finished_at end
         where id = $1`,
        [
          id,
          fields.status ?? null,
          fields.failureCode ?? null,
          fields.stalled ?? null,
        ],
      );
    } finally {
      await client.end();
    }
  }

  it('lists every Account’s imports, newest first, with Account, files, status, Hands, start, last activity and reason', async () => {
    const ana = await importer('ana@example.com');
    const bea = await importer('bea@example.com');
    const done = await ana.upload('pt4-export.txt', manyHands(3));
    await service!.settled();
    await clock.advance(10 * MINUTE);
    const uploading = await bea.startUploading('hm3-2024.zip');

    const { body } = await tab().expect(200);

    expect(body).toEqual({
      total: 2,
      page: 1,
      pageSize: 50,
      storage: {
        used: expect.any(Number) as number,
        threshold: 800 * 1024 * 1024,
      },
      imports: [
        {
          id: uploading,
          account: { id: bea.id, displayName: null, email: 'bea@example.com' },
          status: 'uploading',
          stalled: false,
          files: [{ name: 'hm3-2024.zip', size: 1000 }],
          total: null,
          processed: 0,
          imported: 0,
          duplicates: 0,
          notImported: {},
          reason: null,
          failureCode: null,
          retryable: false,
          createdAt: '2026-01-01T00:10:00.000Z',
          lastActivityAt: '2026-01-01T00:10:00.000Z',
          finishedAt: null,
        },
        {
          id: done,
          account: { id: ana.id, displayName: null, email: 'ana@example.com' },
          status: 'completed',
          stalled: false,
          files: [{ name: 'pt4-export.txt', size: expect.any(Number) }],
          total: 3,
          processed: 3,
          imported: 3,
          duplicates: 0,
          notImported: {},
          reason: null,
          failureCode: null,
          retryable: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastActivityAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('filters to the imports in progress, the failed and the stalled', async () => {
    const ana = await importer('ana@example.com');
    const bea = await importer('bea@example.com');
    const cris = await importer('cris@example.com');
    const done = await ana.upload('done.txt', manyHands(2));
    await service!.settled();
    await clock.advance(MINUTE);
    const failed = await ana.startUploading('failed.zip');
    await mark(failed, { status: 'failed', failureCode: '53100' });
    await clock.advance(MINUTE);
    const stalled = await bea.startUploading('stalled.zip');
    await mark(stalled, { status: 'running', stalled: true });
    await clock.advance(MINUTE);
    const running = await cris.startUploading('running.zip');

    const ids = async (status: string) =>
      (
        (await tab(`?status=${status}`).expect(200)).body.imports as {
          id: string;
        }[]
      ).map(({ id }) => id);

    expect(await ids('all')).toEqual([running, stalled, failed, done]);
    expect(await ids('active')).toEqual([running, stalled]);
    expect(await ids('failed')).toEqual([failed]);
    expect(await ids('stalled')).toEqual([stalled]);
    const [listedFailed] = (await tab('?status=failed').expect(200)).body
      .imports;
    expect(listedFailed).toMatchObject({
      status: 'failed',
      reason: null,
      failureCode: '53100',
    });
    await tab('?status=nonsense').expect(400);
  });

  it('pages the list', async () => {
    const ids: string[] = [];
    for (const name of ['a', 'b', 'c']) {
      const account = await importer(`${name}@example.com`);
      ids.unshift(await account.startUploading(`${name}.zip`));
      await clock.advance(MINUTE);
    }

    const second = await tab('?page=2&pageSize=2').expect(200);

    expect(second.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(second.body.imports.map(({ id }: { id: string }) => id)).toEqual([
      ids[2],
    ]);
    await tab('?page=0').expect(400);
  });

  it('cancels an import as its Importer would: nothing more is added, the Hands stay listed as cancelled, the files go', async () => {
    const ana = await importer('ana@example.com');
    await service!.close();
    const id = await ana.upload('export.txt', manyHands(4));
    await clock.advance(5 * MINUTE);

    await cancel(id).expect(204);
    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
      clock,
    });
    await service.settled();

    expect(await ana.libraryTotal()).toBe(0);
    expect(store.files()).toEqual([]);
    expect(await ana.list()).toEqual([
      expect.objectContaining({
        id,
        status: 'cancelled',
        finishedAt: '2026-01-01T00:05:00.000Z',
      }),
    ]);
    const [listed] = (await tab().expect(200)).body.imports;
    expect(listed).toMatchObject({
      status: 'cancelled',
      lastActivityAt: '2026-01-01T00:05:00.000Z',
    });
  });

  it('refuses to cancel an import that has ended, or none at all', async () => {
    const ana = await importer('ana@example.com');
    const done = await ana.upload('done.txt', manyHands(2));
    await service!.settled();

    const ended = await cancel(done).expect(404);
    expect(ended.body.reason).toBe('bulk-import-not-found');
    await cancel('not-an-id').expect(404);
    expect((await ana.list())[0].status).toBe('completed');
  });

  it('is there for Administrators only: anyone else is answered not-found', async () => {
    const ana = await importer('ana@example.com');
    const id = await ana.startUploading('export.zip');

    expect((await tab('', ana.token).expect(404)).body).toEqual({
      reason: 'not-found',
    });
    expect((await cancel(id, ana.token).expect(404)).body).toEqual({
      reason: 'not-found',
    });
    await request(api.httpServer).get('/api/admin/bulk-imports').expect(404);
    expect((await ana.list())[0].status).toBe('uploading');
  });
});
