import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import type { Database } from '../src/database/database.js';
import * as schema from '../src/database/schema.js';
import { rederiveFacts } from '../src/hands/facts-rederive.js';
import { freshHandHistory } from './support/hand-histories.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Stats {
  hands: number;
  stats: Record<string, { opportunities: number; taken: number }>;
  handsWith: Record<string, { opportunity: number; taken: number }>;
}

/** Every fixture that holds Hands Runout reads. */
const FIXTURES = [
  'pokerstars-session.txt',
  'pokerstars-showdown.txt',
  'pokerstars-edge-cases.txt',
  'pokerstars-all-ins.txt',
  'pokerstars-pot-limit.txt',
  'pokerstars-ten-max.txt',
  'ggpoker-session.txt',
  'winamax-session.txt',
  'coinpoker-session.txt',
  'coinpoker-ante.txt',
];

/*
 * The Stats are counted from each Hand's facts row (ADR 0012), which took
 * over from the per-Stat rows of `hand_stats`. Until those rows are retired,
 * this checks both sources agree on every fixture. A Hand whose facts row
 * is missing or older than a Stat needs counts towards no such Stat until
 * the re-derive job reaches it.
 */
describe('The Library’s Stats, counted from the facts (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    // A database of its own: the re-derive job reads every stored Hand.
    running = await startApp({ ownDatabase: true });
  });

  afterEach(async () => {
    await running.close();
  });

  function get(token: string, path: string) {
    return request(running.httpServer)
      .get(path)
      .set('Authorization', `Bearer ${token}`);
  }

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

  async function stockedAccount(): Promise<{ token: string }> {
    const account = await newAccount(running.httpServer);
    for (const file of FIXTURES) {
      await importText(account.token, freshHandHistory(file));
    }
    return account;
  }

  async function stats(token: string, query = ''): Promise<Stats> {
    return (await get(token, `/api/library/stats?${query}`).expect(200))
      .body as Stats;
  }

  async function handIds(token: string, query = ''): Promise<string[]> {
    const res = await get(token, `/api/library/hand-ids?${query}`).expect(200);
    return (res.body.ids as string[]).sort();
  }

  async function withDatabase<T>(work: (db: pg.Client) => Promise<T>) {
    const db = new pg.Client(running.databaseUrl);
    await db.connect();
    try {
      return await work(db);
    } finally {
      await db.end();
    }
  }

  /** The per-Stat rows of these Hands: each Stat's sums, and its Hands on each side. */
  async function perStatRows(ids: string[]) {
    const rows = await withDatabase(
      async (db) =>
        (
          await db.query<{
            stat: string;
            hand_id: string;
            opportunities: number;
            taken: number;
          }>(
            'select stat, hand_id, opportunities, taken from hand_stats where hand_id = any($1)',
            [ids],
          )
        ).rows,
    );
    const byStat = new Map<
      string,
      {
        opportunities: number;
        taken: number;
        opportunity: string[];
        took: string[];
      }
    >();
    for (const row of rows) {
      const stat = byStat.get(row.stat) ?? {
        opportunities: 0,
        taken: 0,
        opportunity: [],
        took: [],
      };
      stat.opportunities += row.opportunities;
      stat.taken += row.taken;
      if (row.opportunities > 0) stat.opportunity.push(row.hand_id);
      if (row.taken > 0) stat.took.push(row.hand_id);
      byStat.set(row.stat, stat);
    }
    return byStat;
  }

  it('counts every Stat as the per-Stat rows do, on every fixture', async () => {
    const account = await stockedAccount();
    const ids = await handIds(account.token);
    const fromFacts = await stats(account.token);
    const fromRows = await perStatRows(ids);
    expect(fromFacts.hands).toBe(ids.length);

    for (const key of Object.keys(fromFacts.stats)) {
      const rows = fromRows.get(key) ?? {
        opportunities: 0,
        taken: 0,
        opportunity: [],
        took: [],
      };
      expect(fromFacts.stats[key], key).toEqual({
        opportunities: rows.opportunities,
        taken: rows.taken,
      });
      expect(fromFacts.handsWith[key], key).toEqual({
        opportunity: rows.opportunity.length,
        taken: rows.took.length,
      });
      // The Stat criterion keeps the same Hands on each side.
      expect(
        await handIds(account.token, `stat=${key}:opportunity`),
        key,
      ).toEqual(rows.opportunity.sort());
      expect(await handIds(account.token, `stat=${key}:taken`), key).toEqual(
        rows.took.sort(),
      );
    }
    // Enough happens across the fixtures for the comparison to mean something.
    expect(fromFacts.stats.vpip.opportunities).toBeGreaterThan(20);
    expect(fromFacts.stats['cbet-flop'].opportunities).toBeGreaterThan(0);
    expect(fromFacts.stats.afq.opportunities).toBeGreaterThan(
      fromFacts.handsWith.afq.opportunity,
    );
  }, 120_000);

  it('reads a Hand’s Stats off its facts row, not its per-Stat rows', async () => {
    const account = await newAccount(running.httpServer);
    await importText(
      account.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );
    const before = await stats(account.token);
    const [handId] = await handIds(account.token);

    await withDatabase((db) =>
      db.query('delete from hand_stats where hand_id = $1', [handId]),
    );

    expect(await stats(account.token)).toEqual(before);
    expect(await handIds(account.token, 'stat=vpip:taken')).toEqual([handId]);
  });

  it('counts a Hand whose facts row is missing, or older than a Stat needs, towards no such Stat until the re-derive job reaches it', async () => {
    const account = await newAccount(running.httpServer);
    await importText(account.token, freshHandHistory('pokerstars-session.txt'));
    const before = await stats(account.token);
    const ids = await handIds(account.token);
    const opened = await handIds(account.token, 'stat=pfr:taken');
    const postflop = await handIds(account.token, 'stat=afq:opportunity');
    expect(opened).toHaveLength(2);
    expect(postflop).toContain(opened[0]);
    expect(postflop).toContain(opened[1]);

    // One Hand stored before the facts, and one whose row version 4 worked
    // out: it has the per-Street counters AFq reads, not the preflop Actions.
    await withDatabase(async (db) => {
      await db.query('delete from hand_facts where hand_id = $1', [opened[0]]);
      await db.query('update hand_facts set version = 4 where hand_id = $1', [
        opened[1],
      ]);
    });

    const behind = await stats(account.token);
    expect(behind.hands).toBe(before.hands);
    expect(behind.stats.pfr.taken).toBe(before.stats.pfr.taken - 2);
    expect(behind.handsWith.pfr.taken).toBe(0);
    expect(await handIds(account.token, 'stat=pfr:taken')).toEqual([]);
    expect(await handIds(account.token, 'stat=afq:opportunity')).toEqual(
      postflop.filter((id) => id !== opened[0]),
    );
    expect(await handIds(account.token)).toEqual(ids);

    const pool = new pg.Pool({ connectionString: running.databaseUrl });
    try {
      await rederiveFacts(drizzle({ client: pool, schema }) as Database);
    } finally {
      await pool.end();
    }

    expect(await stats(account.token)).toEqual(before);
    expect(await handIds(account.token, 'stat=pfr:taken')).toEqual(opened);
  });
});
