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

/** The Hero's re-raise Stats in a Hand: 3-bet, 4-bet, the folds to them and Squeeze. */
function reRaises(hand: ReturnType<typeof only>) {
  const stats = heroStats(hand);
  return {
    'three-bet': stats['three-bet'],
    'fold-to-three-bet': stats['fold-to-three-bet'],
    'four-bet': stats['four-bet'],
    'fold-to-four-bet': stats['fold-to-four-bet'],
    squeeze: stats.squeeze,
  };
}

const took = { opportunities: 1, taken: 1 };
const didnt = { opportunities: 1, taken: 0 };
const none = { opportunities: 0, taken: 0 };

describe('Replay: the Hero’s preflop re-raise Stats', () => {
  it('counts a 3-bet taken and one passed up', () => {
    // Hero re-raises c19e0a88's open from the small blind.
    const reRaised = only(oneHand('ggpoker-session.txt', 'RC2104577321'));
    // Hero folds the big blind to ebe47eca's open.
    const folded = only(oneHand('coinpoker-session.txt', '160064400025'));

    expect([reRaised, folded].map(reRaises)).toMatchObject([
      { 'three-bet': took },
      { 'three-bet': didnt },
    ]);
  });

  it('counts each re-raise Stat taken, passed up or never there, on real Hands', () => {
    const hands = [
      // Hero 3-bets c19e0a88's open, then calls 0be55d17's all-in 4-bet.
      oneHand('ggpoker-session.txt', 'RC2104577321'),
      // Hero opens, 8b0b5f9d 3-bets, Hero calls.
      oneHand('coinpoker-session.txt', '160054200061'),
      // a9373981 opens, 7160fe9f 3-bets, Hero folds the small blind. The
      // import discards the Hand for running it twice, so it ends preflop.
      oneHand('coinpoker-session.txt', '159583401409').replace(
        /adf6e033: folds[\s\S]*$/,
        'adf6e033: folds\n',
      ),
      // HeroAI opens, Aces2 3-bets all in, HeroAI calls: no 4-bet chance.
      oneHand('pokerstars-all-ins.txt', '262140000101'),
      // Hero9max calls Elm_UTG's all-in open; Oak_BB's full 3-bet
      // reopens the betting, and Hero9max 4-bets.
      oneHand('pokerstars-edge-cases.txt', '262130000102'),
      // Hero raises a limp: an open, not a 3-bet.
      oneHand('pokerstars-edge-cases.txt', '262130000104'),
    ].map((handHistory) => reRaises(only(handHistory)));

    expect(hands).toEqual([
      {
        'three-bet': took,
        'fold-to-three-bet': none,
        'four-bet': none,
        'fold-to-four-bet': didnt,
        squeeze: none,
      },
      {
        'three-bet': none,
        'fold-to-three-bet': didnt,
        'four-bet': didnt,
        'fold-to-four-bet': none,
        squeeze: none,
      },
      {
        'three-bet': none,
        'fold-to-three-bet': none,
        'four-bet': didnt,
        'fold-to-four-bet': none,
        squeeze: none,
      },
      {
        'three-bet': none,
        'fold-to-three-bet': didnt,
        'four-bet': none,
        'fold-to-four-bet': none,
        squeeze: none,
      },
      {
        'three-bet': didnt,
        'fold-to-three-bet': none,
        'four-bet': took,
        'fold-to-four-bet': none,
        squeeze: none,
      },
      {
        'three-bet': none,
        'fold-to-three-bet': none,
        'four-bet': none,
        'fold-to-four-bet': none,
        squeeze: none,
      },
    ]);
  });

  it('counts a fold to a 3-bet and to a 4-bet as taken', () => {
    // Hand #160054200061 with Hero folding to the 3-bet.
    const foldedToThreeBet = oneHand(
      'coinpoker-session.txt',
      '160054200061',
    ).replace(/Hero: calls ₮0\.75[\s\S]*$/, 'Hero: folds\n');
    // Hand #RC2104577321 with Hero folding to the 4-bet.
    const foldedToFourBet = oneHand(
      'ggpoker-session.txt',
      'RC2104577321',
    ).replace(/Hero: calls \$3\.2[\s\S]*$/, 'Hero: folds\n');

    expect(
      [foldedToThreeBet, foldedToFourBet].map((h) => reRaises(only(h))),
    ).toMatchObject([
      { 'fold-to-three-bet': took, 'four-bet': didnt },
      { 'fold-to-four-bet': took },
    ]);
  });

  it('counts a squeeze as both a 3-bet and a Squeeze', () => {
    // Hand #262130000102 seen from Oak_BB, who re-raises Elm_UTG's open
    // after Hero9max and Spruce9 called it.
    const squeezed = oneHand(
      'pokerstars-edge-cases.txt',
      '262130000102',
    ).replace('Dealt to Hero9max [Ah Ad]', 'Dealt to Oak_BB [Qs Qc]');

    expect(reRaises(only(squeezed))).toEqual({
      'three-bet': took,
      'fold-to-three-bet': none,
      'four-bet': none,
      'fold-to-four-bet': none,
      squeeze: took,
    });
  });

  it('counts the first raise over a straddle as an open, not a 3-bet', () => {
    // Olive6 straddles, Cedar2 calls, Hero6 raises: an open.
    const opened = only(oneHand('pokerstars-edge-cases.txt', '262130000103'));
    // Hero straddles, a0d3f6e1 opens, Hero re-raises: a 3-bet.
    const reRaised = only(oneHand('ggpoker-session.txt', 'HD1180452290'));

    expect([opened, reRaised].map(reRaises)).toMatchObject([
      { 'three-bet': none, squeeze: none },
      { 'three-bet': took, squeeze: none },
    ]);
  });

  describe('a short all-in raise', () => {
    // Hand #RC2104577321 with Hero's Stack cut to $0.30: Hero's all-in
    // re-raise adds $0.05, short of the $0.15 a full raise takes.
    const shortThreeBet = oneHand('ggpoker-session.txt', 'RC2104577321')
      .replace('Seat 2: Hero ($10 in chips)', 'Seat 2: Hero ($0.3 in chips)')
      .replace(
        /Hero: raises \$0\.75 to \$1\r?\n[\s\S]*$/,
        [
          'Hero: raises $0.05 to $0.3 and is all-in',
          '0be55d17: calls $0.2',
          'c19e0a88: calls $0.05',
          '',
        ].join('\n'),
      );
    const seenBy = (screenName: string) =>
      shortThreeBet
        .replace('Dealt to Hero [Ah Tc]', 'Dealt to Hero ')
        .replace(`Dealt to ${screenName} `, `Dealt to ${screenName} [Kc Qc]`);

    it('counts as a raise for whoever made it', () => {
      expect(reRaises(only(shortThreeBet))).toMatchObject({
        'three-bet': took,
      });
    });

    it('reopens the betting for a player yet to act', () => {
      expect(reRaises(only(seenBy('0be55d17')))).toMatchObject({
        'three-bet': none,
        'four-bet': didnt,
      });
    });

    it('doesn’t reopen it for the raiser it answers', () => {
      expect(reRaises(only(seenBy('c19e0a88')))).toMatchObject({
        'fold-to-three-bet': didnt,
        'four-bet': none,
      });
    });
  });
});
