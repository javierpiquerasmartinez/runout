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

const SECRET = 'a-shared-secret-for-tests';
const GB = 1024 ** 3;

describe('Uploading a Bulk Import (e2e)', () => {
  let store: MemoryFileStore;
  let service: RunningImportService | undefined;
  let api: RunningApp;
  let database: { url: string; drop(): Promise<void> };

  beforeEach(async () => {
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
  });

  afterEach(async () => {
    await api?.close();
    await service?.close();
    await database?.drop();
  });

  async function signedIn() {
    const { token } = await newAccount(api.httpServer);
    const http = request(api.httpServer);
    return {
      start: (files: { name: string; size: number }[]) =>
        http
          .post('/api/library/bulk-imports')
          .set('Authorization', `Bearer ${token}`)
          .send({ files }),
      uploadedParts: (id: string, file: number) =>
        http
          .get(`/api/library/bulk-imports/${id}/files/${file}/parts`)
          .set('Authorization', `Bearer ${token}`),
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
    };
  }

  type Importer = Awaited<ReturnType<typeof signedIn>>;

  /** PUTs `bytes` as part `partNumber` of file `file`, as the browser would; gives its ETag. */
  async function sendPart(
    importer: Importer,
    id: string,
    file: number,
    partNumber: number,
    bytes: Uint8Array,
  ): Promise<string> {
    const urls = await importer.partUrls(id, file, [partNumber]).expect(201);
    return store.receive((urls.body.parts as { url: string }[])[0].url, bytes);
  }

  describe('the files it takes', () => {
    it('takes .txt and .zip files, whatever the case of their extension', async () => {
      const importer = await signedIn();

      await importer
        .start([
          { name: 'export.txt', size: 10 },
          { name: 'EXPORT.ZIP', size: 10 },
        ])
        .expect(201);
    });

    it('refuses any other kind of file', async () => {
      const importer = await signedIn();

      const refused = await importer
        .start([
          { name: 'export.txt', size: 10 },
          { name: 'hands.pdf', size: 10 },
        ])
        .expect(400);

      expect(refused.body.reason).toBe('unsupported-file');
      expect((await importer.list().expect(200)).body).toEqual([]);
    });

    it('takes files adding up to 2.5 GB', async () => {
      const importer = await signedIn();

      await importer
        .start([
          { name: 'one.txt', size: 2 * GB },
          { name: 'two.txt', size: 0.5 * GB },
        ])
        .expect(201);
    });

    it('refuses files adding up to more than 2.5 GB, before any upload', async () => {
      const importer = await signedIn();

      const refused = await importer
        .start([
          { name: 'one.txt', size: 2 * GB },
          { name: 'two.txt', size: 0.5 * GB + 1 },
        ])
        .expect(413);

      expect(refused.body.reason).toBe('bulk-import-too-large');
      expect((await importer.list().expect(200)).body).toEqual([]);
    });
  });

  describe('an interrupted upload', () => {
    const text = Buffer.from(manyHands(40));
    const half = Math.floor(text.length / 2);
    const files = [{ name: 'export.txt', size: text.length }];

    it('continues where it stopped when the same files are chosen again', async () => {
      const importer = await signedIn();
      const first = await importer.start(files).expect(201);
      const id = first.body.id as string;
      const etag1 = await sendPart(importer, id, 0, 1, text.subarray(0, half));

      const again = await importer.start(files).expect(201);
      expect(again.body.id).toBe(id);
      const parts = await importer.uploadedParts(id, 0).expect(200);
      expect(parts.body).toEqual({ parts: [{ partNumber: 1, etag: etag1 }] });

      const etag2 = await sendPart(importer, id, 0, 2, text.subarray(half));
      await importer
        .complete(id, [
          {
            parts: [
              { partNumber: 1, etag: etag1 },
              { partNumber: 2, etag: etag2 },
            ],
          },
        ])
        .expect(201);
      await service!.settled();

      expect(await importer.libraryTotal()).toBe(40);
      expect((await importer.list().expect(200)).body).toHaveLength(1);
    });

    it('starts afresh when the files chosen differ in name or size', async () => {
      const importer = await signedIn();
      const first = await importer.start(files).expect(201);

      const renamed = await importer
        .start([{ name: 'other.txt', size: text.length }])
        .expect(201);
      const resized = await importer
        .start([{ name: 'export.txt', size: text.length + 1 }])
        .expect(201);

      expect(renamed.body.id).not.toBe(first.body.id);
      expect(resized.body.id).not.toBe(first.body.id);
    });

    it('is not continued by another Account choosing the same files', async () => {
      const one = await signedIn();
      const other = await signedIn();
      const first = await one.start(files).expect(201);

      const theirs = await other.start(files).expect(201);

      expect(theirs.body.id).not.toBe(first.body.id);
      await other.uploadedParts(first.body.id as string, 0).expect(404);
    });

    it('lists no parts of an import already uploaded', async () => {
      const importer = await signedIn();
      const started = await importer.start(files).expect(201);
      const id = started.body.id as string;
      const etag = await sendPart(importer, id, 0, 1, text);
      await importer
        .complete(id, [{ parts: [{ partNumber: 1, etag }] }])
        .expect(201);

      await importer.uploadedParts(id, 0).expect(404);
    });
  });

  describe('an upload never completed', () => {
    const HOUR = 60 * 60_000;
    const files = [{ name: 'export.txt', size: 100 }];

    it('is discarded after 24 hours, with what it had uploaded', async () => {
      const importer = await signedIn();
      const started = await importer.start(files).expect(201);
      await sendPart(importer, started.body.id, 0, 1, Buffer.from('half'));

      await api.clock.advance(25 * HOUR);

      expect((await importer.list().expect(200)).body).toEqual([]);
      expect(store.unfinishedUploads()).toEqual([]);
      await importer.uploadedParts(started.body.id, 0).expect(404);
    });

    it('can still be continued within 24 hours', async () => {
      const importer = await signedIn();
      const started = await importer.start(files).expect(201);

      await api.clock.advance(23 * HOUR);

      const again = await importer.start(files).expect(201);
      expect(again.body.id).toBe(started.body.id);
      expect(store.unfinishedUploads()).toHaveLength(1);
    });

    it('leaves imports already uploaded alone', async () => {
      const importer = await signedIn();
      const text = Buffer.from(manyHands(3));
      const started = await importer
        .start([{ name: 'export.txt', size: text.length }])
        .expect(201);
      const etag = await sendPart(importer, started.body.id, 0, 1, text);
      await importer
        .complete(started.body.id, [{ parts: [{ partNumber: 1, etag }] }])
        .expect(201);
      await service!.settled();

      await api.clock.advance(25 * HOUR);

      expect((await importer.list().expect(200)).body).toEqual([
        expect.objectContaining({ status: 'completed' }),
      ]);
    });
  });
});
