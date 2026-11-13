import request from 'supertest';
import type { Clock } from '../src/clock/clock.js';
import {
  ADMINISTRATOR_EMAIL,
  invitedAccount,
  signInAdministrator,
  uniqueEmail,
} from './support/admin.js';
import { startApp, type RunningApp } from './support/app.js';
import { freshDatabase } from './support/fresh-database.js';
import { newAccount } from './support/google.js';
import { manyHands } from './support/hand-histories.js';
import {
  startImportService,
  type RunningImportService,
} from './support/import-service.js';
import { MemoryFileStore } from './support/memory-file-store.js';

const SECRET = 'a-shared-secret-for-tests';
const MINUTE = 60_000;

/** A clock that moves a second each time it is read, so every batch is stamped apart. */
class TickingClock implements Clock {
  private current = new Date('2026-01-01T00:00:00Z').getTime();

  now(): Date {
    this.current += 1000;
    return new Date(this.current);
  }

  schedule(): () => void {
    return () => undefined;
  }
}

interface Listed {
  id: string;
  status: string;
  finishedAt: string | null;
}

describe('A fair share of the import service between Accounts (e2e)', () => {
  let store: MemoryFileStore;
  let service: RunningImportService | undefined;
  let api: RunningApp;
  let database: { url: string; drop(): Promise<void> };

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
      administratorEmails: [ADMINISTRATOR_EMAIL],
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
      list: async () =>
        (
          await http
            .get('/api/library/bulk-imports')
            .set('Authorization', `Bearer ${token}`)
            .expect(200)
        ).body as Listed[],
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

  async function signedIn() {
    return asAccount((await newAccount(api.httpServer)).token);
  }

  it('advances two Accounts’ imports alternately, so the smaller is not held up behind the larger', async () => {
    await start();
    const big = await signedIn();
    const small = await signedIn();
    // Both wait for the service; the big one was started first.
    await service!.close();
    const bigId = await big.upload('big.txt', manyHands(3000));
    await api.clock.advance(MINUTE);
    const smallId = await small.upload('small.txt', manyHands(1500));

    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
      clock: new TickingClock(),
    });
    await service.settled();

    const [bigImport] = await big.list();
    const [smallImport] = await small.list();
    expect(bigImport).toMatchObject({ id: bigId, status: 'completed' });
    expect(smallImport).toMatchObject({ id: smallId, status: 'completed' });
    expect(smallImport.finishedAt! < bigImport.finishedAt!).toBe(true);
  });

  it('refuses a second import while the Account’s first is unfinished, saying why', async () => {
    await start();
    const account = await signedIn();
    await account.start([{ name: 'first.txt', size: 1000 }]).expect(201);

    const refused = await account
      .start([{ name: 'second.txt', size: 1000 }])
      .expect(409);

    expect(refused.body.reason).toBe('bulk-import-unfinished');
    expect(await account.list()).toHaveLength(1);
  });

  it('refuses it while the first waits for the import service', async () => {
    await start();
    const account = await signedIn();
    await service!.close();
    await account.upload('first.txt', manyHands(3));

    const refused = await account
      .start([{ name: 'second.txt', size: 1000 }])
      .expect(409);

    expect(refused.body.reason).toBe('bulk-import-unfinished');
  });

  it('takes only one of two imports started at once', async () => {
    await start();
    const account = await signedIn();

    const answers = await Promise.all([
      account.start([{ name: 'one.txt', size: 1000 }]),
      account.start([{ name: 'two.txt', size: 1000 }]),
    ]);

    expect(answers.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(await account.list()).toHaveLength(1);
  });

  it('allows a new import once the previous one has ended', async () => {
    await start();
    const account = await signedIn();
    await account.upload('first.txt', manyHands(3));
    await service!.settled();

    await account.start([{ name: 'second.txt', size: 1000 }]).expect(201);

    expect(await account.list()).toHaveLength(2);
  });

  it('leaves other Accounts free to start their own', async () => {
    await start();
    const one = await signedIn();
    const other = await signedIn();
    await one.start([{ name: 'one.txt', size: 1000 }]).expect(201);

    await other.start([{ name: 'other.txt', size: 1000 }]).expect(201);
  });

  it('refuses to start one during an Impersonation', async () => {
    await start();
    const administrator = await signInAdministrator(api);
    const ana = await invitedAccount(
      api,
      administrator.token,
      uniqueEmail('ana'),
    );
    const impersonation = await request(api.httpServer)
      .post(`/api/admin/accounts/${ana.id}/impersonations`)
      .set('Authorization', `Bearer ${administrator.token}`)
      .expect(201);

    const refused = await asAccount(impersonation.body.token as string)
      .start([{ name: 'export.txt', size: 1000 }])
      .expect(403);

    expect(refused.body.reason).toBe('impersonation-not-allowed');
    expect(await asAccount(ana.token).list()).toEqual([]);
  });
});
