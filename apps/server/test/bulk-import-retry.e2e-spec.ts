import request from 'supertest';
import { ADMINISTRATOR_EMAIL, signInAdministrator } from './support/admin.js';
import { startApp, type RunningApp } from './support/app.js';
import { freshDatabase } from './support/fresh-database.js';
import { newAccount } from './support/google.js';
import { manyHands } from './support/hand-histories.js';
import { startOfHand } from './support/held-file-store.js';
import {
  startImportService,
  type RunningImportService,
} from './support/import-service.js';
import { MemoryFileStore } from './support/memory-file-store.js';
import { TestClock } from './support/test-clock.js';

const SECRET = 'a-shared-secret-for-tests';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const SECOND_ADMINISTRATOR = 'second-admin@runout.test';

describe('Failed Bulk Imports, for Administrators (e2e)', () => {
  let store: MemoryFileStore;
  let clock: TestClock;
  let service: RunningImportService | undefined;
  let api: RunningApp;
  let database: { url: string; drop(): Promise<void> };
  let administrator: string;

  /** The API and the import service on a database of their own. */
  beforeEach(async () => {
    database = await freshDatabase();
    store = new MemoryFileStore();
    clock = new TestClock();
    const administratorEmails = [ADMINISTRATOR_EMAIL, SECOND_ADMINISTRATOR];
    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
      clock,
      administratorEmails,
    });
    api = await startApp({
      databaseUrl: database.url,
      importService: { address: service.address, secret: SECRET },
      fileStore: store,
      clock,
      administratorEmails,
    });
    administrator = (await signInAdministrator(api)).token;
  });

  afterEach(async () => {
    await api?.close();
    await service?.close();
    await database?.drop();
  });

  const tab = () =>
    request(api.httpServer)
      .get('/api/admin/bulk-imports')
      .set('Authorization', `Bearer ${administrator}`);

  const retry = (id: string, token = administrator) =>
    request(api.httpServer)
      .post(`/api/admin/bulk-imports/${id}/retry`)
      .set('Authorization', `Bearer ${token}`);

  /** What the Administrators were sent by the import service. */
  const toAdministrators = () => [
    ...service!.inbox.to(ADMINISTRATOR_EMAIL),
    ...service!.inbox.to(SECOND_ADMINISTRATOR),
  ];

  /** A new Account with this email, and its own Bulk Imports. */
  async function importer(email: string) {
    const account = await newAccount(api.httpServer, undefined, email);
    const http = request(api.httpServer);
    const auth = `Bearer ${account.token}`;
    return {
      ...account,
      email,
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
    };
  }

  /** An import of 1,500 Hands whose second batch loses storage three times: it fails at 1,000. */
  async function failedImport(email = 'ana@example.com') {
    const account = await importer(email);
    const text = manyHands(1500);
    store.failReads({ afterBytes: startOfHand(text, 1200), times: 3, skip: 1 });
    const id = await account.upload('sesiones-2023.txt', text);
    await service!.settled();
    expect((await account.list())[0].status).toBe('failed');
    return { account, id };
  }

  it('emails every Administrator once when an import fails, with the Account, the Hands imported and the reason', async () => {
    await failedImport();

    for (const to of [ADMINISTRATOR_EMAIL, SECOND_ADMINISTRATOR]) {
      const sent = service!.inbox.to(to);
      expect(sent).toHaveLength(1);
      const [email] = sent;
      expect(email.subject).toBe('Una importación ha fallado');
      expect(email.text).toContain('ana@example.com');
      expect(email.text).toContain('sesiones-2023.txt');
      expect(email.text).toContain('1000 de 1500');
      expect(email.text).toContain('ECONNRESET');
      expect(email.text).toContain('http://localhost:5173/admin/imports');
    }
  }, 30_000);

  it('retries a failed import from where it stopped: it wakes the service, adds no duplicate, and emails the Importer when it ends', async () => {
    const { account, id } = await failedImport();
    const [failed] = (await tab().expect(200)).body.imports;
    expect(failed).toMatchObject({ id, status: 'failed', retryable: true });
    const wakes = service!.wakes();

    await retry(id).expect(204);
    await service!.settled();

    expect(service!.wakes()).toBe(wakes + 1);
    expect(await account.libraryTotal()).toBe(1500);
    expect((await account.list())[0]).toMatchObject({
      id,
      status: 'completed',
      total: 1500,
      processed: 1500,
      imported: 1500,
      duplicates: 0,
    });
    const [listed] = (await tab().expect(200)).body.imports;
    expect(listed).toMatchObject({
      status: 'completed',
      failureCode: null,
      retryable: false,
    });
    // The first email told of the failure; this one of the end.
    const sent = service!.inbox.to(account.email);
    expect(sent.map(({ subject }) => subject)).toEqual([
      'Tu importación se ha interrumpido',
      'Tu importación ha terminado',
    ]);
    expect(store.files()).toEqual([]);
    // Only the failure was news for them.
    expect(service!.inbox.to(ADMINISTRATOR_EMAIL)).toHaveLength(1);
  }, 30_000);

  it('keeps a failed import’s files for 7 days, then lets them go, and it can no longer be retried', async () => {
    const { account, id } = await failedImport();

    await clock.advance(7 * DAY - HOUR);
    expect(store.files()).toHaveLength(1);
    expect((await tab().expect(200)).body.imports[0].retryable).toBe(true);

    await clock.advance(2 * HOUR);
    expect(store.files()).toEqual([]);
    expect((await tab().expect(200)).body.imports[0]).toMatchObject({
      status: 'failed',
      retryable: false,
    });
    const refused = await retry(id).expect(409);
    expect(refused.body.reason).toBe('bulk-import-not-retryable');
    await service!.settled();
    expect((await account.list())[0].status).toBe('failed');
    expect(await account.libraryTotal()).toBe(1000);
  }, 30_000);

  it('refuses to retry an import that has not failed, or none at all, and refuses anyone but an Administrator', async () => {
    const ana = await importer('ana@example.com');
    const done = await ana.upload('export.txt', manyHands(3));
    await service!.settled();

    expect((await retry(done).expect(409)).body.reason).toBe(
      'bulk-import-not-retryable',
    );
    await retry('not-an-id').expect(404);
    await retry('00000000-0000-4000-8000-000000000000').expect(404);
    expect((await retry(done, ana.token).expect(404)).body).toEqual({
      reason: 'not-found',
    });
  });

  it('refuses to retry while the Account has started another import', async () => {
    const { account, id } = await failedImport();
    // The service stopped, another of theirs stays waiting.
    await service!.close();
    await account.upload('another.txt', manyHands(3));

    expect((await retry(id).expect(409)).body.reason).toBe(
      'bulk-import-unfinished',
    );
  }, 30_000);

  it('emails no Administrator when an import succeeds', async () => {
    const ana = await importer('ana@example.com');
    await ana.upload('export.txt', manyHands(20));
    await service!.settled();

    expect((await ana.list())[0].status).toBe('completed');
    expect(toAdministrators()).toEqual([]);
  });
});
