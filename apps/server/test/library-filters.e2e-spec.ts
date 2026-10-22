import request from 'supertest';
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
  total: number;
  page: number;
  pageSize: number;
  hands: {
    id: string;
    site: string;
    hero: string;
    playedAt: string;
    stake: Stake;
    marked: boolean;
  }[];
  options: {
    sites: string[];
    heroes: string[];
    stakes: Stake[];
    tags: unknown[];
  };
  counts: { all: number; marked: number };
}

/*
 * The fixtures this file imports: four PokerStars Hands of iMapleAA at
 * €0.05/€0.10, played 2026-09-18 between 12:28:26 and 12:29:08 UTC, and
 * CoinPoker Hands of `Hero` at ₮0.05/₮0.10, played 2026-10-19.
 */
const STARS_STAKE = 'no-limit:5:10:EUR';
const COIN_STAKE = 'no-limit:5:10:USDT';

describe('Filtering the Library and Marking from it (e2e)', () => {
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

  /** An Account whose Library holds both fixtures. */
  async function stockedAccount(): Promise<{ token: string }> {
    const account = await newAccount(running.httpServer);
    await importText(account.token, freshHandHistory('pokerstars-session.txt'));
    await importText(account.token, freshHandHistory('coinpoker-session.txt'));
    return account;
  }

  async function list(token: string, query: string = ''): Promise<LibraryPage> {
    const res = await request(running.httpServer)
      .get(`/api/library/hands?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as LibraryPage;
  }

  it('offers the Poker Sites, Heroes and Stakes the Library holds, and nothing else', async () => {
    const account = await stockedAccount();
    const other = await newAccount(running.httpServer);
    await importText(other.token, freshHandHistory('pokerstars-showdown.txt'));

    const page = await list(account.token, 'site=pokerstars');

    // Filtering never narrows what can be chosen.
    expect(page.options).toEqual({
      sites: ['coinpoker', 'pokerstars'],
      heroes: ['Hero', 'iMapleAA'],
      stakes: [
        { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
        { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'USDT' },
      ],
      tags: [],
    });
    expect((await list(other.token)).options).toEqual({
      sites: ['pokerstars'],
      heroes: ['iMapleAA'],
      stakes: [
        { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
      ],
      tags: [],
    });
  });

  it('filters by Poker Site, one or several', async () => {
    const account = await stockedAccount();
    const all = await list(account.token);

    const stars = await list(account.token, 'site=pokerstars');
    const both = await list(account.token, 'site=pokerstars&site=coinpoker');

    expect(stars.total).toBe(4);
    expect(stars.hands.every((hand) => hand.site === 'pokerstars')).toBe(true);
    expect(both.total).toBe(all.total);
    expect(all.total).toBeGreaterThan(4);
  });

  it('filters by Hero', async () => {
    const account = await stockedAccount();

    const page = await list(account.token, 'hero=Hero');

    expect(page.total).toBeGreaterThan(0);
    expect(page.hands.every((hand) => hand.hero === 'Hero')).toBe(true);
    expect((await list(account.token, 'hero=iMapleAA')).total).toBe(4);
    expect((await list(account.token, 'hero=nobody')).total).toBe(0);
  });

  it('filters by Stake, telling currencies apart', async () => {
    const account = await stockedAccount();

    const stars = await list(
      account.token,
      `stake=${encodeURIComponent(STARS_STAKE)}`,
    );
    const coin = await list(
      account.token,
      `stake=${encodeURIComponent(COIN_STAKE)}`,
    );

    expect(stars.total).toBe(4);
    expect(stars.hands.every((hand) => hand.stake.currency === 'EUR')).toBe(
      true,
    );
    expect(coin.hands.every((hand) => hand.stake.currency === 'USDT')).toBe(
      true,
    );
    expect(stars.total + coin.total).toBe((await list(account.token)).total);
  });

  it('filters by period, from inclusive and to exclusive', async () => {
    const account = await stockedAccount();

    const october = await list(account.token, 'from=2026-10-01T00:00:00.000Z');
    const early = await list(
      account.token,
      `from=${encodeURIComponent('2026-09-18T12:28:26Z')}&to=${encodeURIComponent('2026-09-18T12:29:04Z')}`,
    );

    expect(october.hands.every((hand) => hand.site === 'coinpoker')).toBe(true);
    expect(october.total).toBe(
      (await list(account.token, 'site=coinpoker')).total,
    );
    expect(early.hands.map((hand) => hand.playedAt)).toEqual([
      '2026-09-18T12:28:29.000Z',
      '2026-09-18T12:28:26.000Z',
    ]);
  });

  it('refuses a filter it cannot read', async () => {
    const account = await newAccount(running.httpServer);

    for (const query of ['from=yesterday', 'stake=NL10', 'marked=maybe']) {
      const res = await request(running.httpServer)
        .get(`/api/library/hands?${query}`)
        .set('Authorization', `Bearer ${account.token}`)
        .expect(400);
      expect(res.body).toEqual({ reason: 'invalid-library-filter' });
    }
  });

  describe('Marks', () => {
    function mark(token: string, handId: string) {
      return request(running.httpServer)
        .put(`/api/library/hands/${handId}/mark`)
        .set('Authorization', `Bearer ${token}`);
    }

    function unmark(token: string, handId: string) {
      return request(running.httpServer)
        .delete(`/api/library/hands/${handId}/mark`)
        .set('Authorization', `Bearer ${token}`);
    }

    it('Marks and unmarks a Hand, and the Marked-only filter finds it', async () => {
      const account = await stockedAccount();
      const [first, second] = (await list(account.token)).hands;

      expect((await mark(account.token, first.id).expect(200)).body).toEqual({
        handId: first.id,
        marked: true,
      });
      await mark(account.token, second.id).expect(200);
      // Marking twice changes nothing.
      await mark(account.token, second.id).expect(200);

      const marked = await list(account.token, 'marked=true');
      expect(marked.hands.map((hand) => hand.id).sort()).toEqual(
        [first.id, second.id].sort(),
      );
      expect(marked.hands.every((hand) => hand.marked)).toBe(true);
      expect((await list(account.token)).counts.marked).toBe(2);

      expect((await unmark(account.token, first.id).expect(200)).body).toEqual({
        handId: first.id,
        marked: false,
      });
      expect(
        (await list(account.token, 'marked=true')).hands.map((h) => h.id),
      ).toEqual([second.id]);
      const all = await list(account.token);
      expect(all.hands.find((hand) => hand.id === first.id)?.marked).toBe(
        false,
      );
    });

    it('keeps a Mark to who made it, even on a Hand both have', async () => {
      const marta = await newAccount(running.httpServer);
      const javier = await newAccount(running.httpServer);
      const text = freshHandHistory('pokerstars-showdown.txt');
      await importText(marta.token, text);
      await importText(javier.token, text);
      const [hand] = (await list(marta.token)).hands;

      await mark(marta.token, hand.id).expect(200);

      expect((await list(javier.token)).hands[0].marked).toBe(false);
      expect((await list(javier.token, 'marked=true')).total).toBe(0);
    });

    it('Marks only Hands in the person’s own Library', async () => {
      const owner = await newAccount(running.httpServer);
      const stranger = await newAccount(running.httpServer);
      await importText(
        owner.token,
        freshHandHistory('pokerstars-showdown.txt'),
      );
      const [hand] = (await list(owner.token)).hands;

      for (const res of [
        await mark(stranger.token, hand.id),
        await unmark(stranger.token, hand.id),
        await mark(stranger.token, 'not-a-uuid'),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ reason: 'hand-not-found' });
      }
    });
  });

  it('combines filters, with the total and the pages following them', async () => {
    const account = await stockedAccount();
    const stars = await list(account.token, 'site=pokerstars');
    for (const hand of stars.hands.slice(0, 3)) {
      await request(running.httpServer)
        .put(`/api/library/hands/${hand.id}/mark`)
        .set('Authorization', `Bearer ${account.token}`)
        .expect(200);
    }
    const coin = await list(account.token, 'site=coinpoker');
    await request(running.httpServer)
      .put(`/api/library/hands/${coin.hands[0].id}/mark`)
      .set('Authorization', `Bearer ${account.token}`)
      .expect(200);

    const query = [
      'marked=true',
      'hero=iMapleAA',
      `to=${encodeURIComponent('2026-09-18T12:29:08Z')}`,
    ].join('&');
    const firstPage = await list(account.token, `${query}&pageSize=1`);
    const secondPage = await list(account.token, `${query}&pageSize=1&page=2`);

    // The three Marked PokerStars Hands, but the newest is played at 12:29:08.
    expect(firstPage.total).toBe(2);
    expect(secondPage.total).toBe(2);
    expect([...firstPage.hands, ...secondPage.hands].map((h) => h.id)).toEqual(
      stars.hands.slice(1, 3).map((hand) => hand.id),
    );
    expect(firstPage.counts).toEqual({
      all: stars.total + coin.total,
      marked: 4,
    });
  });
});
