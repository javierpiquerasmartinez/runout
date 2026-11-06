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
    .split(/(?=^(?:Poker Hand #|CoinPoker Hand #|PokerStars Hand #))/m)
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

describe('Replay: the Hero’s C-bet Stats', () => {
  // Expected values are read by hand off each Hand History.
  const cbetStats = (hand: ReturnType<typeof only>) => {
    const stats = heroStats(hand);
    return {
      'cbet-flop': stats['cbet-flop'],
      'fold-to-cbet-flop': stats['fold-to-cbet-flop'],
      'cbet-turn': stats['cbet-turn'],
      'fold-to-cbet-turn': stats['fold-to-cbet-turn'],
      'cbet-river': stats['cbet-river'],
      'fold-to-cbet-river': stats['fold-to-cbet-river'],
    };
  };
  const none = { opportunities: 0, taken: 0 };
  const passed = { opportunities: 1, taken: 0 };
  const took = { opportunities: 1, taken: 1 };
  const noCbetChance = {
    'cbet-flop': none,
    'fold-to-cbet-flop': none,
    'cbet-turn': none,
    'fold-to-cbet-turn': none,
    'cbet-river': none,
    'fold-to-cbet-river': none,
  };

  it('counts a Flop C-bet when the preflop raiser bets a flop checked to them', () => {
    const stats = hands('pokerstars-session.txt').map(cbetStats);

    expect(stats).toEqual([
      // Folded the big blind preflop.
      noCbetChance,
      // Folded first in.
      noCbetChance,
      // Raised, then checked back a flop checked to them; folded to a turn
      // bet from the caller, which is no C-bet.
      { ...noCbetChance, 'cbet-flop': passed },
      // Raised, and bet a flop checked to them.
      { ...noCbetChance, 'cbet-flop': took },
    ]);
  });

  it('counts a Fold to Flop C-bet when the Hero faces the C-bet first', () => {
    // Hand #262120715010 seen from hazel1963, who checks and folds.
    const folded = oneHand('pokerstars-session.txt', '262120715010').replace(
      'Dealt to iMapleAA [4s Tc]',
      'Dealt to hazel1963 [7h 2c]',
    );
    // HeroAI checks and calls Aces2's C-bet.
    const called = oneHand('pokerstars-all-ins.txt', '262140000102');
    // Hero checks and raises 9b7c2e44's C-bet.
    const raised = oneHand('ggpoker-session.txt', 'HD1180452377');

    expect([folded, called, raised].map(only).map(cbetStats)).toEqual([
      { ...noCbetChance, 'fold-to-cbet-flop': took },
      { ...noCbetChance, 'fold-to-cbet-flop': passed },
      { ...noCbetChance, 'fold-to-cbet-flop': passed },
    ]);
  });

  /**
   * CoinPoker Hand #159855200581, changed by `edit`, then seen from
   * `screenName` and its Hero renamed.
   */
  function coinPokerFrom(
    screenName: string,
    cards: string,
    edit: (hand: string) => string = (hand) => hand,
  ) {
    return edit(oneHand('coinpoker-session.txt', '159855200581'))
      .replace('Dealt to Hero [As 3d]', 'Dealt to 0a0a0a0a')
      .replace(/Hero/g, '0a0a0a0a')
      .replace(
        new RegExp(`Dealt to ${screenName}(?=\\r?\\n)`),
        `Dealt to ${screenName} ${cards}`,
      )
      .replace(new RegExp(screenName, 'g'), 'Hero');
  }

  it('counts a Turn and River C-bet only after a C-bet on the Street before', () => {
    // 24dfed21 raises, bets flop and turn, and checks the river back;
    // fbfabc70 calls both C-bets and faces none on the river.
    const raiser = coinPokerFrom('24dfed21', '[Ks Ts]');
    const caller = coinPokerFrom('fbfabc70', '[5s 7h]');
    // HeroPL C-bets the flop and checks the turn back: no River C-bet chance.
    const checkedTurn = oneHand('pokerstars-pot-limit.txt', '262150000101');

    expect([raiser, caller, checkedTurn].map(only).map(cbetStats)).toEqual([
      {
        ...noCbetChance,
        'cbet-flop': took,
        'cbet-turn': took,
        'cbet-river': passed,
      },
      {
        ...noCbetChance,
        'fold-to-cbet-flop': passed,
        'fold-to-cbet-turn': passed,
      },
      { ...noCbetChance, 'cbet-flop': took, 'cbet-turn': passed },
    ]);
  });

  it('counts a River C-bet and the Fold to it', () => {
    // As Hand #159855200581, with 24dfed21 betting the river and fbfabc70 folding.
    const riverCbet = (hand: string) =>
      hand
        .replace(
          /24dfed21: checks(\r?\n)\*\*\* SHOWDOWN \*\*\*[\s\S]*?(?=\*\*\* SUMMARY)/,
          '24dfed21: bets ₮2$1fbfabc70: folds$1Uncalled bet (₮2) returned to 24dfed21$124dfed21 collected ₮3.25 from pot$1',
        )
        .replace(
          'Seat 3: fbfabc70 showed [5s 7h] and lost with One Pair',
          'Seat 3: fbfabc70 folded on the River',
        )
        .replace(
          'Seat 6: 24dfed21 showed [Ks Ts] and won (₮3.25) with One Pair',
          'Seat 6: 24dfed21 collected (₮3.25)',
        );
    const raiser = coinPokerFrom('24dfed21', '[Ks Ts]', riverCbet);
    const caller = coinPokerFrom('fbfabc70', '[5s 7h]', riverCbet);

    expect([raiser, caller].map(only).map(cbetStats)).toEqual([
      {
        ...noCbetChance,
        'cbet-flop': took,
        'cbet-turn': took,
        'cbet-river': took,
      },
      {
        ...noCbetChance,
        'fold-to-cbet-flop': passed,
        'fold-to-cbet-turn': passed,
        'fold-to-cbet-river': took,
      },
    ]);
  });

  it('counts a Fold to Turn C-bet', () => {
    // As Hand #159855200581, with fbfabc70 folding to the turn C-bet.
    const folded = coinPokerFrom('fbfabc70', '[5s 7h]', (hand) =>
      hand
        .replace(
          /fbfabc70: calls ₮1\.03[\s\S]*?(?=\*\*\* SUMMARY)/,
          'fbfabc70: folds\nUncalled bet (₮1.03) returned to 24dfed21\n24dfed21 collected ₮1.25 from pot\n',
        )
        .replace(
          'Seat 3: fbfabc70 showed [5s 7h] and lost with One Pair',
          'Seat 3: fbfabc70 folded on the Turn',
        )
        .replace(
          'Seat 6: 24dfed21 showed [Ks Ts] and won (₮3.25) with One Pair',
          'Seat 6: 24dfed21 collected (₮1.25)',
        ),
    );

    expect(cbetStats(only(folded))).toEqual({
      ...noCbetChance,
      'fold-to-cbet-flop': passed,
      'fold-to-cbet-turn': took,
    });
  });

  it('counts a multiway C-bet', () => {
    // Hero4 bets a flop checked to them by two callers, then checks the turn.
    const multiway = oneHand('pokerstars-edge-cases.txt', '262130000104');

    expect(cbetStats(only(multiway))).toEqual({
      ...noCbetChance,
      'cbet-flop': took,
      'cbet-turn': passed,
    });
  });

  it('gives no C-bet chance once someone bets before the preflop raiser', () => {
    // Hero6 C-bets the flop, and Olive6 leads the turn into them.
    const donked = oneHand('pokerstars-edge-cases.txt', '262130000103');
    // Hand #262120710959 with Larch_18 leading the flop into iMapleAA.
    const donkedFlop = oneHand('pokerstars-session.txt', '262120710959')
      .replace(
        'Larch_18: checks\niMapleAA: bets €0.20',
        'Larch_18: bets €0.20\niMapleAA: raises €0.20 to €0.40',
      )
      .replace(/€0\.61/g, '€0.81')
      .replace('Total pot €0.65', 'Total pot €0.85');

    expect([donked, donkedFlop].map(only).map(cbetStats)).toEqual([
      { ...noCbetChance, 'cbet-flop': took },
      noCbetChance,
    ]);
  });
});
