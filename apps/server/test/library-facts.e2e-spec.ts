import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import type { Database } from '../src/database/database.js';
import * as schema from '../src/database/schema.js';
import { handFacts, hands } from '../src/database/schema.js';
import { rederiveFacts } from '../src/hands/facts-rederive.js';
import { FACTS_VERSION } from '../src/hands/replay/hero-facts.js';
import { rereadHands } from '../src/hands/reread-backfill.js';
import { freshHandHistory } from './support/hand-histories.js';
import { freshDatabase } from './support/fresh-database.js';
import { HeldFileStore } from './support/held-file-store.js';
import { startImportService } from './support/import-service.js';
import { RoomClient } from './support/room-client.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

/*
 * The fixtures this file imports, ten PokerStars Hands, with each Hero's
 * Position, the pot type and the opener's Position read by hand:
 *
 * pokerstars-session.txt (iMapleAA): single-raised from the BB, opened from
 *   the BTN; single-raised from the CO, opened from the BTN; opened from the
 *   CO; opened from the BTN with AcKh.
 * pokerstars-all-ins.txt (HeroAI, heads-up): opened from the BTN with KdKc
 *   and 3-bet; single-raised from the BB, opened from the BTN.
 * pokerstars-edge-cases.txt: HeroHU opens the BTN heads-up with AhKd;
 *   Hero9max 4-bets from the HJ after Elm_UTG's open; Hero6 opens the BTN
 *   over a straddle; Hero4 raises a limper from the BTN.
 */
const FIXTURES = [
  'pokerstars-session.txt',
  'pokerstars-all-ins.txt',
  'pokerstars-edge-cases.txt',
];

