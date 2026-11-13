import { randomUUID } from 'node:crypto';
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
const HOUR = 60 * MINUTE;
const MB = 1024 * 1024;
/** Any database is past it. */
const REACHED = 1;
/** As after an upgrade: far above a test database. */
const RAISED = 10_000 * MB;

describe('The storage guard (e2e)', () => {
  let store: MemoryFileStore;
  let clock: TestClock;
  let service: RunningImportService;
  let api: RunningApp;
  let database: { url: string; drop(): Promise<void> };

  /** The API and the import service on a database of their own, on one clock, with this threshold. */
  async function start(threshold: number) {
    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
      clock,
      administratorEmails: [ADMINISTRATOR_EMAIL],
      storageThreshold: threshold,
    });
    api = await startApp({
      databaseUrl: database.url,
      importService: { address: service.address, secret: SECRET },
      fileStore: store,
      clock,
      administratorEmails: [ADMINISTRATOR_EMAIL],
      storageThreshold: threshold,
    });
  }

  /** As raising the configuration does: both restart with the new threshold. */
  async function restart(threshold: number) {
    await api.close();
    await service.close();
    await start(threshold);
  }

  beforeEach(async () => {
    database = await freshDatabase();
    store = new MemoryFileStore();
    clock = new TestClock();
  });

  afterEach(async () => {
    await api?.close();
    await service?.close();
    await database?.drop();
  });

  /** The Importaciones tab, as an Administrator sees it. */
  async function tab() {
    const { token } = await signInAdministrator(api);
    return (
      await request(api.httpServer)
        .get('/api/admin/bulk-imports')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body as {
      imports: {
        id: string;
        status: string;
        stalled: boolean;
        total: number | null;
        processed: number;
        imported: number;
      }[];
      storage: { used: number; threshold: number };
    };
  }

  const pauseEmails = () =>
    service.inbox
      .to(ADMINISTRATOR_EMAIL)
      .filter((email) => email.subject.includes('pausa'));

  /** A new Account, signed in, with its own imports. */
  async function importer() {
    const email = `${randomUUID()}@example.com`;
    const { token } = await newAccount(api.httpServer, undefined, email);
    const auth = `Bearer ${token}`;
    const http = () => request(api.httpServer);
    return {
      list: async () =>
        (
          await http()
            .get('/api/library/bulk-imports')
            .set('Authorization', auth)
            .expect(200)
        ).body as { id: string; status: string }[],
      /** Starts a Bulk Import of one text file and uploads it as the browser would. */
      upload: async (text: string): Promise<string> => {
        const bytes = Buffer.from(text);
        const started = await http()
          .post('/api/library/bulk-imports')
          .set('Authorization', auth)
          .send({ files: [{ name: 'tracker.txt', size: bytes.length }] })
          .expect(201);
        const id = started.body.id as string;
        const urls = await http()
          .post(`/api/library/bulk-imports/${id}/files/0/parts`)
          .set('Authorization', auth)
          .send({ parts: [1] })
          .expect(201);
        const [{ partNumber, url }] = urls.body.parts as {
          partNumber: number;
          url: string;
        }[];
        await http()
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
      /** A small import, through the dialog's single request. */
      importSmall: async (text: string) => {
        const preview = await http()
          .post('/api/library/imports/previews')
          .set('Authorization', auth)
          .send({ text })
          .expect(201);
        await http()
          .post('/api/library/imports')
          .set('Authorization', auth)
          .send({ previews: [preview.body.id as string] })
          .expect(201);
        return (
          await http()
            .get('/api/library/hands')
            .set('Authorization', auth)
            .expect(200)
        ).body.total as number;
      },
    };
  }

  it('pauses Bulk Imports on reaching the threshold, and emails the Administrators once', async () => {
    await start(REACHED);
    const first = await importer();
    const id = await first.upload(manyHands(1500));
    await service.settled();

    // Counted, but no batch added.
    expect((await tab()).imports).toEqual([
      expect.objectContaining({
        id,
        status: 'paused',
        stalled: false,
        total: 1500,
        processed: 0,
        imported: 0,
      }),
    ]);
    expect((await first.list())[0]).toMatchObject({ id, status: 'paused' });
    const [email] = pauseEmails();
    expect(pauseEmails()).toHaveLength(1);
    expect(email.subject).toBe('Las importaciones están en pausa');
    expect(email.text).toContain('http://localhost:5173/admin/imports');

    // Another, while paused: paused too, and nobody is told again.
    const second = await importer();
    await second.upload(manyHands(1200));
    await service.settled();
    expect((await tab()).imports.map(({ status }) => status)).toEqual([
      'paused',
      'paused',
    ]);
    expect(pauseEmails()).toHaveLength(1);

    // Nor at the hourly checks, which neither stall nor resume them.
    await clock.advance(3 * HOUR);
    await service.settled();
    expect(
      (await tab()).imports.map(({ status, stalled }) => ({ status, stalled })),
    ).toEqual([
      { status: 'paused', stalled: false },
      { status: 'paused', stalled: false },
    ]);
    expect(pauseEmails()).toHaveLength(1);
    expect(api.inbox.to(ADMINISTRATOR_EMAIL)).toHaveLength(0);
  });

  it('lets small imports through while Bulk Imports are paused', async () => {
    await start(REACHED);
    const account = await importer();
    await account.upload(manyHands(1500));
    await service.settled();
    expect((await account.list())[0].status).toBe('paused');

    expect(await account.importSmall(manyHands(3))).toBe(3);
  });

  it('resumes paused imports at the next check once below the threshold', async () => {
    await start(REACHED);
    const account = await importer();
    const id = await account.upload(manyHands(1500));
    await service.settled();
    expect((await account.list())[0].status).toBe('paused');

    await restart(RAISED);
    // The check at start-up.
    await clock.advance(0);
    await service.settled();

    expect((await tab()).imports).toEqual([
      expect.objectContaining({
        id,
        status: 'completed',
        stalled: false,
        total: 1500,
        processed: 1500,
        imported: 1500,
      }),
    ]);
    expect((await account.list())[0].status).toBe('completed');
  });

  it('shows the database size against its threshold', async () => {
    await start(RAISED);
    const { storage } = await tab();
    expect(storage.threshold).toBe(RAISED);
    expect(storage.used).toBeGreaterThan(MB);
    expect(storage.used).toBeLessThan(RAISED);
  });
});
