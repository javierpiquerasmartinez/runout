import pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import {
  freshHandHistory,
  withFreshHandIds,
} from './support/hand-histories.js';
import { startApp, type RunningApp } from './support/app.js';
import { newAccount } from './support/google.js';

interface StatCount {
  opportunities: number;
  taken: number;
}

interface Stats {
  hands: number;
  stats: Record<string, StatCount>;
  handsWith: Record<string, { opportunity: number; taken: number }>;
}

const STAT_KEYS = [
  'vpip',
  'pfr',
  'rfi',
  'limp',
  'limp-fold',
  'limp-call',
  'limp-raise',
  'isolate',
  'three-bet',
  'fold-to-three-bet',
  'four-bet',
  'fold-to-four-bet',
  'five-bet',
  'fold-to-five-bet',
  'squeeze',
  'fold-to-squeeze',
  'cold-call',
  'fold-sb-to-steal',
  'fold-bb-to-steal',
  'steal',
  'resteal',
  'fold-to-resteal',
  'cbet-flop',
  'fold-to-cbet-flop',
  'donk-flop',
  'fold-to-donk-flop',
  'check-raise-flop',
  'cbet-turn',
  'fold-to-cbet-turn',
  'delayed-cbet-turn',
  'fold-to-delayed-cbet-turn',
  'probe-turn',
  'fold-to-probe-turn',
  'float-turn',
  'fold-to-float-turn',
  'donk-turn',
  'fold-to-donk-turn',
  'cbet-river',
  'fold-to-cbet-river',
  'probe-river',
  'fold-to-probe-river',
  'float-river',
  'fold-to-float-river',
  'donk-river',
  'fold-to-donk-river',
  'afq',
  'wwsf',
  'wtsd',
  'wsd',
];

/** The Btn opens, the Sb folds and the Bb calls: heads-up to the flop. */
const OPEN_CALLED = 'Btn: raises $2 to $3\nSb: folds\nBb: calls $2';

/**
 * A three-handed PokerStars Hand ($0.50/$1) with hand IDs of its own: Btn
 * on the button, then Sb and Bb, $100 each, played as `streets` lists, with
 * `hero` dealt Ah Kd. The Board is Kh 9c 4d 2s 7h.
 */
function threeHanded(
  hero: 'Btn' | 'Sb' | 'Bb',
  streets: { preflop: string; flop?: string; turn?: string; river?: string },
): string {
  const lines = (block: string) => block.trim().replace(/^\s+/gm, '');
  return withFreshHandIds(
    [
      "PokerStars Hand #262199000001:  Hold'em No Limit ($0.50/$1 USD) - 2026/09/10 21:00:00 CET [2026/09/10 15:00:00 ET]",
      "Table 'Spec' 3-max Seat #1 is the button",
      'Seat 1: Btn ($100 in chips)',
      'Seat 2: Sb ($100 in chips)',
      'Seat 3: Bb ($100 in chips)',
      'Sb: posts small blind $0.50',
      'Bb: posts big blind $1',
      '*** HOLE CARDS ***',
      `Dealt to ${hero} [Ah Kd]`,
      lines(streets.preflop),
      ...(streets.flop !== undefined
        ? ['*** FLOP *** [Kh 9c 4d]', lines(streets.flop)]
        : []),
      ...(streets.turn !== undefined
        ? ['*** TURN *** [Kh 9c 4d] [2s]', lines(streets.turn)]
        : []),
      ...(streets.river !== undefined
        ? ['*** RIVER *** [Kh 9c 4d 2s] [7h]', lines(streets.river)]
        : []),
      'Btn collected $1 from pot',
      '*** SUMMARY ***',
      'Total pot $1 | Rake $0',
    ].join('\n') + '\n',
  );
}

/** The Btn limps, the Sb folds and the Bb raises it: the limp's Isolate. */
const LIMP_ISOLATED = `
  Btn: calls $1
  Sb: folds
  Bb: raises $3 to $4`;

/** Two limps, and the Bb checks: an Isolate passed up. */
const LIMPED = `
  Btn: calls $1
  Sb: calls $0.50
  Bb: checks`;

/** Nobody bets the flop of a limped pot. */
const CHECKED_FLOP = `
  Sb: checks
  Bb: checks
  Btn: checks`;

