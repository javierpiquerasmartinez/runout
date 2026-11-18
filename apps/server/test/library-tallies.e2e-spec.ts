import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import type { Database } from '../src/database/database.js';
import * as schema from '../src/database/schema.js';
import { hands, libraryEntries } from '../src/database/schema.js';
import { freshHandHistory } from './support/hand-histories.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Stake {
  limit: string;
  smallBlind: number;
  bigBlind: number;
  currency: string;
}

interface LibraryPage {
  hands: { id: string; site: string }[];
  options: { sites: string[]; heroes: string[]; stakes: Stake[] };
  counts: { all: number; marked: number };
}

const EUR_STAKE: Stake = {
  limit: 'no-limit',
  smallBlind: 5,
  bigBlind: 10,
  currency: 'EUR',
};
const USDT_STAKE: Stake = { ...EUR_STAKE, currency: 'USDT' };

/*
 * What the Library offers to filter by, and how many Hands it holds, come
 * from tallies that triggers keep as Hands come in, go out or are rewritten.
 * These check that they always say what reading every Hand would say.
 */
describe('What the Library offers to filter by, as it changes (e2e)', () => {
  let running: RunningApp;
  let db: Database;

  beforeEach(async () => {
    running = await startApp();
    db = drizzle({
      client: new pg.Pool({ connectionString: running.databaseUrl }),
      schema,
    });
  });

  afterEach(async () => {
    await db.$client.end();
    await running.close();
  });

  async function importText(token: string, text: string): Promise<void> {
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

  async function list(token: string, query: string = ''): Promise<LibraryPage> {
    const res = await request(running.httpServer)
      .get(`/api/library/hands?pageSize=200&${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as LibraryPage;
  }

  async function remove(token: string, handIds: string[]): Promise<void> {
    await request(running.httpServer)
      .delete('/api/library/hands')
      .set('Authorization', `Bearer ${token}`)
      .send({ handIds })
      .expect(200);
  }

  /** The Account's id, read from the Library entry of one of its Hands. */
  async function accountOf(handId: string): Promise<string> {
    const [{ identityId }] = await db
      .select({ identityId: libraryEntries.identityId })
      .from(libraryEntries)
      .where(eq(libraryEntries.handId, handId));
    return identityId;
  }

  /** The tallies, and the same counted from every Hand of the Library. */
  async function talliesAndRecount(identityId: string) {
    const order = sql`site, hero_screen_name, stake_limit, small_blind, big_blind, currency`;
    const tallies = await db.execute(
      sql`select site, hero_screen_name, stake_limit, small_blind, big_blind, currency, hands
          from library_tallies where identity_id = ${identityId} order by ${order}`,
    );
    const recount = await db.execute(
      sql`select h.site, h.hero_screen_name, h.content -> 'stake' ->> 'limit' as stake_limit,
                 h.small_blind, h.big_blind, h.currency, count(*)::integer as hands
          from library_entries e join hands h on h.id = e.hand_id
          where e.identity_id = ${identityId}
          group by 1, 2, 3, 4, 5, 6 order by ${order}`,
    );
    return { tallies: tallies.rows, recount: recount.rows };
  }

  it('stops offering a Poker Site, Hero and Stake once the last Hand that has them is removed', async () => {
    const account = await newAccount(running.httpServer);
    await importText(account.token, freshHandHistory('pokerstars-session.txt'));
    await importText(account.token, freshHandHistory('coinpoker-session.txt'));
    const before = await list(account.token);
    const coin = before.hands.filter((hand) => hand.site === 'coinpoker');
    const stars = before.hands.filter((hand) => hand.site === 'pokerstars');
    expect(before.options.sites).toEqual(['coinpoker', 'pokerstars']);

    // One CoinPoker Hand left: still offered.
    await remove(
      account.token,
      coin.slice(1).map((hand) => hand.id),
    );
    const one = await list(account.token);
    expect(one.options).toMatchObject({
      sites: ['coinpoker', 'pokerstars'],
      heroes: ['Hero', 'iMapleAA'],
      stakes: [EUR_STAKE, USDT_STAKE],
    });
    expect(one.counts.all).toBe(stars.length + 1);

    await remove(account.token, [coin[0].id]);
    const none = await list(account.token);
    expect(none.options).toMatchObject({
      sites: ['pokerstars'],
      heroes: ['iMapleAA'],
      stakes: [EUR_STAKE],
    });
    expect(none.counts.all).toBe(stars.length);

    const identityId = await accountOf(stars[0].id);
    const { tallies, recount } = await talliesAndRecount(identityId);
    expect(tallies).toEqual(recount);
  });

  it('counts a Hand in every Library that holds it, and removing it from one leaves the other', async () => {
    const text = freshHandHistory('coinpoker-session.txt');
    const first = await newAccount(running.httpServer);
    const second = await newAccount(running.httpServer);
    await importText(first.token, text);
    await importText(second.token, text);
    const ids = (await list(first.token)).hands.map((hand) => hand.id);
    expect((await list(second.token)).counts.all).toBe(ids.length);

    await remove(first.token, ids);

    expect((await list(first.token)).options).toMatchObject({
      sites: [],
      heroes: [],
      stakes: [],
    });
    expect((await list(first.token)).counts.all).toBe(0);
    const kept = await list(second.token);
    expect(kept.options).toMatchObject({
      sites: ['coinpoker'],
      heroes: ['Hero'],
      stakes: [USDT_STAKE],
    });
    expect(kept.counts.all).toBe(ids.length);
  });

  it('follows a Hand rewritten with another Stake', async () => {
    const account = await newAccount(running.httpServer);
    await importText(account.token, freshHandHistory('pokerstars-session.txt'));
    const page = await list(account.token);
    const [rewritten, ...rest] = page.hands;
    const identityId = await accountOf(rewritten.id);

    // As a re-read that found the Stake read wrong would rewrite it.
    await db
      .update(hands)
      .set({
        smallBlind: 10,
        bigBlind: 20,
        content: sql`jsonb_set(${hands.content}, '{stake,limit}', '"pot-limit"')`,
      })
      .where(eq(hands.id, rewritten.id));

    expect((await list(account.token)).options.stakes).toEqual([
      EUR_STAKE,
      { limit: 'pot-limit', smallBlind: 10, bigBlind: 20, currency: 'EUR' },
    ]);
    let counted = await talliesAndRecount(identityId);
    expect(counted.tallies).toEqual(counted.recount);

    // Rewriting the rest the same way leaves nothing at the old Stake.
    await db
      .update(hands)
      .set({
        smallBlind: 10,
        bigBlind: 20,
        content: sql`jsonb_set(${hands.content}, '{stake,limit}', '"pot-limit"')`,
      })
      .where(
        and(
          inArray(
            hands.id,
            rest.map((hand) => hand.id),
          ),
          eq(hands.smallBlind, 5),
        ),
      );
    expect((await list(account.token)).options.stakes).toEqual([
      { limit: 'pot-limit', smallBlind: 10, bigBlind: 20, currency: 'EUR' },
    ]);
    counted = await talliesAndRecount(identityId);
    expect(counted.tallies).toEqual(counted.recount);
  });
});
