import { readFileSync } from 'node:fs';
import { importHandHistory } from '../import/import.js';
import { heroStats } from './hero-stats.js';

function text(name: string) {
  return readFileSync(
    new URL(`../import/fixtures/${name}`, import.meta.url),
    'utf8',
  );
}

function hands(name: string) {
  return importHandHistory(text(name)).hands;
}

/** The one Hand a Hand History holds, read with the import module. */
function only(handHistory: string) {
  const [hand] = importHandHistory(handHistory).hands;
  expect(hand).toBeDefined();
  return hand;
}

/** The Hand History of one Hand of a fixture, by its hand ID. */
function oneHand(name: string, siteHandId: string): string {
  return text(name)
    .split(
      /(?=^(?:Poker Hand #|CoinPoker Hand #|PokerStars Hand #|Winamax Poker ))/m,
    )
    .find((block) => block.includes(siteHandId))!;
}

const passedBoth = {
  vpip: { opportunities: 1, taken: 0 },
  pfr: { opportunities: 1, taken: 0 },
};
const noChance = {
  vpip: { opportunities: 0, taken: 0 },
  pfr: { opportunities: 0, taken: 0 },
};

describe('Replay: the Hero’s Stats', () => {
  // Expected values are read by hand off each Hand History.
  it('counts VPIP and PFR when the Hero raised, folded or folded the big blind', () => {
    const stats = hands('pokerstars-session.txt').map(heroStats);

    expect(stats.map(({ vpip, pfr }) => ({ vpip, pfr }))).toEqual([
      // Folded the big blind to a raise.
      {
        vpip: { opportunities: 1, taken: 0 },
        pfr: { opportunities: 1, taken: 0 },
      },
      // Folded first in.
      {
        vpip: { opportunities: 1, taken: 0 },
        pfr: { opportunities: 1, taken: 0 },
      },
      // Opened with a raise.
      {
        vpip: { opportunities: 1, taken: 1 },
        pfr: { opportunities: 1, taken: 1 },
      },
      {
        vpip: { opportunities: 1, taken: 1 },
        pfr: { opportunities: 1, taken: 1 },
      },
    ]);
  });

  it('counts a call as VPIP but not PFR', () => {
    // HeroAI calls a raise from the big blind.
    const hand = only(oneHand('pokerstars-all-ins.txt', '262140000102'));

    expect(heroStats(hand)).toMatchObject({
      vpip: { opportunities: 1, taken: 1 },
      pfr: { opportunities: 1, taken: 0 },
    });
  });

  it('gives no chance in a walk, though the Hand counts', () => {
    // Everyone folds to iMapleAA's big blind.
    const walk = oneHand('pokerstars-session.txt', '262120715506')
      .replace('BIRCHWOODS: raises €0.15 to €0.25', 'BIRCHWOODS: folds')
      .replace('iMapleAA: folds\n', '')
      .replace(
        'Uncalled bet (€0.15) returned to BIRCHWOODS',
        'Uncalled bet (€0.05) returned to iMapleAA',
      )
      .replace(
        'BIRCHWOODS collected €0.25 from pot',
        'iMapleAA collected €0.10 from pot',
      )
      .replace("BIRCHWOODS: doesn't show hand", "iMapleAA: doesn't show hand")
      .replace('Total pot €0.25', 'Total pot €0.10')
      .replace(
        'BIRCHWOODS (button) collected (€0.25)',
        "BIRCHWOODS (button) folded before Flop (didn't bet)",
      )
      .replace(
        'iMapleAA (big blind) folded before Flop',
        'iMapleAA (big blind) collected (€0.10)',
      );

    expect(heroStats(only(walk))).toMatchObject(noChance);
  });

  it('never counts a straddle as putting money in voluntarily', () => {
    // CoinPoker Hand #159583401410 seen from the straddler, who gets a walk.
    const straddled = oneHand('coinpoker-session.txt', '4e097d34: STRADDLE')
      .replace('Dealt to Hero [9d 5d]', 'Dealt to 0a0a0a0a')
      .replace(/Hero/g, '0a0a0a0a')
      .replace(/Dealt to 4e097d34(?=\r?\n)/, 'Dealt to 4e097d34 [7c 2d]')
      .replace(/4e097d34/g, 'Hero');

    expect(heroStats(only(straddled))).toMatchObject(noChance);
  });

  it('counts the straddler’s fold to a raise as a chance passed up', () => {
    const folded = oneHand('ggpoker-session.txt', 'HD1180452290')
      .replace(
        /Hero: raises \$3\.5 to \$5\r?\na0d3f6e1: folds\r?\nUncalled bet \(\$3\.5\) returned to Hero/,
        'Hero: folds\nUncalled bet ($1) returned to a0d3f6e1',
      )
      .replace(
        'Hero collected $3.35 from pot',
        'a0d3f6e1 collected $1.35 from pot',
      )
      .replace('Total pot $3.35', 'Total pot $1.35')
      .replace('Seat 1: Hero won ($3.35)', 'Seat 1: Hero folded before Flop')
      .replace(
        'Seat 2: a0d3f6e1 folded before Flop',
        'Seat 2: a0d3f6e1 won ($1.35)',
      );

    expect(heroStats(only(folded))).toMatchObject(passedBoth);
  });

  it('never counts an ante as putting money in voluntarily', () => {
    // Hand #262130000102 seen from Ash4, who posts the ante and folds.
    const ante = oneHand('pokerstars-edge-cases.txt', '262130000102').replace(
      'Dealt to Hero9max [Ah Ad]',
      'Dealt to Ash4 [7h 2c]',
    );

    expect(heroStats(only(ante))).toMatchObject(passedBoth);
  });

  it('gives no PFR chance to a Hero facing an all-in their Stack can’t cover', () => {
    // HeroAI shoves from the small blind; Aces2 calls all in for the same $50.
    const shove = oneHand('pokerstars-all-ins.txt', '262140000101')
      .replace(
        'HeroAI: raises $1 to $1.50\nAces2: raises $48.50 to $50 and is all-in\nHeroAI: calls $48.50 and is all-in',
        'HeroAI: raises $49.50 to $50 and is all-in\nAces2: calls $49.50 and is all-in',
      )
      .replace('Dealt to HeroAI [Kd Kc]', 'Dealt to Aces2 [Ah As]');

    // Hand #262130000102 seen from Ash4, given $5: Elm_UTG's $9.95 all-in
    // covers them, though players behind could still answer a raise.
    const covered = oneHand('pokerstars-edge-cases.txt', '262130000102')
      .replace('Ash4 ($50 in chips)', 'Ash4 ($5 in chips)')
      .replace('Dealt to Hero9max [Ah Ad]', 'Dealt to Ash4 [7h 2c]');

    expect([only(shove), only(covered)].map(heroStats)).toMatchObject([
      {
        vpip: { opportunities: 1, taken: 1 },
        pfr: { opportunities: 0, taken: 0 },
      },
      {
        vpip: { opportunities: 1, taken: 0 },
        pfr: { opportunities: 0, taken: 0 },
      },
    ]);
  });

  it('gives no PFR chance to a Hero who can only call all in for less', () => {
    // As above, with Aces2 holding $30: they call all in for less, or fold.
    const shove = oneHand('pokerstars-all-ins.txt', '262140000101')
      .replace('Aces2 ($50 in chips)', 'Aces2 ($30 in chips)')
      .replace(
        'HeroAI: raises $1 to $1.50\nAces2: raises $48.50 to $50 and is all-in\nHeroAI: calls $48.50 and is all-in',
        'HeroAI: raises $49.50 to $50 and is all-in\nAces2: calls $29.50 and is all-in\nUncalled bet ($20) returned to HeroAI',
      )
      .replace('Total pot $100', 'Total pot $60')
      .replace('Dealt to HeroAI [Kd Kc]', 'Dealt to Aces2 [Ah As]');
    const folded = shove.replace(
      'Aces2: calls $29.50 and is all-in\nUncalled bet ($20)',
      'Aces2: folds\nUncalled bet ($49.50)',
    );

    expect([only(shove), only(folded)].map(heroStats)).toMatchObject([
      {
        vpip: { opportunities: 1, taken: 1 },
        pfr: { opportunities: 0, taken: 0 },
      },
      {
        vpip: { opportunities: 1, taken: 0 },
        pfr: { opportunities: 0, taken: 0 },
      },
    ]);
  });
});

describe('Replay: the Hero’s steal and blind Stats', () => {
  // Expected values are read by hand off each Hand History.
  const hand = (name: string, siteHandId: string) =>
    hands(name).find((h) => h.siteHandId === siteHandId)!;

  it('counts an Attempt to Steal when it is folded to the Hero in the cutoff, button or small blind', () => {
    expect(
      [
        // Folded to the Hero in the cutoff, who raises.
        hand('pokerstars-session.txt', '262120711267'),
        // Heads-up, the Hero raises from the button.
        hand('pokerstars-all-ins.txt', '262140000101'),
        // Folded to the Hero in the cutoff, who folds.
        hand('pokerstars-session.txt', '262120715010'),
        // The Hero on the button behind a player who posted a big blind to
        // come in and checked: still folded to, and the Hero folds.
        hand('coinpoker-session.txt', '159855200582'),
        // A limper in front: the Hero's raise from the button is no steal.
        hand('pokerstars-edge-cases.txt', '262130000104'),
        // A raise in front of the Hero's small blind.
        hand('winamax-session.txt', '20954312-7731-1757700000'),
        // The Hero in the big blind.
        hand('ggpoker-session.txt', 'HD1180452377'),
      ].map((h) => heroStats(h).steal),
    ).toEqual([
      { opportunities: 1, taken: 1 },
      { opportunities: 1, taken: 1 },
      { opportunities: 1, taken: 0 },
      { opportunities: 1, taken: 0 },
      { opportunities: 0, taken: 0 },
      { opportunities: 0, taken: 0 },
      { opportunities: 0, taken: 0 },
    ]);
  });

  it('counts a Fold BB to Steal when the Hero’s big blind faces a lone raise from the cutoff, button or small blind', () => {
    // Winamax Hand #20954312-7731 seen from Cedar31's big blind: Birch Woods
    // raises from the button, iMapleAA calls from the small blind.
    const stealCalled = only(
      oneHand('winamax-session.txt', '20954312-7731').replace(
        'Dealt to iMapleAA [Th 9h]',
        'Dealt to Cedar31 [7c 2d]',
      ),
    );

    expect(
      [
        // The button raises, the small blind folds, the Hero folds.
        hand('pokerstars-session.txt', '262120715506'),
        // The cutoff raises, the Hero folds.
        hand('coinpoker-session.txt', '160064400025'),
        // The cutoff raises, the Hero calls.
        hand('ggpoker-session.txt', 'HD1180452377'),
        // Heads-up, the button raises and the Hero calls.
        hand('pokerstars-all-ins.txt', '262140000102'),
        // A steal facing a caller is no steal to the big blind.
        stealCalled,
        // Nobody raises before the Hero's big blind.
        hand('coinpoker-session.txt', '159950300403'),
        // The Hero is not the big blind.
        hand('pokerstars-session.txt', '262120711267'),
      ].map((h) => heroStats(h)['fold-bb-to-steal']),
    ).toEqual([
      { opportunities: 1, taken: 1 },
      { opportunities: 1, taken: 1 },
      { opportunities: 1, taken: 0 },
      { opportunities: 1, taken: 0 },
      { opportunities: 0, taken: 0 },
      { opportunities: 0, taken: 0 },
      { opportunities: 0, taken: 0 },
    ]);
  });

  it('counts a Cold Call when the Hero calls a raise with no money in voluntarily, not a blind calling the open', () => {
    // Hand #262130000102 seen from Ash4, who folds to Elm_UTG's raise.
    const foldedToRaise = only(
      oneHand('pokerstars-edge-cases.txt', '262130000102').replace(
        'Dealt to Hero9max [Ah Ad]',
        'Dealt to Ash4 [7h 2c]',
      ),
    );
    // GG Hand #RC2104577321 seen from 0be55d17's big blind, who faces the
    // Hero's 3-bet with nothing in voluntarily and re-raises.
    const blindFacing3Bet = only(
      oneHand('ggpoker-session.txt', 'RC2104577321')
        .replace('Dealt to Hero [Ah Tc]', 'Dealt to Hero')
        .replace(/Dealt to 0be55d17 ?(?=\r?\n)/, 'Dealt to 0be55d17 [Qd Qs]'),
    );
    // Hand #262130000104 seen from Aspen1, who limps, then calls the raise.
    const limpedFirst = only(
      oneHand('pokerstars-edge-cases.txt', '262130000104').replace(
        'Dealt to Hero4 [Ad Jc]',
        'Dealt to Aspen1 [Ah Jd]',
      ),
    );

    expect(
      [
        // The Hero calls Elm_UTG's all-in raise.
        hand('pokerstars-edge-cases.txt', '262130000102'),
        foldedToRaise,
        blindFacing3Bet,
        // The big blind calls the open: no cold call.
        hand('ggpoker-session.txt', 'HD1180452377'),
        // The small blind calls the open: no cold call.
        hand('winamax-session.txt', '20954312-7731-1757700000'),
        limpedFirst,
        // The Hero opens.
        hand('pokerstars-session.txt', '262120711267'),
      ].map((h) => heroStats(h)['cold-call']),
    ).toEqual([
      { opportunities: 1, taken: 1 },
      { opportunities: 1, taken: 0 },
      { opportunities: 1, taken: 0 },
      { opportunities: 0, taken: 0 },
      { opportunities: 0, taken: 0 },
      { opportunities: 0, taken: 0 },
      { opportunities: 0, taken: 0 },
    ]);
  });
});
