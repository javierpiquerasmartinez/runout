import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import type { Database } from '../src/database/database.js';
import * as schema from '../src/database/schema.js';
import { handStats, hands } from '../src/database/schema.js';
import type { Hand } from '../src/hands/hand.js';
import { importHandHistory } from '../src/hands/import/import.js';
import { rereadHands } from '../src/hands/reread-backfill.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';
import {
  fixture,
  oneHand,
  withFreshHandIds,
} from './support/hand-histories.js';

/*
 * A CoinPoker Hand with an ante and two preflop `ALLIN`s, as it was stored
 * before the parser left the ante out of the bet on the Street: the first
 * all-in raised ₮0.06 too far, so the Hand looked undecided and its All-in
 * EV was its Result. Reading it again from its Hand History fixes it.
 */
describe('Reading stored Hands again from their Hand History (e2e)', () => {
  let running: RunningApp;
  let db: Database;

  beforeEach(async () => {
    // A database of its own: the backfill reads every stored Hand, and the
    // shared one holds every other file's.
    running = await startApp({ ownDatabase: true });
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

  /** The Hand as the parser stored it before the fix. */
  function asOnceStored(hand: Hand): Hand {
    return {
      ...hand,
      actions: hand.actions.map((action) =>
        action.screenName === 'd6fec7b1' && action.type === 'raise'
          ? {
              ...action,
              amount: action.amount + 6,
              to: action.to + 6,
              allIn: false,
            }
          : action,
      ),
    };
  }

  it('rewrites a Hand read wrong, with its Stats, and then leaves every Hand as it is', async () => {
    const text = withFreshHandIds(
      oneHand('coinpoker-ante.txt', '174473000347'),
    );
    const [read] = importHandHistory(text).hands;
    const account = await newAccount(running.httpServer);
    await importText(account.token, text);
    // Hands that were read right all along, from every layout.
    for (const file of [
      'coinpoker-session.txt',
      'coinpoker-ante.txt',
      'pokerstars-edge-cases.txt',
      'pokerstars-all-ins.txt',
      'ggpoker-session.txt',
      'winamax-session.txt',
    ]) {
      await importText(account.token, fixture(file));
    }
    const [{ id }] = await db
      .select({ id: hands.id })
      .from(hands)
      .where(eq(hands.siteHandId, read.siteHandId));
    await db
      .update(hands)
      .set({ content: asOnceStored(read), heroAllInEv: 3934 })
      .where(eq(hands.id, id));
    await db.delete(handStats).where(eq(handStats.handId, id));

    const once = await rereadHands(db);

    const [stored] = await db
      .select({ content: hands.content, heroAllInEv: hands.heroAllInEv })
      .from(hands)
      .where(eq(hands.id, id));
    expect(stored).toEqual({ content: read, heroAllInEv: 2068 });
    expect(
      await db.select().from(handStats).where(eq(handStats.handId, id)),
    ).not.toHaveLength(0);
    // Only the Hand read wrong: every other reads again as it was stored.
    expect(once).toMatchObject({ rewritten: 1, unread: 0 });
    expect(once.read).toBeGreaterThan(20);
    expect(await rereadHands(db)).toEqual({ ...once, rewritten: 0 });
  }, 30_000);
});
