import pg from 'pg';
import request from 'supertest';
import { freshHandHistory, manyHands } from './support/hand-histories.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Stats {
  hands: number;
  stats: Record<string, { opportunities: number; taken: number }>;
}

describe('How many Hands one import adds to a Library (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  function preview(token: string, text: string) {
    return request(running.httpServer)
      .post('/api/library/imports/previews')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(text), 'session.txt');
  }

  function confirm(token: string, previews: string[]) {
    return request(running.httpServer)
      .post('/api/library/imports')
      .set('Authorization', `Bearer ${token}`)
      .send({ previews });
  }

  async function stats(token: string): Promise<Stats> {
    const res = await request(running.httpServer)
      .get('/api/library/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as Stats;
  }

  async function libraryTotal(token: string): Promise<number> {
    const res = await request(running.httpServer)
      .get('/api/library/hands')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.total as number;
  }

  it('saves all 2,000 Hands of an import, with their Hero Stats', async () => {
    const reference = await newAccount(running.httpServer);
    const one = await preview(
      reference.token,
      freshHandHistory('pokerstars-session.txt'),
    ).expect(201);
    await confirm(reference.token, [one.body.id as string]).expect(201);
    const perSession = await stats(reference.token);

    const account = await newAccount(running.httpServer);
    const read = await preview(account.token, manyHands(2000)).expect(201);
    expect(read.body.hands).toHaveLength(2000);
    const confirmed = await confirm(account.token, [
      read.body.id as string,
    ]).expect(201);

    expect(confirmed.body).toEqual({ imported: 2000 });
    expect(await libraryTotal(account.token)).toBe(2000);
    const all = await stats(account.token);
    expect(all.hands).toBe(2000);
    expect(all.stats.vpip).toEqual({
      opportunities: perSession.stats.vpip.opportunities * 500,
      taken: perSession.stats.vpip.taken * 500,
    });
  }, 120_000);

  it('saves 2,000 Hands whose Hero Stats alone would pass the database’s limit on one write', async () => {
    const account = await newAccount(running.httpServer);
    const read = await preview(
      account.token,
      manyHands(2000, 'pokerstars-pot-limit.txt'),
    ).expect(201);

    await confirm(account.token, [read.body.id as string]).expect(201);

    const all = await stats(account.token);
    expect(all.hands).toBe(2000);
    expect(all.stats.vpip.opportunities).toBe(2000);
  }, 120_000);

  it('refuses to confirm more than 2,000 Hands at once, and saves none of them', async () => {
    const account = await newAccount(running.httpServer);
    const first = await preview(account.token, manyHands(1500)).expect(201);
    const second = await preview(account.token, manyHands(501)).expect(201);
    const ids = [first.body.id as string, second.body.id as string];

    const refused = await confirm(account.token, ids).expect(400);

    expect(refused.body).toMatchObject({
      reason: 'too-many-hands',
      hands: 2001,
      limit: 2000,
    });
    expect(await libraryTotal(account.token)).toBe(0);
    // Nothing was taken: the Importer can drop a file and confirm the rest.
    await confirm(account.token, [ids[0]]).expect(201);
    expect(await libraryTotal(account.token)).toBe(1500);
  }, 120_000);

  describe('on a Library that holds at most 6 Hands', () => {
    let small: RunningApp;
    let main: RunningApp;

    beforeEach(async () => {
      main = running;
      small = await startApp({ libraryCapacity: 6 });
      running = small;
    });

    afterEach(async () => {
      running = main;
      await small.close();
    });

    it('refuses an import that would take it past what it holds, and says how many it holds', async () => {
      const account = await newAccount(running.httpServer);
      const first = await preview(account.token, manyHands(4)).expect(201);
      await confirm(account.token, [first.body.id as string]).expect(201);
      const second = await preview(account.token, manyHands(3)).expect(201);

      const refused = await confirm(account.token, [
        second.body.id as string,
      ]).expect(409);

      expect(refused.body).toMatchObject({
        reason: 'library-full',
        hands: 3,
        held: 4,
        limit: 6,
      });
      expect(await libraryTotal(account.token)).toBe(4);
    });
  });

  it('saves nothing when confirming fails halfway', async () => {
    const own = await startApp({ ownDatabase: true });
    const db = new pg.Client(own.databaseUrl);
    await db.connect();
    try {
      // Hands and Hero Stats are written before the Library references,
      // which this makes fail.
      await db.query(`
        create function refuse_entries() returns trigger language plpgsql as
          $$ begin raise exception 'refused'; end $$;
        create trigger refuse_entries before insert on library_entries
          for each statement execute function refuse_entries();`);
      const account = await newAccount(own.httpServer);
      const read = await request(own.httpServer)
        .post('/api/library/imports/previews')
        .set('Authorization', `Bearer ${account.token}`)
        .attach('file', Buffer.from(manyHands(2000)), 'session.txt')
        .expect(201);

      await request(own.httpServer)
        .post('/api/library/imports')
        .set('Authorization', `Bearer ${account.token}`)
        .send({ previews: [read.body.id as string] })
        .expect(500);

      const counts = await db.query<{ hands: string; stats: string }>(
        'select (select count(*) from hands) as hands, (select count(*) from hand_stats) as stats',
      );
      expect(counts.rows[0]).toEqual({ hands: '0', stats: '0' });
    } finally {
      await db.end();
      await own.close();
    }
  }, 120_000);

  it('keeps answering other requests while All-in EV is worked out for many preflop all-ins', async () => {
    const account = await newAccount(running.httpServer);
    // Each copy has a preflop all-in, worked out over every board to come.
    const read = await preview(
      account.token,
      manyHands(40, 'pokerstars-all-ins.txt'),
    ).expect(201);

    let confirming = true;
    const confirmed = Promise.resolve(
      confirm(account.token, [read.body.id as string]).expect(201),
    ).finally(() => (confirming = false));
    const waits: number[] = [];
    while (confirming) {
      const asked = performance.now();
      await request(running.httpServer).get('/api/health').expect(200);
      waits.push(performance.now() - asked);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await confirmed;

    expect(waits.length).toBeGreaterThan(5);
    expect(Math.max(...waits)).toBeLessThan(300);
  }, 120_000);
});
