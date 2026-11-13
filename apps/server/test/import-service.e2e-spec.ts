import pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import { ImportServiceWaker } from '../src/import-service/import-service-waker.js';
import { startApp, type RunningApp } from './support/app.js';
import { freshDatabase } from './support/fresh-database.js';
import {
  startImportService,
  type RunningImportService,
} from './support/import-service.js';

const SECRET = 'a-shared-secret-for-tests';

describe('The import service (e2e)', () => {
  let service: RunningImportService;

  afterEach(async () => {
    await service?.close();
  });

  it('acknowledges a wake carrying the shared secret', async () => {
    service = await startImportService({ secret: SECRET });

    await request(service.httpServer)
      .post('/wake')
      .set('Authorization', `Bearer ${SECRET}`)
      .expect(204);
  });

  it('refuses a wake without the shared secret, or with another one', async () => {
    service = await startImportService({ secret: SECRET });

    await request(service.httpServer).post('/wake').expect(401);
    await request(service.httpServer)
      .post('/wake')
      .set('Authorization', 'Bearer not-the-secret')
      .expect(401);
  });

  it('has no Rooms and none of the public routes', async () => {
    service = await startImportService({ secret: SECRET });

    await request(service.httpServer).get('/api/health').expect(404);
    await request(service.httpServer).get('/api/library/hands').expect(404);
    await request(service.httpServer).get('/ws').expect(404);
  });

  it('runs no database query once started and idle', async () => {
    const database = await freshDatabase();
    const name = new URL(database.url).pathname.slice(1);
    const observer = new pg.Client(inject('databaseUrl'));
    await observer.connect();
    try {
      service = await startImportService({
        secret: SECRET,
        databaseUrl: database.url,
      });
      // Starting, it looks once for an import to go on with.
      await service.settled();

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
      await service?.close();
      await observer.end();
      await database.drop();
    }
  });

  describe('woken by the API', () => {
    let api: RunningApp;

    afterEach(async () => {
      await api?.close();
    });

    it('is woken by the API through its address', async () => {
      service = await startImportService({ secret: SECRET });
      api = await startApp({
        importService: { address: service.address, secret: SECRET },
      });

      expect(await api.app.get(ImportServiceWaker).wake()).toBe(true);
      expect(service.wakes()).toBe(1);
    });

    it('a wake that fails does not fail the API', async () => {
      service = await startImportService({ secret: SECRET });
      api = await startApp({
        importService: { address: service.address, secret: 'another-secret' },
      });

      expect(await api.app.get(ImportServiceWaker).wake()).toBe(false);
      expect(service.wakes()).toBe(0);
    });

    it('a wake when the service is down does not fail the API', async () => {
      service = await startImportService({ secret: SECRET });
      const address = service.address;
      await service.close();
      api = await startApp({ importService: { address, secret: SECRET } });

      expect(await api.app.get(ImportServiceWaker).wake()).toBe(false);
    });
  });
});