describe('Filtering the Library by the Hero’s facts (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
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

  async function stockedAccount(): Promise<{ token: string }> {
    const account = await newAccount(running.httpServer);
    for (const file of FIXTURES) {
      await importText(account.token, freshHandHistory(file));
    }
    return account;
  }

  function get(token: string, path: string) {
    return request(running.httpServer)
      .get(path)
      .set('Authorization', `Bearer ${token}`);
  }

  /** The Hands each endpoint keeps for the query, as sorted ids or a count. */
  async function kept(token: string, query: string) {
    const list = await get(
      token,
      `/api/library/hands?pageSize=100&${query}`,
    ).expect(200);
    const ids = await get(token, `/api/library/hand-ids?${query}`).expect(200);
    const results = await get(
      token,
      `/api/library/results?points=1000&${query}`,
    ).expect(200);
    const stats = await get(token, `/api/library/stats?${query}`).expect(200);
    return {
      list: (list.body.hands as { id: string }[]).map((h) => h.id).sort(),
      total: list.body.total as number,
      handIds: (ids.body.ids as string[]).sort(),
      results: (results.body.points as { handId: string }[])
        .map((point) => point.handId)
        .sort(),
      resultsCount: results.body.hands as number,
      statsCount: stats.body.hands as number,
    };
  }

  const fact = (criterion: string) => `fact=${encodeURIComponent(criterion)}`;

  it('keeps the same Hands in the list, the Results Graph, the Stats and the hand ids', async () => {
    const account = await stockedAccount();
    const cases: [string, number][] = [
      ['', 10],
      [fact('pot-type:3-bet'), 1],
      [fact('hero-position:BB'), 2],
      [fact('opener-position:CO'), 1],
      // Any of several values.
      [fact('pot-type:3-bet,4-bet'), 2],
      [fact('hero-class:KK,AKo'), 3],
      [fact('players:2..2'), 3],
      [fact('players:6..'), 2],
      [fact('hero-aggressor:true'), 6],
      // An exclusion.
      [fact('!pot-type:single-raised'), 2],
      [fact('!opener-position:BTN'), 2],
      // Two criteria together.
      [`${fact('opener-position:BTN')}&${fact('hero-position:BB')}`, 2],
      [`${fact('hero-position:BTN')}&${fact('!pot-type:single-raised')}`, 1],
      // With the table's own criteria.
      [`${fact('hero-position:BTN')}&hero=iMapleAA`, 1],
    ];
    for (const [query, count] of cases) {
      const got = await kept(account.token, query);
      expect(got.total, query).toBe(count);
      expect(got.list, query).toHaveLength(count);
      expect(got.handIds, query).toEqual(got.list);
      expect(got.results, query).toEqual(got.list);
      expect(got.resultsCount, query).toBe(count);
      expect(got.statsCount, query).toBe(count);
    }
  }, 30_000);

  it('filters by the Board’s texture on each Street', async () => {
    const account = await newAccount(running.httpServer);
    // The session's flops, as dealt: Qs Qd Ts, 3d 6h 9s with the turn 8c,
    // and Ts 4s Tc. Two are rewritten: a flop of three hearts with a heart
    // on the turn, and a monotone flop.
    await importText(
      account.token,
      freshHandHistory('pokerstars-session.txt')
        .replaceAll('[3d 6h 9s]', '[3h 6h 5d]')
        .replace('[8c]', '[8h]')
        .replace('Board [3d 6h 9s 8c]', 'Board [3h 6h 5d 8h]')
        .replaceAll('[Ts 4s Tc]', '[Ts 4s 2s]'),
    );
    const cases: [string, number][] = [
      [fact('flop-suits:monotone'), 1],
      [fact('flop-suits:two-tone'), 2],
      [fact('flop-pairing:paired'), 1],
      [fact('!flop-pairing:paired'), 3],
      [fact('turn-brings-flush:true'), 1],
      [fact('turn-suits:flush-possible'), 1],
      [fact('turn-suits:no-flush'), 0],
      [fact('flop-high-card:Q,6'), 2],
      [fact('flop-connectedness:3..'), 1],
      [fact('flop-straight-possible:true'), 1],
      [fact('turn-overcard:true'), 1],
      [`${fact('flop-suits:two-tone')}&${fact('flop-high-card:T')}`, 0],
    ];
    for (const [query, count] of cases) {
      const got = await kept(account.token, query);
      expect(got.total, query).toBe(count);
      expect(got.statsCount, query).toBe(count);
    }
  }, 30_000);

  it('keeps Hands by the Hero’s cards on each Street', async () => {
    // Besides the ten Hands above, coinpoker-ante.txt's three, one of them
    // As Ad on 3s 8s 7s Kc 10s: an overpair with the nut flush draw on the
    // flop and the turn. Read by hand: Hero4's Ad Jc is top pair on
    // As 8h 3c; HeroAI's Kd Kc is top set to the river on Ks 7d 4h 9c 2s,
    // the one Hand there that is the nuts on the river.
    const account = await stockedAccount();
    await importText(account.token, freshHandHistory('coinpoker-ante.txt'));
    const cases: [string, number][] = [
      [fact('flop-made-hand:top-pair'), 1],
      [fact('flop-made-hand:top-pair,overpair'), 3],
      [fact('turn-draw:flush-draw'), 1],
      [fact('turn-draw:flush-draw-pair,gutshot-two-cards'), 1],
      [fact('flop-nut-flush-draw:true'), 1],
      [fact('river-nuts:true'), 1],
      [fact('flop-kicker:weak'), 1],
      // The Hero's hole cards, with the Board.
      [`${fact('hero-class:AA,KK')}&${fact('flop-made-hand:set')}`, 1],
      [`${fact('hero-class:AA')}&${fact('turn-draw:flush-draw')}`, 1],
      // Hands with no flop are kept by an exclusion, not by a value.
      [fact('!turn-draw:flush-draw'), 12],
      [fact('flop-nuts:false'), 7],
      [fact('flop-nuts:true,false'), 9],
    ];
    for (const [query, count] of cases) {
      const got = await kept(account.token, query);
      expect(got.total, query).toBe(count);
      expect(got.statsCount, query).toBe(count);
    }
  }, 30_000);

  it('rejects an unknown fact, an impossible value or a malformed range', async () => {
    const account = await newAccount(running.httpServer);
    for (const criterion of [
      'nope:1',
      'pot-type',
      'pot-type:',
      'pot-type:6-bet',
      'pot-type:3-bet,',
      'hero-position:BUTTON',
      'hero-class:AKx',
      'hero-aggressor:maybe',
      'players:5..2',
      'players:..',
      'players:x..3',
      'players:3',
      'flop-suits:no-flush',
      'turn-suits:monotone',
      'flop-pairing:pair',
      'flop-connectedness:..6',
      'flop-high-card:10',
      'turn-overcard:yes',
      '!',
      'flop-made-hand:pair',
      'turn-draw:flush',
      'river-draw:flush-draw',
      'river-nut-flush-draw:true',
      'flop-kicker:ace',
      'river-nuts:yes',
    ]) {
      for (const endpoint of ['hands', 'hand-ids', 'results', 'stats']) {
        await get(
          account.token,
          `/api/library/${endpoint}?${fact(criterion)}`,
        ).expect(400, { reason: 'invalid-library-filter' });
      }
    }
  });
});