/** The Btn opens and the Sb re-raises it: a Resteal. */
const RESTEAL = `
  Btn: raises $2 to $3
  Sb: raises $7 to $10
  Bb: folds`;

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

  it('sums Flop Check-raise, AFq and the Showdown Stats, AFq adding several Actions per Hand', async () => {
    const account = await newAccount(running.httpServer);
    // Four Heroes' Hands: a preflop win, a preflop all-in won through side
    // pots, a Showdown lost after a bet and two calls, a split pot after a
    // bet and a call.
    await importText(
      account.token,
      freshHandHistory('pokerstars-edge-cases.txt'),
    );
    // A preflop all-in lost, a preflop win, a flop check-raise that wins.
    await importText(account.token, freshHandHistory('ggpoker-session.txt'));

    const pick = ({ hands, stats }: Stats) => ({
      hands,
      'check-raise-flop': stats['check-raise-flop'],
      afq: stats.afq,
      wtsd: stats.wtsd,
      wsd: stats.wsd,
      wwsf: stats.wwsf,
    });

    expect(pick(await stats(account.token, 'site=pokerstars'))).toEqual({
      hands: 4,
      'check-raise-flop': { opportunities: 0, taken: 0 },
      afq: { opportunities: 5, taken: 2 },
      wtsd: { opportunities: 3, taken: 3 },
      wsd: { opportunities: 3, taken: 2 },
      wwsf: { opportunities: 3, taken: 2 },
    });
    expect(pick(await stats(account.token, 'site=ggpoker'))).toEqual({
      hands: 3,
      'check-raise-flop': { opportunities: 1, taken: 1 },
      afq: { opportunities: 1, taken: 1 },
      wtsd: { opportunities: 2, taken: 1 },
      wsd: { opportunities: 1, taken: 0 },
      wwsf: { opportunities: 2, taken: 1 },
    });
    expect(pick(await stats(account.token))).toEqual({
      hands: 7,
      'check-raise-flop': { opportunities: 1, taken: 1 },
      afq: { opportunities: 6, taken: 3 },
      wtsd: { opportunities: 5, taken: 4 },
      wsd: { opportunities: 4, taken: 2 },
      wwsf: { opportunities: 5, taken: 3 },
    });
    // AFq's Hands, not its Actions: the count Manos lists behind its links.
    expect(
      (await stats(account.token, 'site=pokerstars')).handsWith.afq,
    ).toEqual({ opportunity: 2, taken: 2 });
  });

  it('answers every Stat, with zero opportunities where the Hero had none', async () => {
    const account = await stockedAccount();

    const all = await stats(account.token, 'site=pokerstars');

    expect(Object.keys(all.stats)).toEqual(STAT_KEYS);
    expect(all.stats.squeeze).toEqual({ opportunities: 0, taken: 0 });
  });

  it('sums the preflop re-raise Stats', async () => {
    const account = await stockedAccount();

    const reRaises = (of: Stats) => ({
      'three-bet': of.stats['three-bet'],
      'fold-to-three-bet': of.stats['fold-to-three-bet'],
      'four-bet': of.stats['four-bet'],
      'fold-to-four-bet': of.stats['fold-to-four-bet'],
      squeeze: of.stats.squeeze,
    });
    const none = { opportunities: 0, taken: 0 };

    // iMapleAA folds the big blind to a raise: one 3-bet passed up.
    expect(reRaises(await stats(account.token, 'site=pokerstars'))).toEqual({
      'three-bet': { opportunities: 1, taken: 0 },
      'fold-to-three-bet': none,
      'four-bet': none,
      'fold-to-four-bet': none,
      squeeze: none,
    });
    // Hero folds to an open twice, and calls a 3-bet of their own open.
    expect(reRaises(await stats(account.token, 'site=coinpoker'))).toEqual({
      'three-bet': { opportunities: 2, taken: 0 },
      'fold-to-three-bet': { opportunities: 1, taken: 0 },
      'four-bet': { opportunities: 1, taken: 0 },
      'fold-to-four-bet': none,
      squeeze: none,
    });
  });

  it('sums the C-bet Stats', async () => {
    const account = await stockedAccount();

    // iMapleAA bets one flop as the preflop raiser (12:28:26) and checks two
    // back (12:28:29, and the showdown Hand); every turn bet is the caller's.
    const all = await stats(account.token, 'site=pokerstars');

    const none = { opportunities: 0, taken: 0 };
    expect({
      flop: all.stats['cbet-flop'],
      foldFlop: all.stats['fold-to-cbet-flop'],
      turn: all.stats['cbet-turn'],
      foldTurn: all.stats['fold-to-cbet-turn'],
      river: all.stats['cbet-river'],
      foldRiver: all.stats['fold-to-cbet-river'],
    }).toEqual({
      flop: { opportunities: 3, taken: 1 },
      foldFlop: none,
      turn: none,
      foldTurn: none,
      river: none,
      foldRiver: none,
    });
  });

  /**
   * Each Stat's opportunities and taken, checking on the way that the Hands
   * behind its links, and those its Stat criterion keeps, are as many.
   */
  async function perHandStats(token: string, keys: string[]) {
    const all = await stats(token);
    const hands = async (query: string) => {
      const res = await request(running.httpServer)
        .get(`/api/library/hand-ids?${query}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      return (res.body.ids as string[]).length;
    };
    const counted: Record<string, [number, number]> = {};
    for (const key of keys) {
      const { opportunities, taken } = all.stats[key];
      // Counted once per Hand: the links list as many Hands as the counts.
      expect(all.handsWith[key], key).toEqual({
        opportunity: opportunities,
        taken,
      });
      expect(await hands(`stat=${key}:opportunity`), key).toBe(opportunities);
      expect(await hands(`stat=${key}:taken`), key).toBe(taken);
      counted[key] = [opportunities, taken];
    }
    return counted;
  }

  it('sums RFI, Limp, the answers to an Isolate, and Isolate', async () => {
    const account = await newAccount(running.httpServer);
    await importText(
      account.token,
      [
        // The Btn limps, is isolated and raises.
        threeHanded('Btn', { preflop: `${LIMP_ISOLATED}\nBtn: raises $8 to $12\nBb: folds` }),
        // The Btn limps, is isolated and calls.
        threeHanded('Btn', { preflop: `${LIMP_ISOLATED}\nBtn: calls $3`, flop: 'Bb: checks\nBtn: checks' }),
        // The Btn limps, is isolated and folds.
        threeHanded('Btn', { preflop: `${LIMP_ISOLATED}\nBtn: folds` }),
        // The Btn opens.
        threeHanded('Btn', { preflop: 'Btn: raises $2 to $3\nSb: folds\nBb: folds' }),
        // The Btn limps and nobody raises.
        threeHanded('Btn', { preflop: LIMPED, flop: CHECKED_FLOP }),
        // The Bb isolates the Btn's limp.
        threeHanded('Bb', { preflop: `${LIMP_ISOLATED}\nBtn: folds` }),
        // The Bb checks behind two limps.
        threeHanded('Bb', { preflop: LIMPED, flop: CHECKED_FLOP }),
      ].join('\n\n\n'),
    );

    expect(
      await perHandStats(account.token, [
        'rfi',
        'limp',
        'limp-fold',
        'limp-call',
        'limp-raise',
        'isolate',
      ]),
    ).toEqual({
      // The Btn is first in every time: one open, four limps.
      rfi: [5, 1],
      limp: [5, 4],
      // Three of the limps are isolated, and answered each way once.
      'limp-fold': [3, 1],
      'limp-call': [3, 1],
      'limp-raise': [3, 1],
      // The Bb behind a limp twice: one raise, one check.
      isolate: [2, 1],
    });
  });

  it('sums the answers to a Squeeze and a 5-bet, and the fights over a steal', async () => {
    const account = await newAccount(running.httpServer);
    const fiveBet = `${RESTEAL}\nBtn: raises $15 to $25\nSb: raises $35 to $60\nBtn: folds`;
    await importText(
      account.token,
      [
        // The Sb folds to the Btn's steal.
        threeHanded('Sb', { preflop: 'Btn: raises $2 to $3\nSb: folds\nBb: folds' }),
        // The Sb resteals, and the Btn folds to it.
        threeHanded('Sb', { preflop: `${RESTEAL}\nBtn: folds` }),
        threeHanded('Btn', { preflop: `${RESTEAL}\nBtn: folds` }),
        // The Sb resteals, the Btn 4-bets, the Sb 5-bets and the Btn folds.
        threeHanded('Sb', { preflop: fiveBet }),
        threeHanded('Btn', { preflop: fiveBet }),
        // The Bb squeezes the Btn's open and the Sb's call; the Btn folds.
        threeHanded(
          'Btn',
          {
            preflop:
              'Btn: raises $2 to $3\nSb: calls $2\nBb: raises $11 to $14\nBtn: folds\nSb: folds',
          },
        ),
      ].join('\n\n\n'),
    );

    expect(
      await perHandStats(account.token, [
        'fold-to-squeeze',
        'five-bet',
        'fold-to-five-bet',
        'fold-sb-to-steal',
        'resteal',
        'fold-to-resteal',
      ]),
    ).toEqual({
      'fold-to-squeeze': [1, 1],
      // The Sb 5-bets; the Btn, facing it, could have raised again.
      'five-bet': [2, 1],
      'fold-to-five-bet': [1, 1],
      // The Sb faces a steal three times and folds once.
      'fold-sb-to-steal': [3, 1],
      resteal: [3, 2],
      // The Btn folds to one Resteal and 4-bets the other.
      'fold-to-resteal': [2, 1],
    });
  });

  it('sums Donk, Probe, Float and Delayed C-bet, and their Fold to, on each Street, keeping the same Hands behind each', async () => {
    const account = await newAccount(running.httpServer);
    // The Btn opens and the Bb calls in every Hand; each Hand is imported
    // twice, once from each seat. The fixtures reach almost none of these
    // spots.
    const spots = {
      // The Bb leads the flop into the opener, who folds.
      flopDonkFolded: {
        flop: 'Bb: bets $3\nBtn: folds\nUncalled bet ($3) returned to Bb',
      },
      // The Bb leads the turn into the flop's C-bettor, who calls, then
      // checks the river to him; he bets, a float, and the Bb folds.
      turnDonkThenFloat: {
        flop: 'Bb: checks\nBtn: bets $3\nBb: calls $3',
        turn: 'Bb: bets $6\nBtn: calls $6',
        river:
          'Bb: checks\nBtn: bets $10\nBb: folds\nUncalled bet ($10) returned to Btn',
      },
      // A flop C-bet called and a turn checked through; the Bb probes the
      // river and the Btn folds.
      riverProbeFolded: {
        flop: 'Bb: checks\nBtn: bets $3\nBb: calls $3',
        turn: 'Bb: checks\nBtn: checks',
        river: 'Bb: bets $5\nBtn: folds\nUncalled bet ($5) returned to Bb',
      },
      // A flop checked through; the Btn's turn bet, a delayed C-bet, is
      // check-raised and he folds.
      delayedCbetRaised: {
        flop: 'Bb: checks\nBtn: checks',
        turn: 'Bb: checks\nBtn: bets $4\nBb: raises $8 to $12\nBtn: folds\nUncalled bet ($8) returned to Bb',
      },
      // A flop checked through; the Bb probes the turn and the Btn folds.
      turnProbeFolded: {
        flop: 'Bb: checks\nBtn: checks',
        turn: 'Bb: bets $3\nBtn: folds\nUncalled bet ($3) returned to Bb',
      },
      // C-bets on the flop and the turn, both called; the Bb leads the
      // river into the turn's bettor, who folds.
      riverDonkFolded: {
        flop: 'Bb: checks\nBtn: bets $3\nBb: calls $3',
        turn: 'Bb: checks\nBtn: bets $6\nBb: calls $6',
        river: 'Bb: bets $10\nBtn: folds\nUncalled bet ($10) returned to Bb',
      },
      // The Bb leads the flop and the Btn calls in position; the Bb checks
      // the turn, the Btn floats it and the Bb folds.
      turnFloatFolded: {
        flop: 'Bb: bets $3\nBtn: calls $3',
        turn: 'Bb: checks\nBtn: bets $6\nBb: folds\nUncalled bet ($6) returned to Btn',
      },
      // A flop checked through; the Btn's delayed C-bet, folded to.
      delayedCbetFolded: {
        flop: 'Bb: checks\nBtn: checks',
        turn: 'Bb: checks\nBtn: bets $4\nBb: folds\nUncalled bet ($4) returned to Btn',
      },
      // Every Street checked through: chances, none taken.
      checkedDown: {
        flop: 'Bb: checks\nBtn: checks',
        turn: 'Bb: checks\nBtn: checks',
        river: 'Bb: checks\nBtn: checks',
      },
    };
    await importText(
      account.token,
      Object.values(spots)
        .flatMap((streets) =>
          (['Btn', 'Bb'] as const).map((hero) =>
            threeHanded(hero, { preflop: OPEN_CALLED, ...streets }),
          ),
        )
        .join('\n\n\n'),
    );

    const all = await stats(account.token);
    expect(all.hands).toBe(18);
    const expected: Record<string, StatCount> = {
      // The Bb could lead every flop; it led two.
      'donk-flop': { opportunities: 9, taken: 2 },
      'fold-to-donk-flop': { opportunities: 2, taken: 1 },
      // Only after a bet the Bb called: a flop checked through is a probe.
      'donk-turn': { opportunities: 3, taken: 1 },
      'fold-to-donk-turn': { opportunities: 1, taken: 0 },
      'donk-river': { opportunities: 1, taken: 1 },
      'fold-to-donk-river': { opportunities: 1, taken: 1 },
      'delayed-cbet-turn': { opportunities: 3, taken: 2 },
      // Raised once, folded once.
      'fold-to-delayed-cbet-turn': { opportunities: 2, taken: 1 },
      'probe-turn': { opportunities: 4, taken: 1 },
      'fold-to-probe-turn': { opportunities: 1, taken: 1 },
      'float-turn': { opportunities: 1, taken: 1 },
      'fold-to-float-turn': { opportunities: 1, taken: 1 },
      'probe-river': { opportunities: 2, taken: 1 },
      'fold-to-probe-river': { opportunities: 1, taken: 1 },
      'float-river': { opportunities: 1, taken: 1 },
      'fold-to-float-river': { opportunities: 1, taken: 1 },
    };
    for (const [key, count] of Object.entries(expected)) {
      expect(all.stats[key], key).toEqual(count);
      // Counted once per Hand: the Hands behind the links are as many.
      expect(all.handsWith[key], key).toEqual({
        opportunity: count.opportunities,
        taken: count.taken,
      });
      // The Stat criterion keeps those same Hands.
      for (const side of ['opportunity', 'taken'] as const) {
        const res = await request(running.httpServer)
          .get(`/api/library/hand-ids?stat=${key}:${side}`)
          .set('Authorization', `Bearer ${account.token}`)
          .expect(200);
        expect((res.body.ids as string[]).length, `${key}:${side}`).toBe(
          all.handsWith[key][side],
        );
      }
    }
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
      handsWith: Object.fromEntries(
        STAT_KEYS.map((key) => [key, { opportunity: 0, taken: 0 }]),
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

  it('works them out again from the text when a Hand stored without it is imported again', async () => {
    const account = await newAccount(running.httpServer);
    const text = freshHandHistory('pokerstars-showdown.txt');
    await importText(account.token, text);
    const imported = await stats(account.token);
    // As a Hand stored before Runout kept its text, and before Stats: no
    // Hand History and no facts row.
    const [handId] = await starsHandIds(account.token);
    const db = new pg.Client(inject('databaseUrl'));
    await db.connect();
    try {
      await db.query('delete from hand_facts where hand_id = $1', [handId]);
      await db.query('update hands set hand_history = null where id = $1', [
        handId,
      ]);
    } finally {
      await db.end();
    }
    expect((await stats(account.token)).stats.vpip).toEqual({
      opportunities: 0,
      taken: 0,
    });

    await importText(account.token, text);

    const reread = await stats(account.token);
    expect(reread.stats.vpip).toEqual({ opportunities: 1, taken: 1 });
    expect(reread).toEqual(imported);
  });

  it('rejects a filter it can’t read, as the list does', async () => {
    const account = await newAccount(running.httpServer);

    await request(running.httpServer)
      .get('/api/library/stats?stake=NL10')
      .set('Authorization', `Bearer ${account.token}`)
      .expect(400, { reason: 'invalid-library-filter' });
  });
});
