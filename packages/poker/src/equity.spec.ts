import { describe, expect, it } from 'vitest';
import { equity, type EquityRequest, type EquityResult } from './index.js';

/** The batches the Equity of `request` streams, at most `count` of them. */
function batches(
  request: EquityRequest,
  count: number,
  seed = 1,
): EquityResult[] {
  const results: EquityResult[] = [];
  for (const result of equity(request, { seed })) {
    results.push(result);
    if (results.length === count) break;
  }
  return results;
}

/** The one result an exact Equity gives. */
function exactly(request: EquityRequest): EquityResult {
  const results = batches(request, 2);
  expect(results).toHaveLength(1);
  return results[0];
}

describe('equity on the river', () => {
  const board = ['Ah', 'Kd', '7c', '4s', '2h'];

  it('is exact: a pair of queens beats jacks, ties queens and loses to kings', () => {
    const result = exactly({
      ranges: [{ QsQd: 100 }, { KcQh: 100, JcJd: 100, QcQh: 100 }],
      board,
    });

    expect(result.exact).toBe(true);
    expect(result.margin).toBe(0);
    expect(result.sides[0].win).toBeCloseTo(100 / 3);
    expect(result.sides[0].tie).toBeCloseTo(100 / 3);
    expect(result.sides[0].equity).toBeCloseTo(50);
    expect(result.sides[1].win).toBeCloseTo(100 / 3);
    expect(result.sides[1].tie).toBeCloseTo(100 / 3);
    expect(result.sides[1].equity).toBeCloseTo(50);
  });

  it('weights each Combo by its Frequency: one at 50 % counts half', () => {
    const result = exactly({
      ranges: [{ QsQd: 100 }, { KcQh: 100, JcJd: 50, QcQh: 100 }],
      board,
    });

    // Of 2.5 weighted Combos: 0.5 lose to the queens, 1 ties, 1 wins.
    expect(result.sides[0].win).toBeCloseTo(20);
    expect(result.sides[0].tie).toBeCloseTo(40);
    expect(result.sides[0].equity).toBeCloseTo(40);
    expect(result.sides[1].win).toBeCloseTo(40);
    expect(result.sides[1].equity).toBeCloseTo(60);
  });

  it('never pairs Combos that share a card', () => {
    const alone = exactly({ ranges: [{ QsQd: 100 }, { JcJd: 100 }], board });
    const withBlocked = exactly({
      ranges: [{ QsQd: 100 }, { JcJd: 100, KcQs: 100 }],
      board,
    });

    expect(withBlocked.sides[0].equity).toBeCloseTo(alone.sides[0].equity);
    expect(withBlocked.sides[0].equity).toBeCloseTo(100);
  });
});

describe('equity on the turn', () => {
  // Top set against bottom set: only the last king, the K♦, saves the kings.
  const request: EquityRequest = {
    ranges: [{ AsAh: 100 }, { KsKh: 100 }],
    board: ['Ac', 'Kc', '7s', '2d'],
  };

  it('is exact over every river: one out of 44', () => {
    const result = exactly(request);

    expect(result.exact).toBe(true);
    expect(result.margin).toBe(0);
    expect(result.sides[0].equity).toBeCloseTo((43 / 44) * 100);
    expect(result.sides[1].win).toBeCloseTo((1 / 44) * 100);
    expect(result.sides[0].tie).toBe(0);
  });

  it('never deals a Dead Card: with the K♦ out, the kings are drawing dead', () => {
    const result = exactly({ ...request, dead: ['Kd'] });

    expect(result.sides[0].equity).toBeCloseTo(100);
    expect(result.sides[1].equity).toBeCloseTo(0);
  });

  it('leaves out the Combos holding a Dead Card', () => {
    const result = exactly({
      ...request,
      ranges: [{ AsAh: 100 }, { KsKh: 100, QsQh: 100 }],
      dead: ['Qh'],
    });

    // The queens are gone, and so is one of the 44 rivers.
    expect(result.sides[0].equity).toBeCloseTo((42 / 43) * 100);
  });

  it('gives nothing when no Combo of one side can meet one of the other', () => {
    expect(
      batches({ ...request, ranges: [{ AsAh: 100 }, { AsKs: 100 }] }, 1),
    ).toEqual([]);
    expect(batches({ ...request, ranges: [{ AsAh: 100 }, {}] }, 1)).toEqual([]);
  });
});

/** Every Combo of a pair, as `AsAh`. */
function pairOf(rank: string): Record<string, number> {
  const suits = 'shdc';
  const range: Record<string, number> = {};
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      range[rank + suits[i] + rank + suits[j]] = 100;
  return range;
}

