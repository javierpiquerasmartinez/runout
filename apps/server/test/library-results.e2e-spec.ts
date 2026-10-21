import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface Lines {
  result: number;
  showdown: number;
  nonShowdown: number;
}

interface Results {
  hands: number;
  currency: string | null;
  totals: { bigBlinds: Lines; amounts: Lines | null };
  points: { hand: number; bigBlinds: Lines; amounts: Lines | null }[];
}

/*
 * The fixtures this file imports, iMapleAA's Results at €0.05/€0.10 in the
 * order they were played: pokerstars-session.txt is +€0.31 (no Showdown),
 * -€0.30, €0 and -€0.10 (the big blind folded); pokerstars-showdown.txt,
 * played later that day, is +€0.49 at Showdown. coinpoker-session.txt is
 * `Hero` at ₮0.05/₮0.10, played in October.
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
      bigBlinds: { result: 4, showdown: 4.9, nonShowdown: -0.9 },
      amounts: { result: 40, showdown: 49, nonShowdown: -9 },
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

  it('has nothing to draw for an empty Library, and none for an anonymous identity', async () => {
    const account = await newAccount(running.httpServer);

    expect(await results(account.token)).toEqual({
      hands: 0,
      currency: null,
      totals: {
        bigBlinds: { result: 0, showdown: 0, nonShowdown: 0 },
        amounts: null,
      },
      points: [],
    });
    await request(running.httpServer).get('/api/library/results').expect(401);
  });
});
