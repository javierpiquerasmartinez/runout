import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import type { Database } from '../src/database/database.js';
import * as schema from '../src/database/schema.js';
import {
  fixture,
  freshHandHistory,
  oneHand,
  withFreshHandIds,
} from './support/hand-histories.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Lines {
  result: number;
  allInEv: number;
  showdown: number;
  nonShowdown: number;
}

interface Results {
  hands: number;
  currency: string | null;
  totals: { bigBlinds: Lines; amounts: Lines | null };
  start: { bigBlinds: Lines; amounts: Lines | null };
  zoom: { from: number; to: number } | null;
  rakeGenerated: { bigBlinds: number; amounts: number | null };
  points: {
    hand: number;
    handId: string;
    holeCards: string[];
    bigBlinds: Lines;
    amounts: Lines | null;
  }[];
}

/*
 * The fixtures this file imports, iMapleAA's Results at €0.05/€0.10 in the
 * order they were played: pokerstars-session.txt is +€0.31 (no Showdown),
 * -€0.30, €0 and -€0.10 (the big blind folded); pokerstars-showdown.txt,
 * played later that day, is +€0.49 at Showdown. coinpoker-session.txt is
 * `Hero` at ₮0.05/₮0.10, played in October. None of these Hands was
 * decided by an all-in before the river, so their All-in EV is their Result.
 */
