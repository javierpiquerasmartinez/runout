import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import type { Database } from '../src/database/database.js';
import * as schema from '../src/database/schema.js';
import { backfillFinalPots } from '../src/hands/final-pot-backfill.js';
import { freshHandHistory } from './support/hand-histories.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface LibraryHand {
  id: string;
  playedAt: string;
  stake: { smallBlind: number; bigBlind: number; currency: string };
  result: number;
  summary: { finalPot: number };
}

interface LibraryPage {
  total: number;
  hands: LibraryHand[];
}

/*
 * The fixtures this file imports: 19 Hands at big blinds of 10 (in EUR, USD
 * and USDT), 25 and 50, so ordering in big blinds and in Amounts disagree.
 */
const FIXTURES = [
  'pokerstars-session.txt',
  'pokerstars-all-ins.txt',
  'pokerstars-edge-cases.txt',
  'ggpoker-session.txt',
  'coinpoker-session.txt',
];

async function importText(
  running: RunningApp,
  token: string,
  text: string,
): Promise<void> {
  const preview = await request(running.httpServer)
    .post('/api/library/imports/previews')
    .set('Authorization', `Bearer ${token}`)
    .send({ text })
    .expect(201);
  await request(running.httpServer)
    .post('/api/library/imports')
    .set('Authorization', `Bearer ${token}`)
    .send({ previews: [preview.body.id as string] })
    .expect(201);
}