describe('equity preflop', () => {
  const request: EquityRequest = {
    ranges: [pairOf('A'), pairOf('K')],
    board: [],
  };

  it('samples AA against KK to within its margin of the published 81.95 %', () => {
    const results = batches(request, 20);
    const last = results[results.length - 1];

    expect(last.exact).toBe(false);
    expect(last.margin).toBeGreaterThan(0);
    expect(last.margin).toBeLessThan(0.5);
    expect(Math.abs(last.sides[0].equity - 81.95)).toBeLessThan(last.margin);
    expect(last.sides[0].equity + last.sides[1].equity).toBeCloseTo(100);
  });

  it('samples even one Combo against another: every preflop Board is too many', () => {
    const [first] = batches(
      { ranges: [{ AhKh: 100 }, { QsQd: 100 }], board: [] },
      1,
    );

    expect(first.exact).toBe(false);
  });

  it('narrows its margin batch after batch', () => {
    const margins = batches(request, 6).map((result) => result.margin);

    margins
      .slice(1)
      .forEach((margin, i) => expect(margin).toBeLessThan(margins[i]));
  });

  it('repeats itself with the same seed, and not with another', () => {
    const equityOf = (seed: number) =>
      batches(request, 2, seed)[1].sides[0].equity;

    expect(equityOf(7)).toBe(equityOf(7));
    expect(equityOf(7)).not.toBe(equityOf(8));
  });

  it('weights sampled Combos by their Frequency', () => {
    // KK is about 18 % against AA and 82 % against 22: with the aces at 1 %,
    // nearly all of the weight is on the deuces. Unweighted, it would be near 50 %.
    const acesRare = Object.fromEntries(
      Object.keys(pairOf('A')).map((combo) => [combo, 1]),
    );
    const results = batches(
      { ranges: [{ KhKd: 100 }, { ...acesRare, ...pairOf('2') }], board: [] },
      10,
    );

    expect(results[9].sides[0].equity).toBeGreaterThan(78);
    expect(results[9].sides[0].equity).toBeLessThan(83);
  });
});

describe('equity by Hand Class', () => {
  const board = ['Ah', 'Kd', '7c', '4s', '2h'];

  it('gives each Hand Class of a side its Equity against the other, with its share of the side', () => {
    const result = exactly({
      ranges: [{ QsQd: 100, JsJd: 100 }, { KcQh: 100, TcTd: 100 }],
      board,
    });

    // QQ beats TT and loses to KQ; JJ beats TT and loses to KQ.
    expect(result.handClasses[0].QQ.equity).toBeCloseTo(50);
    expect(result.handClasses[0].QQ.share).toBeCloseTo(50);
    // KQ wins against both pairs, TT loses to both.
    expect(result.handClasses[1].KQo.equity).toBeCloseTo(100);
    expect(result.handClasses[1].KQo.win).toBeCloseTo(100);
    expect(result.handClasses[1].TT.equity).toBeCloseTo(0);
    expect(Object.keys(result.handClasses[1]).sort()).toEqual(['KQo', 'TT']);
  });

  it('names a Combo’s Hand Class whatever order its cards are written in', () => {
    const result = exactly({
      ranges: [{ KsAs: 100 }, { QcJc: 100 }],
      board,
    });

    expect(Object.keys(result.handClasses[0])).toEqual(['AKs']);
    expect(Object.keys(result.handClasses[1])).toEqual(['QJs']);
  });

  /** A side's Equity, rebuilt from its Hand Classes' Equities weighted by their shares. */
  const summed = (result: EquityResult, side: 0 | 1) =>
    Object.values(result.handClasses[side]).reduce(
      (sum, handClass) => sum + (handClass.equity * handClass.share) / 100,
      0,
    );

  it('sums back to the side’s Equity when exact, Frequencies and blocked pairs included', () => {
    const result = exactly({
      ranges: [
        { AsKs: 100, AcKd: 50, QsQd: 100, Th9h: 25 },
        { KcQh: 100, JcJd: 50, QcQh: 100, AdKc: 100 },
      ],
      board: ['Ah', 'Kh', '7c', '4s'],
    });

    expect(summed(result, 0)).toBeCloseTo(result.sides[0].equity);
    expect(summed(result, 1)).toBeCloseTo(result.sides[1].equity);
  });

  it('sums back to the side’s Equity when sampled, each Hand Class with its own margin', () => {
    const [, last] = batches(
      { ranges: [{ ...pairOf('A'), ...pairOf('2') }, pairOf('K')], board: [] },
      2,
    );

    expect(last.exact).toBe(false);
    expect(summed(last, 0)).toBeCloseTo(last.sides[0].equity);
    expect(summed(last, 1)).toBeCloseTo(last.sides[1].equity);
    expect(last.handClasses[0].AA.equity).toBeGreaterThan(75);
    expect(last.handClasses[0]['22'].equity).toBeLessThan(25);
    expect(last.handClasses[0].AA.margin).toBeGreaterThan(last.margin);
  });
});
