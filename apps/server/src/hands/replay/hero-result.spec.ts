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
    expect(heroResult(hand)).toEqual({ result: 49, reachedShowdown: true });
  });

  it('counts what the Hero lost by folding, and an uncalled bet handed back', () => {
    expect(hands('pokerstars-session.txt').map(heroResult)).toEqual([
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
    expect(hands('pokerstars-edge-cases.txt').map(heroResult)).toEqual([
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
    expect(heroResult(hand)).toEqual({ result: 0, reachedShowdown: false });
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
    expect(heroResult(hand)).toEqual({ result: 196, reachedShowdown: true });
  });
});
