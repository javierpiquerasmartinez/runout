import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ADMINISTRATOR_EMAIL, signInAdministrator } from './support/admin.js';
import { startApp, type RunningApp } from './support/app.js';
import { freshDatabase } from './support/fresh-database.js';
import { newAccount } from './support/google.js';
import { freshHandHistory, manyHands } from './support/hand-histories.js';
import { HeldFileStore, startOfHand } from './support/held-file-store.js';
import {
  startImportService,
  type RunningImportService,
} from './support/import-service.js';

const SECRET = 'a-shared-secret-for-tests';

describe('The email to the Importer when a Bulk Import ends (e2e)', () => {
  let store: HeldFileStore;
  let service: RunningImportService | undefined;
  let api: RunningApp;
  let database: { url: string; drop(): Promise<void> };

  /** The API and the import service, on a database of their own. */
  async function start(
    options: { libraryCapacity?: number; textLimit?: number } = {},
  ) {
    database = await freshDatabase();
    store = new HeldFileStore();
    service = await startImportService({
      secret: SECRET,
      fileStore: store,
      databaseUrl: database.url,
      libraryCapacity: options.libraryCapacity,
      textLimit: options.textLimit,
    });
    api = await startApp({
      databaseUrl: database.url,
      importService: { address: service.address, secret: SECRET },
      fileStore: store,
      libraryCapacity: options.libraryCapacity,
      administratorEmails: [ADMINISTRATOR_EMAIL],
    });
  }

  afterEach(async () => {
    await api?.close();
    await service?.close();
    await database?.drop();
  });

  /** A new Account, signed in, with an email of its own. */
  async function importer(subject = randomUUID()) {
    const email = `${subject}@example.com`;
    const { token, id } = await newAccount(api.httpServer, subject, email);
    const http = request(api.httpServer);
    const as = <T extends request.Test>(test: T) =>
      test.set('Authorization', `Bearer ${token}`);
    return {
      id,
      subject,
      email,
      list: () => as(http.get('/api/library/bulk-imports')),
      cancel: (bulkImport: string) =>
        as(http.post(`/api/library/bulk-imports/${bulkImport}/cancel`)),
      speak: (language: 'es' | 'en') =>
        as(http.patch('/api/identities/me/preferences'))
          .send({ language })
          .expect(200),
      importSmall: async (text: string) => {
        const read = await as(http.post('/api/library/imports/previews'))
          .attach('file', Buffer.from(text), 'session.txt')
          .expect(201);
        await as(http.post('/api/library/imports'))
          .send({ previews: [read.body.id] })
          .expect(201);
      },
      /** Starts a Bulk Import of one text file and uploads it as the browser would. */
      upload: async (text: string, name = 'export.txt'): Promise<string> => {
        const bytes = Buffer.from(text);
        const started = await as(http.post('/api/library/bulk-imports'))
          .send({ files: [{ name, size: bytes.length }] })
          .expect(201);
        const bulkImport = started.body.id as string;
        const urls = await as(
          http.post(`/api/library/bulk-imports/${bulkImport}/files/0/parts`),
        )
          .send({ parts: [1] })
          .expect(201);
        const [{ partNumber, url }] = urls.body.parts as {
          partNumber: number;
          url: string;
        }[];
        await as(http.post(`/api/library/bulk-imports/${bulkImport}/complete`))
          .send({
            files: [
              { parts: [{ partNumber, etag: store.receive(url, bytes) }] },
            ],
          })
          .expect(201);
        return bulkImport;
      },
    };
  }

  it('tells the Importer how many Hands were imported, were duplicates and were not, per reason', async () => {
    await start();
    const account = await importer();
    const session = manyHands(5);
    await account.importSmall(session);

    await account.upload(
      `${session}${manyHands(1500)}not a hand at all\n\n\n${freshHandHistory('ggpoker-discarded.txt')}\n\n\n${freshHandHistory('pokerstars-ten-max.txt')}`,
    );
    await service!.settled();

    const sent = service!.inbox.to(account.email);
    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email.subject).toBe('Tu importación ha terminado');
    expect(email.text).toContain('Importadas: 1500');
    expect(email.text).toContain('Duplicadas: 5');
    expect(email.text).toContain('No reconocidas: 1');
    expect(email.text).toContain("No es una mano de hold'em cash: 2");
    expect(email.text).toContain('Más de nueve asientos: 1');
    expect(email.text).toContain('http://localhost:5173/library/imports');
    expect(email.html).toContain('Importadas: 1500');
  });

  it('tells the Importer in English, and when it failed, which Hands stayed', async () => {
    await start();
    const account = await importer();
    await account.speak('en');
    const text = manyHands(1500);
    // Past the count, every read in the second batch loses storage.
    store.failReads({ afterBytes: startOfHand(text, 1200), times: 3, skip: 1 });

    await account.upload(text);
    await service!.settled();

    expect((await account.list().expect(200)).body[0].status).toBe('failed');
    const sent = service!.inbox.to(account.email);
    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email.subject).toBe('Your import was interrupted');
    expect(email.text).toContain(
      'The import of export.txt was interrupted after 1,000 of 1,500 hands. The 1,000 hands imported are kept in your Library',
    );
    expect(email.text).toContain('Imported: 1,000');
  });

  it('says the Library is full, and how many Hands were left unimported', async () => {
    await start({ libraryCapacity: 1200 });
    const account = await importer();

    await account.upload(manyHands(1500));
    await service!.settled();

    const [email] = service!.inbox.to(account.email);
    expect(email.subject).toBe('Tu importación ha terminado');
    expect(email.text).toContain(
      'Biblioteca llena: 300 manos se quedaron sin importar.',
    );
    expect(email.text).toContain('Importadas: 1200');
  });

  it('says when the files hold too much text', async () => {
    await start({ textLimit: 100 });
    const account = await importer();

    await account.upload(manyHands(3));
    await service!.settled();

    const [email] = service!.inbox.to(account.email);
    expect(email.text).toContain(
      'Los archivos tienen más de 5 GB de texto: no se ha importado ninguna mano.',
    );
  });

  it('says when no Hand was in a format it recognises', async () => {
    await start();
    const account = await importer();

    await account.upload('nothing here is a hand\n', 'notes.txt');
    await service!.settled();

    const sent = service!.inbox.to(account.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain(
      'No hemos reconocido el formato de ninguna mano.',
    );
    expect(sent[0].text).toContain('Importadas: 0');
  });

  it('sends nothing for an import its Importer cancelled', async () => {
    await start();
    const account = await importer();
    const text = manyHands(1500);
    store.letReadThrough();
    const adding = store.holdRead(startOfHand(text, 1200));
    const id = await account.upload(text);
    await adding.held;

    await account.cancel(id).expect(201);
    adding.release();
    await service!.settled();

    expect((await account.list().expect(200)).body[0].status).toBe('cancelled');
    expect(service!.inbox.to(account.email)).toEqual([]);
  });

  it('sends nothing for a small import', async () => {
    await start();
    const account = await importer();

    await account.importSmall(manyHands(5));

    expect(service!.inbox.to(account.email)).toEqual([]);
    expect(api.inbox.to(account.email)).toEqual([]);
  });

  it('finishes the import of a Suspended Account, and sends it nothing', async () => {
    await start();
    const account = await importer();
    const administrator = await signInAdministrator(api);
    const text = manyHands(1500);
    store.letReadThrough();
    const adding = store.holdRead(startOfHand(text, 1200));
    await account.upload(text);
    await adding.held;

    await request(api.httpServer)
      .post(`/api/admin/accounts/${account.id}/suspension`)
      .set('Authorization', `Bearer ${administrator.token}`)
      .expect(204);
    adding.release();
    await service!.settled();
    expect(service!.inbox.to(account.email)).toEqual([]);

    // Lifting the Suspension finds the Hands in place.
    await request(api.httpServer)
      .delete(`/api/admin/accounts/${account.id}/suspension`)
      .set('Authorization', `Bearer ${administrator.token}`)
      .expect(204);
    const again = await importer(account.subject);
    const [listed] = (await again.list().expect(200)).body;
    expect(listed).toMatchObject({ status: 'completed', imported: 1500 });
  });
});
