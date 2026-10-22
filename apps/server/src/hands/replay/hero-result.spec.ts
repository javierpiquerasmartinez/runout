import { readFileSync } from 'node:fs';
import { importHandHistory } from '../import/import.js';
import { heroResult } from './hero-result.js';

function text(name: string) {
  return readFileSync(
    new URL(`../import/fixtures/${name}`, import.meta.url),
    'utf8',
  );
}

function hands(name: string) {
  return importHandHistory(text(name)).hands;
}

describe('Replay: the Hero’s Result', () => {
  // Expected values are worked out by hand from each Hand History.
  it('is what the Hero collected minus what they put in, rake already out', () => {
    const [hand] = hands('pokerstars-showdown.txt');

    // €0.30 preflop and €0.20 on the turn; €0.99 collected after €0.06 rake.
    expect(heroResult(hand)).toMatchObject({
      result: 49,
      reachedShowdown: true,
    });
  });

  it('counts what the Hero lost by folding, and an uncalled bet handed back', () => {
    expect(hands('pokerstars-session.txt').map(heroResult)).toMatchObject([
      // Folded the big blind.
      { result: -10, reachedShowdown: false },
      // Folded without putting anything in.
      { result: 0, reachedShowdown: false },
      // Raised to €0.30, then folded the turn.
      { result: -30, reachedShowdown: false },
      // €0.50 in, €0.20 of it handed back, €0.61 collected.
      { result: 31, reachedShowdown: false },
    ]);
  });

  it('counts side pots, a lost all-in and a split pot', () => {
    expect(hands('pokerstars-edge-cases.txt').map(heroResult)).toMatchObject([
      // $1.50 in, $1 handed back, $1 collected.
      { result: 50, reachedShowdown: false },
      // $0.05 ante and $79.95 in, $20 handed back, both side pots ($113)
      // collected and the main pot lost.
      { result: 5300, reachedShowdown: true },
      // $50 all in and lost.
      { result: -5000, reachedShowdown: true },
      // €2 in, half of the pot after €0.10 rake (€2.98) collected.
      { result: 98, reachedShowdown: true },
    ]);
  });

  it('leaves out a Showdown the Hero folded before', () => {
    const hand = hands('coinpoker-session.txt').find(
      (h) => h.siteHandId === '159855200582',
    )!;

    expect(hand.showdown).toBe(true);
    expect(heroResult(hand)).toMatchObject({
      result: 0,
      reachedShowdown: false,
    });
  });

  it('gives the Hero the Splash with the main pot they won', () => {
    // The fixture's Splash goes to seat 6; seat it as the Hero instead.
    const swapped = text('coinpoker-session.txt')
      .replace(/Dealt to Hero \[As 3d\]/g, 'Dealt to 0a0a0a0a')
      .replace(/Hero/g, '0a0a0a0a')
      .replace(/Dealt to 24dfed21(?=\r?\n)/g, 'Dealt to 24dfed21 [Ks Ts]')
      .replace(/24dfed21/g, 'Hero');
    const hand = importHandHistory(swapped).hands.find(
      (h) => h.siteHandId === '159855200581',
    )!;

    // ₮1.69 in; ₮3.25 collected after rake, plus the ₮0.40 Splash.
    expect(heroResult(hand)).toMatchObject({
      result: 196,
      reachedShowdown: true,
    });
  });
});

describe('Replay: the Hero’s All-in EV', () => {
  it('counts a turn all-in by the Hero’s equity in the pot', () => {
    const [, , hand] = hands('pokerstars-edge-cases.txt');

    // 99 against JJ on 9d 5c 2h Jc: only the 9c of 44 rivers wins, so 1/44
    // of the $98.75 left after rake, against the $50 put in.
    expect(heroResult(hand).allInEv).toBe(-4776);
  });

  it('counts a flop all-in by the Hero’s equity in the pot', () => {
    const [, hand] = hands('pokerstars-all-ins.txt');

    // 7c7d against AsAh on Kd 8c 2s: of 990 turns and rivers, the Hero wins
    // the 82 that bring one Seven and no Ace, and the one that brings both
    // Sevens. 83/990 of the $97.50 left after rake, against the $50 put in.
    expect(heroResult(hand)).toMatchObject({ result: -5000, allInEv: -4183 });
  });

  it('counts a preflop all-in by the Hero’s equity in the pot', () => {
    const [hand] = hands('pokerstars-all-ins.txt');

    // KdKc against AhAs wins 317,694 of 1,712,304 boards and splits 6,538
    // (counted apart, by brute force), so 18.74% of the $97.50 left after
    // rake, against the $50 put in.
    expect(heroResult(hand)).toMatchObject({ result: 4750, allInEv: -3172 });
  });

  it('counts each pot of a multiway all-in by the Hero’s equity in it', () => {
    const [, hand] = hands('pokerstars-edge-cases.txt');

    // AhAd against KsKd, QsQc and AcQd preflop, the Hero covering everyone.
    // Over the 1,086,008 boards (counted apart, by brute force) the Hero
    // takes 69.65% of the $40.50 main pot, 85.08% of the $45 side pot they
    // share with QsQc and AcQd, and 95.78% of the $70 one with AcQd alone,
    // each after its share of the $3 rake; they took $113 of it all.
    expect(heroResult(hand)).toMatchObject({ result: 5300, allInEv: 7096 });
  });

  it('takes the rake, and the Splash Fee, out of the pot before counting equity', () => {
    const hand = hands('coinpoker-session.txt').find(
      (h) => h.siteHandId === '160054200061',
    )!;

    // AhTs against KdTh on 5d 4d 2c Tc: only the three Kings of 44 rivers
    // lose. 41/44 of the ₮7.69 left after rake and Splash Fee is ₮7.17,
    // where the Hero took all ₮7.69.
    expect(heroResult(hand)).toMatchObject({ result: 369, allInEv: 317 });
  });

  it('equals the Result when an opponent’s cards weren’t shown', () => {
    const mucked = text('pokerstars-edge-cases.txt').replace(
      'Olive6: shows [Jh Js] (a full house, Jacks full of Fives)',
      'Olive6: mucks hand',
    );
    const [, , hand] = importHandHistory(mucked).hands;

    expect(heroResult(hand)).toMatchObject({ result: -5000, allInEv: -5000 });
  });

  it('equals the Result when no all-in before the river decided the Hand', () => {
    const [fold, , , split] = hands('pokerstars-edge-cases.txt');
    const results = [
      ...hands('pokerstars-showdown.txt'),
      ...hands('pokerstars-session.txt'),
      fold,
      split,
    ].map(heroResult);

    expect(results.map((r) => r.allInEv)).toEqual(results.map((r) => r.result));
  });

  it('never meets a Hand run twice: those are discarded as they are read', () => {
    // Such a Hand would count by its Result.
    expect(importHandHistory(text('coinpoker-session.txt')).discarded).toEqual([
      expect.objectContaining({ reason: 'run-it-twice' }),
    ]);
  });
});