describe('The Library’s Results (e2e)', () => {
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

  /** An Account whose Library holds the three fixtures. */
  async function stockedAccount(): Promise<{ token: string }> {
    const account = await newAccount(running.httpServer);
    await importText(account.token, freshHandHistory('pokerstars-session.txt'));
    await importText(
      account.token,
      freshHandHistory('pokerstars-showdown.txt'),
    );
    await importText(account.token, freshHandHistory('coinpoker-session.txt'));
    return account;
  }

  async function results(token: string, query: string = ''): Promise<Results> {
    const res = await request(running.httpServer)
      .get(`/api/library/results?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as Results;
  }

  it('runs the Result Hand by Hand, split by whether the Hero reached Showdown', async () => {
    const account = await stockedAccount();

    const stars = await results(account.token, 'site=pokerstars');

    expect(stars.hands).toBe(5);
    expect(stars.currency).toBe('EUR');
    expect(stars.totals).toEqual({
      bigBlinds: { result: 4, allInEv: 4, showdown: 4.9, nonShowdown: -0.9 },
      amounts: { result: 40, allInEv: 40, showdown: 49, nonShowdown: -9 },
    });
    expect(stars.points.map((point) => point.hand)).toEqual([1, 2, 3, 4, 5]);
    expect(stars.points.map((point) => point.amounts?.result)).toEqual([
      31, 1, 1, -9, 40,
    ]);
    expect(stars.points.map((point) => point.bigBlinds.showdown)).toEqual([
      0, 0, 0, 0, 4.9,
    ]);
    expect(stars.points.at(-1)).toMatchObject({ hand: 5, ...stars.totals });
  });

  it('runs the All-in EV beside the Result', async () => {
    const account = await newAccount(running.httpServer);
    // At $0.25/$0.50: KdKc wins a preflop all-in against AhAs (+$47.50,
    // All-in EV -$31.72), then 7c7d loses a flop all-in against AsAh (-$50,
    // All-in EV -$41.83).
    await importText(account.token, freshHandHistory('pokerstars-all-ins.txt'));

    const allIns = await results(account.token);

    expect(allIns.totals).toEqual({
      bigBlinds: { result: -5, allInEv: -147.1, showdown: -5, nonShowdown: 0 },
      amounts: { result: -250, allInEv: -7355, showdown: -250, nonShowdown: 0 },
    });
    expect(allIns.points.map((point) => point.amounts?.allInEv)).toEqual([
      -3172, -7355,
    ]);
  });

  it('adds mixed currencies up in big blinds only', async () => {
    const account = await stockedAccount();
    const coin = await results(account.token, 'site=coinpoker');

    const all = await results(account.token);

    expect(coin.currency).toBe('USDT');
    expect(all.hands).toBe(5 + coin.hands);
    expect(all.currency).toBeNull();
    expect(all.totals.amounts).toBeNull();
    expect(all.points.every((point) => point.amounts === null)).toBe(true);
    // The CoinPoker Hands were played after the PokerStars ones.
    expect(all.totals.bigBlinds.result).toBeCloseTo(
      4 + coin.totals.bigBlinds.result,
      2,
    );
    expect(all.points.at(-1)).toMatchObject({ hand: all.hands, ...all.totals });
  });

  it('describes the same Hands as the list under the same filter', async () => {
    const account = await stockedAccount();
    const query = [
      'hero=iMapleAA',
      `to=${encodeURIComponent('2026-09-18T12:29:08Z')}`,
    ].join('&');

    const filtered = await results(account.token, query);
    const list = await request(running.httpServer)
      .get(`/api/library/hands?${query}`)
      .set('Authorization', `Bearer ${account.token}`)
      .expect(200);

    // The first three Hands of the session: +€0.31, -€0.30 and €0.
    expect(filtered.hands).toBe(list.body.total);
    expect(filtered.totals.amounts).toEqual({
      result: 1,
      allInEv: 1,
      showdown: 0,
      nonShowdown: 1,
    });
    await request(running.httpServer)
      .get('/api/library/results?stake=NL10')
      .set('Authorization', `Bearer ${account.token}`)
      .expect(400, { reason: 'invalid-library-filter' });
  });

  it('downsamples a long series, keeping the last Hand exact', async () => {
    const account = await stockedAccount();

    const sampled = await results(account.token, 'site=pokerstars&points=2');

    // Five Hands in two stretches: the last of each is Hands 3 and 5.
    expect(sampled.hands).toBe(5);
    expect(sampled.points.map((point) => point.hand)).toEqual([3, 5]);
    expect(sampled.points.map((point) => point.amounts?.result)).toEqual([
      1, 40,
    ]);
    expect(sampled.points.at(-1)).toMatchObject({ hand: 5, ...sampled.totals });
  });

  /** The ids of the Hands the filter keeps, in played order, as the list sorts them. */
  async function playedOrder(token: string, query: string): Promise<string[]> {
    const list = await request(running.httpServer)
      .get(`/api/library/hands?${query}&sort=date&dir=asc`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (list.body.hands as { id: string }[]).map((hand) => hand.id);
  }

  it('names each point’s Hand and the Hero’s cards in it', async () => {
    const account = await stockedAccount();

    const stars = await results(account.token, 'site=pokerstars');

    expect(stars.points.map((point) => point.handId)).toEqual(
      await playedOrder(account.token, 'site=pokerstars'),
    );
    expect(stars.points.map((point) => point.holeCards)).toEqual([
      ['Ac', 'Kh'],
      ['Qc', '10c'],
      ['4s', '10c'],
      ['4c', 'Jc'],
      ['Js', '8s'],
    ]);
  });

  it('names the last Hand of each stretch on a downsampled series', async () => {
    const account = await stockedAccount();
    const ids = await playedOrder(account.token, 'site=pokerstars');

    const sampled = await results(account.token, 'site=pokerstars&points=2');

    expect(sampled.points.map((point) => point.handId)).toEqual([
      ids[2],
      ids[4],
    ]);
    expect(sampled.points.map((point) => point.holeCards)).toEqual([
      ['4s', '10c'],
      ['Js', '8s'],
    ]);
  });

  it('zooms into a stretch, keeping the running totals from the first Hand', async () => {
    const account = await stockedAccount();

    const zoomed = await results(
      account.token,
      'site=pokerstars&zoomFrom=2&zoomTo=4',
    );

    // Hands 2 to 4: -€0.30, €0 and -€0.10, after Hand 1's +€0.31.
    expect(zoomed.zoom).toEqual({ from: 2, to: 4 });
    expect(zoomed.hands).toBe(3);
    expect(zoomed.currency).toBe('EUR');
    expect(zoomed.points.map((point) => point.hand)).toEqual([2, 3, 4]);
    expect(zoomed.points.map((point) => point.amounts?.result)).toEqual([
      1, 1, -9,
    ]);
    expect(zoomed.start).toEqual({
      bigBlinds: { result: 3.1, allInEv: 3.1, showdown: 0, nonShowdown: 3.1 },
      amounts: { result: 31, allInEv: 31, showdown: 0, nonShowdown: 31 },
    });
    expect(zoomed.totals).toEqual({
      bigBlinds: { result: -4, allInEv: -4, showdown: 0, nonShowdown: -4 },
      amounts: { result: -40, allInEv: -40, showdown: 0, nonShowdown: -40 },
    });
  });

  it('starts from nothing without a Zoom', async () => {
    const account = await stockedAccount();

    const whole = await results(account.token, 'site=pokerstars');

    expect(whole.zoom).toBeNull();
    expect(whole.start).toEqual({
      bigBlinds: { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 },
      amounts: { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 },
    });
  });

  it('clamps a Zoom to the Hands there are', async () => {
    const account = await stockedAccount();

    const clamped = await results(
      account.token,
      'site=pokerstars&zoomFrom=-3&zoomTo=40',
    );
    const tail = await results(
      account.token,
      'site=pokerstars&zoomFrom=4&zoomTo=9',
    );

    expect(clamped.zoom).toEqual({ from: 1, to: 5 });
    expect(clamped.hands).toBe(5);
    expect(clamped.totals.amounts?.result).toBe(40);
    expect(tail.zoom).toEqual({ from: 4, to: 5 });
    expect(tail.points.map((point) => point.hand)).toEqual([4, 5]);
    // Hand 4's -€0.10 and Hand 5's +€0.49.
    expect(tail.totals.amounts?.result).toBe(39);
    expect(tail.start.amounts?.result).toBe(1);
  });

  it('answers the whole series for a Zoom it can’t read or that holds under two Hands', async () => {
    const account = await stockedAccount();
    const whole = await results(account.token, 'site=pokerstars');

    for (const zoom of [
      'zoomFrom=2',
      'zoomTo=4',
      'zoomFrom=two&zoomTo=4',
      'zoomFrom=2.5&zoomTo=4',
      'zoomFrom=&zoomTo=4',
      'zoomFrom=3&zoomTo=3',
      'zoomFrom=4&zoomTo=2',
      'zoomFrom=5&zoomTo=9',
    ]) {
      expect(await results(account.token, `site=pokerstars&${zoom}`)).toEqual(
        whole,
      );
    }
  });

  it('downsamples a long stretch, keeping its last Hand exact', async () => {
    const account = await stockedAccount();

    const sampled = await results(
      account.token,
      'site=pokerstars&zoomFrom=2&zoomTo=5&points=2',
    );

    // Hands 2 to 5 in two stretches: the last of each is Hands 3 and 5.
    expect(sampled.hands).toBe(4);
    expect(sampled.points.map((point) => point.hand)).toEqual([3, 5]);
    expect(sampled.points.map((point) => point.amounts?.result)).toEqual([
      1, 40,
    ]);
    expect(sampled.start.amounts?.result).toBe(31);
    expect(sampled.totals.amounts?.result).toBe(9);
  });

  it('numbers a Zoom’s Hands among those the filter keeps, and keeps the filter’s currency', async () => {
    const account = await stockedAccount();
    const all = await results(account.token);

    // Over every Hand, Hands 5 and 6 are the PokerStars showdown and the
    // first CoinPoker Hand.
    const across = await results(account.token, 'zoomFrom=5&zoomTo=6');

    expect(across.zoom).toEqual({ from: 5, to: 6 });
    expect(across.currency).toBeNull();
    expect(across.totals.amounts).toBeNull();
    expect(across.points).toEqual(all.points.slice(4, 6));
    expect(across.start.bigBlinds.result).toBe(-0.9);
  });

  it('has nothing to draw for an empty Library, and none for an anonymous identity', async () => {
    const account = await newAccount(running.httpServer);

    expect(await results(account.token)).toEqual({
      hands: 0,
      currency: null,
      totals: {
        bigBlinds: { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 },
        amounts: null,
      },
      start: {
        bigBlinds: { result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 },
        amounts: null,
      },
      zoom: null,
      rakeGenerated: { bigBlinds: 0, amounts: null },
      points: [],
    });
    await request(running.httpServer).get('/api/library/results').expect(401);
  });
});

/**
 * CoinPoker Hand #159855200581 seen from the player who called down
 * (fbfabc70), with a ₮4 Splash in place of ₮0.40 so that counting it would
 * show. The Hero puts in ₮1.69 of the ₮3.43 the players put in; the Rake is
 * ₮0.17 and the Splash Fee ₮0.01.
 */
function coinPokerSplash(): string {
  const swapped = oneHand('coinpoker-session.txt', '159855200581')
    .replaceAll('fbfabc70', 'SWAP')
    .replaceAll('Hero', 'fbfabc70')
    .replaceAll('SWAP', 'Hero')
    .replace('Dealt to fbfabc70 [As 3d]', 'Dealt to fbfabc70')
    .replace(/Dealt to Hero(?=\r?\n)/, 'Dealt to Hero [5s 7h]')
    .replace('SPLASH dropped ₮0.40', 'SPLASH dropped ₮4.00')
    .replace('collected ₮3.25', 'collected ₮7.25')
    .replace('Total pot ₮3.83', 'Total pot ₮7.43')
    .replace('won (₮3.25)', 'won (₮7.25)');
  return withFreshHandIds(swapped);
}

/*
 * The Hero's Rake Generated in each Hand is their share of its Rake, by what
 * they put in the pot: worked out by hand below, to the nearest hundredth.
 */
describe('The Rake Generated beside the Library’s Results (e2e)', () => {
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

  /** An Account whose Library holds the given Hand Histories. */
  async function accountWith(...texts: string[]): Promise<{ token: string }> {
    const account = await newAccount(running.httpServer);
    for (const text of texts) await importText(account.token, text);
    return account;
  }

  async function results(token: string, query: string = ''): Promise<Results> {
    const res = await request(running.httpServer)
      .get(`/api/library/results?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as Results;
  }

  it('counts the Rake of a GGPoker Hand, not its Jackpot', async () => {
    // $0.32 of Rake and a $0.10 Jackpot; the Hero put in $4.20 of $8.65:
    // 32 × 420 / 865 = 15.54.
    const account = await accountWith(
      oneHand('ggpoker-session.txt', 'RC2104577321'),
    );

    expect((await results(account.token)).rakeGenerated).toEqual({
      bigBlinds: 1.6,
      amounts: 16,
    });
  });

  it('counts nothing for a Winamax Hand with “No rake”', async () => {
    const account = await accountWith(
      oneHand('winamax-session.txt', '20954312-7732-1757700090'),
    );

    expect((await results(account.token)).rakeGenerated).toEqual({
      bigBlinds: 0,
      amounts: 0,
    });
  });

  it('leaves a CoinPoker Splash and its Splash Fee out', async () => {
    // 17 × 169 / 343 = 8.38; with the Splash in the pot it would be 3.87,
    // and with the Splash Fee as Rake 8.87.
    const account = await accountWith(coinPokerSplash());

    expect((await results(account.token)).rakeGenerated).toEqual({
      bigBlinds: 0.8,
      amounts: 8,
    });
  });

  it('leaves out an uncalled bet returned to the Hero', async () => {
    // $3.75 put in, $2.20 of it handed back: 12 × 155 / 320 = 5.81, at
    // $0.10/$0.25.
    const account = await accountWith(
      oneHand('ggpoker-session.txt', 'HD1180452377'),
    );

    expect((await results(account.token)).rakeGenerated).toEqual({
      bigBlinds: 0.24,
      amounts: 6,
    });
  });

  it('shares out a side-pot Hand over everything the Hero put in', async () => {
    // €11.25 of the €31.15 every player put in, across both pots:
    // 61 × 1125 / 3115 = 22.03.
    const account = await accountWith(
      oneHand('winamax-session.txt', '20954312-7733-1757700200'),
    );

    expect((await results(account.token)).rakeGenerated).toEqual({
      bigBlinds: 2.2,
      amounts: 22,
    });
  });

  it('counts nothing for a Hand folded preflop with no Rake', async () => {
    // The Hero folds their big blind; only a ₮0.01 Splash Fee is taken.
    const account = await accountWith(
      withFreshHandIds(oneHand('coinpoker-session.txt', '160064400025')),
    );

    const folded = await results(account.token);

    expect(folded.hands).toBe(1);
    expect(folded.rakeGenerated).toEqual({ bigBlinds: 0, amounts: 0 });
  });

  /**
   * An Account with Winamax's three Hands (€0.08, nothing, €0.22) and then
   * GGPoker's ($0.16, nothing, $0.06), in played order.
   */
  async function mixedAccount(): Promise<{ token: string }> {
    return accountWith(
      fixture('winamax-session.txt'),
      fixture('ggpoker-session.txt'),
    );
  }

  it('adds mixed currencies up in big blinds only', async () => {
    const account = await mixedAccount();

    const all = await results(account.token);

    // 0.8 + 2.2 at €0.10, 1.6 at $0.10 and 0.24 at $0.25.
    expect(all.currency).toBeNull();
    expect(all.rakeGenerated).toEqual({ bigBlinds: 4.84, amounts: null });
  });

  it('follows the filter, and becomes a Zoom’s own', async () => {
    const account = await mixedAccount();

    const gg = await results(account.token, 'site=ggpoker');
    const winamaxStart = await results(
      account.token,
      'site=winamax&zoomFrom=1&zoomTo=2',
    );
    const across = await results(account.token, 'zoomFrom=3&zoomTo=4');

    expect(gg.rakeGenerated).toEqual({ bigBlinds: 1.84, amounts: 22 });
    expect(winamaxStart.rakeGenerated).toEqual({ bigBlinds: 0.8, amounts: 8 });
    // Winamax's side-pot Hand and GGPoker's first.
    expect(across.rakeGenerated).toEqual({ bigBlinds: 3.8, amounts: null });
  });

  it('counts every Hand toward BB/100, raked or not', async () => {
    const account = await accountWith(fixture('ggpoker-session.txt'));

    const gg = await results(account.token);

    // One of the three Hands had no Rake: 1.84 × 100 / 3.
    expect(gg.hands).toBe(3);
    expect((gg.rakeGenerated.bigBlinds / gg.hands) * 100).toBeCloseTo(61.33, 2);
  });
});

/*
 * Hands stored before 0025 without their Hand History had one number in
 * their content for the Rake and the Fees together, and the backfill counted
 * it all as Rake. A re-import of one works them out again from its text.
 */
describe('The Rake Generated of Hands imported before it was kept (e2e)', () => {
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

  async function rakeGenerated(
    token: string,
  ): Promise<Results['rakeGenerated']> {
    const res = await request(running.httpServer)
      .get('/api/library/results')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body as Results).rakeGenerated;
  }

  /**
   * Stores `token`'s Hands as the backfill left those stored before 0025
   * without their Hand History: the Splash Fee inside the Rake, and a Rake
   * Generated worked out from that. Only this test's Hands, as other files
   * share the database.
   */
  async function storeAsBackfilledWithoutText(
    token: string,
    heroRakeGenerated: number,
  ): Promise<void> {
    const list = await request(running.httpServer)
      .get('/api/library/hands')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ids = (list.body.hands as { id: string }[]).map((hand) => hand.id);
    const content = schema.hands.content;
    const rakeAndFees = sql`(${content}->>'rake')::int + (${content}->>'fees')::int`;
    await db
      .update(schema.hands)
      .set({
        rake: rakeAndFees,
        heroRakeGenerated,
        content: sql`${content} || jsonb_build_object('rake', ${rakeAndFees}, 'fees', 0)`,
        handHistory: null,
      })
      .where(inArray(schema.hands.id, ids));
  }

  it('works them out again from the text when a Hand stored without it is imported again', async () => {
    // ₮0.17 of Rake and a ₮0.01 Splash Fee; the Hero put in ₮1.69 of ₮3.43.
    const account = await newAccount(running.httpServer);
    const text = coinPokerSplash();
    await importText(account.token, text);
    // 18 × 169 / 343 = 8.87: the Splash Fee counted as Rake.
    await storeAsBackfilledWithoutText(account.token, 9);
    expect((await rakeGenerated(account.token)).amounts).toBe(9);

    await importText(account.token, text);

    // 17 × 169 / 343 = 8.38, read again from the Hand History.
    expect(await rakeGenerated(account.token)).toEqual({
      bigBlinds: 0.8,
      amounts: 8,
    });
  });
});
