import request from 'supertest';
import { freshHandHistory } from './support/hand-histories.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface StatCount {
  opportunities: number;
  taken: number;
}

interface Stats {
  hands: number;
  stats: Record<string, StatCount>;
}

const STAT_KEYS = [
  'vpip',
  'pfr',
  'three-bet',
  'fold-to-three-bet',
  'four-bet',
  'fold-to-four-bet',
  'squeeze',
  'cold-call',
  'fold-bb-to-steal',
  'steal',
  'cbet-flop',
  'fold-to-cbet-flop',
  'check-raise-flop',
  'cbet-turn',
  'fold-to-cbet-turn',
  'cbet-river',
  'fold-to-cbet-river',
  'afq',
  'wwsf',
  'wtsd',
  'wsd',
];

/*
 * The fixtures this file imports, iMapleAA's Hands at €0.05/€0.10 in the
 * order they were played: pokerstars-session.txt opens with a raise twice
 * (12:28:26 and 12:28:29 UTC), folds first in (12:29:04) and folds the big
 * blind to a raise (12:29:08); pokerstars-showdown.txt, played later that
 * day, opens with a raise. coinpoker-session.txt is `Hero` at ₮0.05/₮0.10.
 */
describe('The Library’s Stats (e2e)', () => {
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

  async function stats(token: string, query: string = ''): Promise<Stats> {
    const res = await request(running.httpServer)
      .get(`/api/library/stats?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as Stats;
  }

  async function resultsCount(token: string, query: string): Promise<number> {
    const res = await request(running.httpServer)
      .get(`/api/library/results?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.hands as number;
  }

  /** iMapleAA's Hands' ids, in played order. */
  async function starsHandIds(token: string): Promise<string[]> {
    const res = await request(running.httpServer)
      .get('/api/library/results?site=pokerstars')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body.points as { handId: string }[]).map((p) => p.handId);
  }

  function vpipAndPfr(of: Stats) {
    return { hands: of.hands, vpip: of.stats.vpip, pfr: of.stats.pfr };
  }

  it('sums VPIP and PFR over the Hands the filter keeps, counting them as the Results do', async () => {
    const account = await stockedAccount();
    const tag = await request(running.httpServer)
      .post('/api/library/tags')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ name: 'Opens' })
      .expect(201);
    const [firstOpen, , foldFirstIn] = await starsHandIds(account.token);
    await request(running.httpServer)
      .put(`/api/library/hands/${foldFirstIn}/mark`)
      .set('Authorization', `Bearer ${account.token}`)
      .expect(200);
    await request(running.httpServer)
      .put(`/api/library/tags/${tag.body.id as string}/hands`)
      .set('Authorization', `Bearer ${account.token}`)
      .send({ handIds: [firstOpen] })
      .expect(200);

    const three = { opportunities: 3, taken: 3 };
    const cases: [string, ReturnType<typeof vpipAndPfr>][] = [
      [
        'site=pokerstars',
        {
          hands: 5,
          vpip: { ...three, opportunities: 5 },
          pfr: { ...three, opportunities: 5 },
        },
      ],
      [
        'hero=iMapleAA',
        {
          hands: 5,
          vpip: { ...three, opportunities: 5 },
          pfr: { ...three, opportunities: 5 },
        },
      ],
      [
        'stake=no-limit:5:10:EUR',
        {
          hands: 5,
          vpip: { ...three, opportunities: 5 },
          pfr: { ...three, opportunities: 5 },
        },
      ],
      [
        `site=pokerstars&to=${encodeURIComponent('2026-09-18T12:29:08Z')}`,
        {
          hands: 3,
          vpip: { opportunities: 3, taken: 2 },
          pfr: { opportunities: 3, taken: 2 },
        },
      ],
      [
        'marked=true',
        {
          hands: 1,
          vpip: { opportunities: 1, taken: 0 },
          pfr: { opportunities: 1, taken: 0 },
        },
      ],
      [
        `tag=${tag.body.id as string}`,
        {
          hands: 1,
          vpip: { opportunities: 1, taken: 1 },
          pfr: { opportunities: 1, taken: 1 },
        },
      ],
    ];
    for (const [query, expected] of cases) {
      const filtered = await stats(account.token, query);
      expect(vpipAndPfr(filtered), query).toEqual(expected);
      expect(filtered.hands, query).toBe(
        await resultsCount(account.token, query),
      );
    }
    const all = await stats(account.token);
    const coin = await stats(account.token, 'site=coinpoker');
    expect(all.hands).toBe(5 + coin.hands);
    expect(all.hands).toBe(await resultsCount(account.token, ''));
    expect(all.stats.vpip.opportunities).toBe(
      5 + coin.stats.vpip.opportunities,
    );
  });

  it('answers every Stat, with zero opportunities where the Hero had none', async () => {
    const account = await stockedAccount();

    const all = await stats(account.token, 'site=pokerstars');

    expect(Object.keys(all.stats)).toEqual(STAT_KEYS);
    expect(all.stats['three-bet']).toEqual({ opportunities: 0, taken: 0 });
  });

  it('sums the steal and blind Stats', async () => {
    const account = await stockedAccount();

    const { stats: stars } = await stats(account.token, 'site=pokerstars');

    expect({
      steal: stars.steal,
      'fold-bb-to-steal': stars['fold-bb-to-steal'],
      'cold-call': stars['cold-call'],
    }).toEqual({
      // Folded to in the cutoff or on the button four times: three raises,
      // one fold.
      steal: { opportunities: 4, taken: 3 },
      // The big blind folded to the button's raise.
      'fold-bb-to-steal': { opportunities: 1, taken: 1 },
      // A blind calling the open would not count, and nothing else faced a
      // raise first.
      'cold-call': { opportunities: 0, taken: 0 },
    });
  });

  it('has nothing to count for an empty Library, and nothing for an anonymous identity', async () => {
    const account = await newAccount(running.httpServer);

    expect(await stats(account.token)).toEqual({
      hands: 0,
      stats: Object.fromEntries(
        STAT_KEYS.map((key) => [key, { opportunities: 0, taken: 0 }]),
      ),
    });
    const master = await newAccount(running.httpServer);
    const room = await request(running.httpServer)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${master.token}`)
      .send({ name: 'Martes NL10', displayName: 'Javier' })
      .expect(201);
    const guest = await request(running.httpServer)
      .post(`/api/rooms/${room.body.code as string}/guests`)
      .send({ displayName: 'Marta' })
      .expect(201);
    await request(running.httpServer)
      .get('/api/library/stats')
      .set('Authorization', `Bearer ${guest.body.token as string}`)
      .expect(403, { reason: 'account-required' });
    await request(running.httpServer).get('/api/library/stats').expect(401);
  });

  it('stops counting a Hand once it leaves the Library', async () => {
    const account = await stockedAccount();
    const ids = await starsHandIds(account.token);

    await request(running.httpServer)
      .delete('/api/library/hands')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ handIds: [ids.at(-1)] })
      .expect(200);

    expect(vpipAndPfr(await stats(account.token, 'site=pokerstars'))).toEqual({
      hands: 4,
      vpip: { opportunities: 4, taken: 2 },
      pfr: { opportunities: 4, taken: 2 },
    });
  });

  it('rejects a filter it can’t read, as the list does', async () => {
    const account = await newAccount(running.httpServer);

    await request(running.httpServer)
      .get('/api/library/stats?stake=NL10')
      .set('Authorization', `Bearer ${account.token}`)
      .expect(400, { reason: 'invalid-library-filter' });
  });
});