describe('Each Hand’s facts row (e2e)', () => {
  let running: RunningApp;
  let db: Database;
  const clients: RoomClient[] = [];

  beforeEach(async () => {
    // A database of its own: the re-derive job reads every stored Hand.
    running = await startApp({ ownDatabase: true });
    db = drizzle({
      client: new pg.Pool({ connectionString: running.databaseUrl }),
      schema,
    });
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
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

  async function count(token: string, query: string): Promise<number> {
    const res = await request(running.httpServer)
      .get(`/api/library/hands?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.total as number;
  }

  async function factsOf(ids: string[]) {
    return db
      .select({ handId: handFacts.handId, version: handFacts.version })
      .from(handFacts)
      .where(inArray(handFacts.handId, ids));
  }

  it('is written for Hands uploaded to a Room, and discarded with them', async () => {
    const account = await newAccount(running.httpServer);
    const created = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' })
      .expect(201);
    const code = created.body.code as string;
    const socket = await RoomClient.connect(running.wsUrl, account.token);
    clients.push(socket);
    socket.send('room.join', { code, displayName: 'Javier' });
    await socket.next('room.snapshot');
    await request(running.httpServer)
      .post(`/api/rooms/${code}/hands`)
      .set('Authorization', `Bearer ${account.token}`)
      .send({ text: freshHandHistory('pokerstars-session.txt') })
      .expect(201);
    const { entries } = await socket.next<{ entries: { handId: string }[] }>(
      'queue.entriesAdded',
    );
    const ids = entries.map((entry) => entry.handId);

    expect(await factsOf(ids)).toHaveLength(4);

    socket.send('room.close');
    await socket.next('room.closed');

    expect(await factsOf(ids)).toHaveLength(0);
  });

  it('is brought up to date by the re-derive job, from the stored Hand, and only when behind', async () => {
    const account = await newAccount(running.httpServer);
    await importText(account.token, freshHandHistory('pokerstars-session.txt'));
    await importText(account.token, freshHandHistory('pokerstars-all-ins.txt'));
    const all = await db.select({ id: hands.id }).from(hands);
    expect(await factsOf(all.map(({ id }) => id))).toHaveLength(6);
    expect(await count(account.token, fact('hero-position:BB'))).toBe(2);
    expect(await rederiveFacts(db)).toBe(0);

    // A Hand stored before facts existed, and one without its Hand History
    // whose facts were worked out by an older version, wrongly.
    const [first, second] = all.map(({ id }) => id);
    await db.delete(handFacts).where(eq(handFacts.handId, first));
    await db
      .update(handFacts)
      .set({ version: 0, heroPosition: 'UTG' })
      .where(eq(handFacts.handId, second));
    await db
      .update(hands)
      .set({ handHistory: null })
      .where(eq(hands.id, second));
    // Neither answers a criterion on a fact its version didn't have, even
    // excluded.
    expect(await count(account.token, fact('hero-position:UTG'))).toBe(0);
    expect(await count(account.token, fact('!hero-position:UTG'))).toBe(4);

    expect(await rederiveFacts(db, { batch: 1 })).toBe(2);

    expect(await count(account.token, fact('hero-position:BB'))).toBe(2);
    expect(await count(account.token, fact('!hero-position:UTG'))).toBe(6);
    expect(
      (await factsOf(all.map(({ id }) => id))).map((row) => row.version),
    ).toEqual(Array(6).fill(FACTS_VERSION));
    // Run again: nothing is behind.
    expect(await rederiveFacts(db)).toBe(0);
  });

  it('is rewritten when a Hand is read again from its Hand History', async () => {
    const account = await newAccount(running.httpServer);
    await importText(account.token, freshHandHistory('pokerstars-session.txt'));
    const [{ id }] = await db
      .select({ id: hands.id })
      .from(hands)
      .where(eq(hands.heroScreenName, 'iMapleAA'))
      .limit(1);
    const [stored] = await db
      .select({ content: hands.content })
      .from(hands)
      .where(eq(hands.id, id));
    // As if the parser had once read the Hero into another seat.
    await db
      .update(hands)
      .set({ content: { ...stored.content, buttonSeat: 99 } })
      .where(eq(hands.id, id));
    await db
      .update(handFacts)
      .set({ heroPosition: null })
      .where(eq(handFacts.handId, id));

    await rereadHands(db);

    const [facts] = await db
      .select({ heroPosition: handFacts.heroPosition })
      .from(handFacts)
      .where(eq(handFacts.handId, id));
    expect(facts.heroPosition).not.toBeNull();
  });

  const fact = (criterion: string) => `fact=${encodeURIComponent(criterion)}`;
});

describe('The facts of Hands added by a Bulk Import (e2e)', () => {
  it('are written as the import service stores them', async () => {
    const secret = 'a-shared-secret-for-tests';
    const database = await freshDatabase();
    const store = new HeldFileStore();
    const service = await startImportService({
      secret,
      fileStore: store,
      databaseUrl: database.url,
    });
    const api = await startApp({
      databaseUrl: database.url,
      importService: { address: service.address, secret },
      fileStore: store,
    });
    try {
      const { token } = await newAccount(api.httpServer);
      const http = request(api.httpServer);
      const bytes = Buffer.from(freshHandHistory('pokerstars-session.txt'));
      const started = await http
        .post('/api/library/bulk-imports')
        .set('Authorization', `Bearer ${token}`)
        .send({ files: [{ name: 'export.txt', size: bytes.length }] })
        .expect(201);
      const id = started.body.id as string;
      const urls = await request(api.httpServer)
        .post(`/api/library/bulk-imports/${id}/files/0/parts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parts: [1] })
        .expect(201);
      const [{ partNumber, url }] = urls.body.parts as {
        partNumber: number;
        url: string;
      }[];
      await request(api.httpServer)
        .post(`/api/library/bulk-imports/${id}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          files: [{ parts: [{ partNumber, etag: store.receive(url, bytes) }] }],
        })
        .expect(201);
      await service.settled();

      const res = await request(api.httpServer)
        .get(
          `/api/library/hands?fact=${encodeURIComponent('hero-position:BB')}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.total).toBe(1);
    } finally {
      await api.close();
      await service.close();
      await database.drop();
    }
  });
});
