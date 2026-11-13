import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ADMINISTRATOR_EMAIL, signInAdministrator } from './support/admin.js';
import { startApp, type RunningApp } from './support/app.js';
import { freshDatabase } from './support/fresh-database.js';
import { newAccount } from './support/google.js';
import { manyHands } from './support/hand-histories.js';
import { HeldFileStore, startOfHand } from './support/held-file-store.js';
import {
  startImportService,
  type RunningImportService,
} from './support/import-service.js';
import { TestClock } from './support/test-clock.js';

const SECRET = 'a-shared-secret-for-tests';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('Stalled Bulk Imports (e2e)', () => {
  let store: HeldFileStore;
  let clock: TestClock;
  let service: RunningImportService | undefined;
  let api: RunningApp;
  let database: { url: string; drop(): Promise<void> };
  let administrator: string;
  /** Reads a test held, let go before closing. */
  let holds: (() => void)[] = [];

  /** The API and the import service on a database of their own, on one clock. */
  beforeEach(async () => {
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
      administratorEmails: [ADMINISTRATOR_EMAIL],
    });
    administrator = (await signInAdministrator(api)).token;
  });

  afterEach(async () => {
    holds.forEach((release) => release());
    holds = [];
    await api?.close();
    await service?.close();
    await database?.drop();
  });

  /** The Importaciones tab, as an Administrator sees it. */
  const tab = async (status = 'all') =>
    (
      await request(api.httpServer)
        .get(`/api/admin/bulk-imports?status=${status}`)
        .set('Authorization', `Bearer ${administrator}`)
        .expect(200)
    ).body.imports as { id: string; status: string; stalled: boolean }[];

  const stallEmails = () =>
    api.inbox
      .to(ADMINISTRATOR_EMAIL)
      .filter((email) => email.subject.includes('atascada'));

  /** A new Account, signed in, with its own Bulk Imports. */
  async function importer() {
    const email = `${randomUUID()}@example.com`;
    const { token } = await newAccount(api.httpServer, undefined, email);
    const http = request(api.httpServer);
    const auth = `Bearer ${token}`;
    return {
      email,
      list: async () =>
        (
          await http
            .get('/api/library/bulk-imports')
            .set('Authorization', auth)
            .expect(200)
        ).body as Record<string, unknown>[],
      /** Starts a Bulk Import of one text file and uploads it as the browser would. */
      upload: async (text: string, name = 'hm3-2024.txt'): Promise<string> => {
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

  /**
   * An import of 3,000 Hands whose reading stops partway through its second
   * batch, as a stopped import service would leave it.
   */
  async function stuckImport(account: Awaited<ReturnType<typeof importer>>) {
    const text = manyHands(3000);
    // The count goes through; the reading of its Hands is held.
    store.letReadThrough();
    const [hold] = store.holdReadAt(startOfHand(text, 1200));
    const id = await account.upload(text);
    holds.push(hold.release);
    await hold.held;
    return { id, release: hold.release };
  }

  it('flags an import without advance for 30 minutes and emails the Administrators once', async () => {
    const account = await importer();
    const stuck = await stuckImport(account);
    expect((await tab())[0]).toMatchObject({ id: stuck.id, stalled: false });

    await clock.advance(20 * MINUTE);
    expect((await tab())[0].stalled).toBe(false);
    expect(stallEmails()).toHaveLength(0);

    const wakes = service!.wakes();
    await clock.advance(50 * MINUTE);
    // The check woke the service, in case it was only asleep.
    expect(service!.wakes()).toBe(wakes + 1);
    expect(await tab('stalled')).toEqual([
      expect.objectContaining({
        id: stuck.id,
        status: 'running',
        stalled: true,
      }),
    ]);
    const [email] = stallEmails();
    expect(stallEmails()).toHaveLength(1);
    expect(email.subject).toBe('Una importación está atascada');
    expect(email.text).toContain(account.email);
    expect(email.text).toContain('hm3-2024.txt');
    expect(email.text).toContain('1000 de 3000');
    expect(email.text).toContain('http://localhost:5173/admin/imports');

    await clock.advance(5 * HOUR);
    expect(stallEmails()).toHaveLength(1);

    // Its Importer still sees it in progress.
    const [seen] = await account.list();
    expect(seen.status).toBe('running');
    expect(seen).not.toHaveProperty('stalled');

    stuck.release();
    await service!.settled();
  });

  it('clears the flag at the next advance, and tells the Administrators again at a later stall', async () => {
    const account = await importer();
    const text = manyHands(3000);
    store.letReadThrough();
    const [first, second] = store.holdReadAt(
      startOfHand(text, 1200),
      startOfHand(text, 2200),
    );
    holds.push(first.release, second.release);
    await account.upload(text);
    await first.held;
    await clock.advance(61 * MINUTE);
    expect((await tab())[0].stalled).toBe(true);
    expect(stallEmails()).toHaveLength(1);

    first.release();
    await second.held;
    expect((await tab())[0]).toMatchObject({
      status: 'running',
      stalled: false,
    });
    expect(await tab('stalled')).toEqual([]);

    await clock.advance(20 * MINUTE);
    expect((await tab())[0].stalled).toBe(false);
    expect(stallEmails()).toHaveLength(1);

    await clock.advance(HOUR);
    expect((await tab())[0].stalled).toBe(true);
    expect(stallEmails()).toHaveLength(2);
    expect(stallEmails()[1].text).toContain('2000 de 3000');

    second.release();
    await service!.settled();
    expect((await tab())[0]).toMatchObject({
      status: 'completed',
      stalled: false,
    });
  });

  it('wakes the service at each check while an import waits, and not once nothing is left', async () => {
    const first = await importer();
    const second = await importer();
    const text = manyHands(5);
    // The first import's count is held, so the second waits its turn.
    const [hold] = store.holdReadAt(startOfHand(text, 2));
    holds.push(hold.release);
    await first.upload(text);
    await hold.held;
    await second.upload(manyHands(3));
    expect((await tab()).map(({ status }) => status).sort()).toEqual([
      'counting',
      'waiting',
    ]);

    const wakes = service!.wakes();
    await clock.advance(0);
    expect(service!.wakes()).toBe(wakes + 1);

    hold.release();
    await service!.settled();
    expect((await tab()).map(({ status }) => status)).toEqual([
      'completed',
      'completed',
    ]);
    const settled = service!.wakes();
    await clock.advance(3 * HOUR);
    expect(service!.wakes()).toBe(settled);
    expect(stallEmails()).toHaveLength(0);
  });
});
