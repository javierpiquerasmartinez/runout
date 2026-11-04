import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
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
  points: { hand: number; bigBlinds: Lines; amounts: Lines | null }[];
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
    expect(stars.points.at(-1)).toEqual({ hand: 5, ...stars.totals });
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
    expect(all.points.at(-1)).toEqual({ hand: all.hands, ...all.totals });
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
    expect(sampled.points.at(-1)).toEqual({ hand: 5, ...sampled.totals });
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
      points: [],
    });
    await request(running.httpServer).get('/api/library/results').expect(401);
  });
});