describe('Sorting the Library (e2e)', () => {
  let running: RunningApp;
  /** One Library for every test here: sorting only reads it. */
  let account: { token: string };

  beforeAll(async () => {
    running = await startApp();
    account = await stockedAccount();
    // Five imports, which can take a while beside the other files.
  }, 30_000);

  afterAll(async () => {
    await running.close();
  });

  async function stockedAccount(): Promise<{ token: string }> {
    const account = await newAccount(running.httpServer);
    for (const name of FIXTURES) {
      await importText(running, account.token, freshHandHistory(name));
    }
    return account;
  }

  async function list(token: string, query: string): Promise<LibraryPage> {
    const res = await request(running.httpServer)
      .get(`/api/library/hands?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as LibraryPage;
  }

  const resultInBigBlinds = (hand: LibraryHand) =>
    hand.result / hand.stake.bigBlind;
  const potInBigBlinds = (hand: LibraryHand) =>
    hand.summary.finalPot / hand.stake.bigBlind;

  it('sorts by Result in big blinds, the biggest first or the smallest', async () => {
    const desc = await list(account.token, 'sort=result&dir=desc');
    const asc = await list(account.token, 'sort=result&dir=asc');

    expect(desc.total).toBe(19);
    expect(desc.hands.map(resultInBigBlinds)).toEqual([
      106, 95, 36.9, 9.8, 7.4, 6.12, 3.1, 1, 0, 0, 0, -0.5, -1, -1, -1, -3, -42,
      -100, -100,
    ]);
    expect(asc.hands.map(resultInBigBlinds)).toEqual([
      -100, -100, -42, -3, -1, -1, -1, -0.5, 0, 0, 0, 1, 3.1, 6.12, 7.4, 9.8,
      36.9, 95, 106,
    ]);
  });

  it('sorts by final pot in big blinds', async () => {
    const desc = await list(account.token, 'sort=pot&dir=desc');

    expect(desc.hands.map(potInBigBlinds)).toEqual([
      311, 203.5, 200, 200, 86.5, 81, 60.5, 38.3, 13.4, 12.8, 6.5, 6.5, 5.5, 3,
      2.5, 2.5, 2.5, 2, 2,
    ]);
  });

  it('sorts by Stake on its big blind, whatever the currency', async () => {
    const desc = await list(account.token, 'sort=stake&dir=desc');
    const asc = await list(account.token, 'sort=stake&dir=asc');

    const blinds = (page: LibraryPage) =>
      page.hands.map((hand) => hand.stake.bigBlind);
    expect(blinds(desc)).toEqual([
      ...Array<number>(5).fill(50),
      25,
      25,
      ...Array<number>(12).fill(10),
    ]);
    expect(blinds(asc)).toEqual([
      ...Array<number>(12).fill(10),
      25,
      25,
      ...Array<number>(5).fill(50),
    ]);
  });

  it('breaks ties newest first, whichever the direction', async () => {
    for (const dir of ['desc', 'asc']) {
      const page = await list(account.token, `sort=result&dir=${dir}`);
      const even = page.hands.filter((hand) => hand.result === 0);
      expect(even.map((hand) => hand.playedAt)).toEqual([
        '2026-10-19T16:01:55.000Z',
        '2026-10-19T15:58:52.000Z',
        '2026-09-18T12:29:04.000Z',
      ]);
    }
  });

  it('sorts by date, newest first unless asked otherwise', async () => {
    const unsorted = await list(account.token, '');
    const newest = await list(account.token, 'sort=date&dir=desc');
    const oldest = await list(account.token, 'sort=date&dir=asc');

    const dates = (page: LibraryPage) =>
      page.hands.map((hand) => hand.playedAt);
    expect(dates(newest)).toEqual(dates(unsorted));
    expect(dates(newest)[0]).toBe('2026-10-19T17:08:03.000Z');
    expect(dates(oldest)).toEqual([...dates(newest)].reverse());
  });

  it('pages through the sorted Hands, not the newest ones', async () => {
    const first = await list(account.token, 'sort=result&dir=desc&pageSize=5');
    const second = await list(
      account.token,
      'sort=result&dir=desc&pageSize=5&page=2',
    );

    expect([...first.hands, ...second.hands].map(resultInBigBlinds)).toEqual([
      106, 95, 36.9, 9.8, 7.4, 6.12, 3.1, 1, 0, 0,
    ]);
  });

  it('refuses a sort it cannot read', async () => {
    for (const query of [
      'sort=hero',
      'sort=result&dir=up',
      'sort=pot&sort=date',
    ]) {
      const res = await request(running.httpServer)
        .get(`/api/library/hands?${query}`)
        .set('Authorization', `Bearer ${account.token}`)
        .expect(400);
      expect(res.body).toEqual({ reason: 'invalid-library-sort' });
    }
  });
});

describe('Backfilling the final pot of Hands stored before it was kept (e2e)', () => {
  let running: RunningApp;
  let db: Database;

  beforeEach(async () => {
    running = await startApp();
    db = drizzle({
      client: new pg.Pool({ connectionString: inject('databaseUrl') }),
      schema,
    });
  });

  afterEach(async () => {
    await db.$client.end();
    await running.close();
  });

  it('fills in every missing final pot, which until then sorts last', async () => {
    const account = await newAccount(running.httpServer);
    await importText(
      running,
      account.token,
      freshHandHistory('pokerstars-session.txt'),
    );
    const sortedByPot = async () =>
      (
        await request(running.httpServer)
          .get('/api/library/hands?sort=pot&dir=desc')
          .set('Authorization', `Bearer ${account.token}`)
          .expect(200)
      ).body.hands as LibraryHand[];
    const pots = (hands: LibraryHand[]) =>
      hands.map((hand) => hand.summary.finalPot);
    const before = await sortedByPot();
    const sorted = pots(before);
    expect(sorted).toEqual([65, 65, 55, 25]);
    // As Hands stored before migration 0018 would be; only this test's, as other files share the database.
    const forget = (forgotten: LibraryHand[]) =>
      db
        .update(schema.hands)
        .set({ finalPot: null })
        .where(
          inArray(
            schema.hands.id,
            forgotten.map((hand) => hand.id),
          ),
        );
    await forget(before.slice(0, 2));
    expect(pots(await sortedByPot())).toEqual([55, 25, 65, 65]);
    await forget(before);

    const filled = await backfillFinalPots(db);

    expect(filled).toBeGreaterThanOrEqual(4);
    expect(pots(await sortedByPot())).toEqual(sorted);
    expect(await backfillFinalPots(db)).toBe(0);
  });
});
