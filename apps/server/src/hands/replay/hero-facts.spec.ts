import { readFileSync } from 'node:fs';
import { importHandHistory } from '../import/import.js';
import { heroFacts } from './hero-facts.js';
import { heroOutcome } from './hero-result.js';
import { heroStats } from './hero-stats.js';

function text(name: string) {
  return readFileSync(
    new URL(`../import/fixtures/${name}`, import.meta.url),
    'utf8',
  );
}

/** The Hand History of one Hand of a fixture, by its hand ID. */
function oneHand(name: string, siteHandId: string): string {
  return text(name)
    .split(
      /(?=^(?:Poker Hand #|CoinPoker Hand #|PokerStars Hand #|Winamax Poker ))/m,
    )
    .find((block) => block.includes(siteHandId))!;
}

/** The one Hand a Hand History holds, read with the import module. */
function only(handHistory: string) {
  const [hand] = importHandHistory(handHistory).hands;
  expect(hand).toBeDefined();
  return hand;
}

const nobodyRaised = {
  openerPosition: null,
  threeBettorPosition: null,
  fourBettorPosition: null,
  aggressorPosition: null,
  heroAggressor: false,
};

describe('Replay: the Hero’s facts, table and Hero', () => {
  // Expected values are read by hand off each Hand History.
  it('counts the players dealt in, leaving out those sitting out', () => {
    // Five seated, Dogwood55 sitting out.
    const hand = only(oneHand('pokerstars-session.txt', '262120715506'));

    expect(heroFacts(hand)).toMatchObject({
      playersDealt: 4,
      heroPosition: 'BB',
    });
  });

  it('writes the Hero’s Combo as the Lab does, and its Hand Class', () => {
    // iMapleAA holds 4c Jc; HeroAI 7c 7d; Hero Ah Tc; Hero9max Ah Ad.
    const suited = only(oneHand('pokerstars-session.txt', '262120715506'));
    const pair = only(oneHand('pokerstars-all-ins.txt', '262140000102'));
    const offsuit = only(oneHand('ggpoker-session.txt', 'RC2104577321'));
    const aces = only(oneHand('pokerstars-edge-cases.txt', '262130000102'));

    expect(
      [suited, pair, offsuit, aces].map((hand) => {
        const { heroCombo, heroHandClass } = heroFacts(hand);
        return [heroCombo, heroHandClass];
      }),
    ).toEqual([
      ['Jc4c', 'J4s'],
      ['7d7c', '77'],
      ['AhTc', 'ATo'],
      ['AhAd', 'AA'],
    ]);
  });

  it('names the Hero’s Position heads-up, and with a dead button', () => {
    const headsUp = only(oneHand('pokerstars-edge-cases.txt', '262130000101'));
    // The showdown Hand, with seat 4's button dead: iMapleAA (seat 5) posts
    // the small blind and Alder239 (seat 1) the big blind.
    const [showdown] = importHandHistory(text('pokerstars-showdown.txt')).hands;
    const deadButton = {
      ...showdown,
      buttonSeat: 4,
      posts: [
        { screenName: 'iMapleAA', kind: 'small-blind' as const, amount: 5 },
        { screenName: 'Alder239', kind: 'big-blind' as const, amount: 10 },
      ],
    };

    expect(heroFacts(headsUp)).toMatchObject({
      playersDealt: 2,
      heroPosition: 'BTN',
    });
    expect(heroFacts(deadButton)).toMatchObject({
      playersDealt: 4,
      heroPosition: 'SB',
      // iMapleAA raises first, from the small blind.
      openerPosition: 'SB',
    });
  });
});

describe('Replay: the Hero’s facts, the pot’s shape', () => {
  // Expected values are read by hand off each Hand History.
  it('calls a Hand everyone folded to the big blind a walk', () => {
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

    expect(heroFacts(only(walk))).toMatchObject({
      playersDealt: 4,
      heroPosition: 'BB',
      heroCombo: 'Jc4c',
      heroHandClass: 'J4s',
      potType: 'walk',
      ...nobodyRaised,
    });
  });

  it('calls a Hand folded to a straddle a walk', () => {
    // Everyone folds to 4e097d34's straddle, the Hero's big blind too.
    const hand = only(oneHand('coinpoker-session.txt', '159950300403'));

    expect(heroFacts(hand)).toMatchObject({
      playersDealt: 5,
      heroPosition: 'BB',
      potType: 'walk',
      ...nobodyRaised,
    });
  });

  it('calls a Hand with calls and no raise limped', () => {
    // The small blind completes and the big blind checks; the Hero folded.
    const hand = only(oneHand('coinpoker-session.txt', '159855200579'));

    expect(heroFacts(hand)).toMatchObject({
      playersDealt: 5,
      heroPosition: 'HJ',
      potType: 'limped',
      ...nobodyRaised,
    });
  });

  it('calls a Hand with one raise single-raised, the opener its aggressor', () => {
    // iMapleAA folds the big blind to BIRCHWOODS' open from the button.
    const folded = only(oneHand('pokerstars-session.txt', '262120715506'));
    // iMapleAA opens from the cutoff and Cedar31lse calls.
    const opened = only(oneHand('pokerstars-session.txt', '262120711267'));
    // Aspen1 limps and Hero4 raises from the button: one raise.
    const isolated = only(oneHand('pokerstars-edge-cases.txt', '262130000104'));

    expect([folded, opened, isolated].map(heroFacts)).toMatchObject([
      {
        potType: 'single-raised',
        openerPosition: 'BTN',
        threeBettorPosition: null,
        fourBettorPosition: null,
        aggressorPosition: 'BTN',
        heroAggressor: false,
      },
      {
        heroPosition: 'CO',
        potType: 'single-raised',
        openerPosition: 'CO',
        aggressorPosition: 'CO',
        heroAggressor: true,
      },
      {
        heroPosition: 'BTN',
        potType: 'single-raised',
        openerPosition: 'BTN',
        aggressorPosition: 'BTN',
        heroAggressor: true,
      },
    ]);
  });

  it('counts an open-shove as the one raise of a single-raised pot', () => {
    // HeroAI shoves from the button; Aces2 calls all in.
    const shove = oneHand('pokerstars-all-ins.txt', '262140000101').replace(
      'HeroAI: raises $1 to $1.50\nAces2: raises $48.50 to $50 and is all-in\nHeroAI: calls $48.50 and is all-in',
      'HeroAI: raises $49.50 to $50 and is all-in\nAces2: calls $49.50 and is all-in',
    );

    expect(heroFacts(only(shove))).toMatchObject({
      playersDealt: 2,
      heroPosition: 'BTN',
      potType: 'single-raised',
      openerPosition: 'BTN',
      aggressorPosition: 'BTN',
      heroAggressor: true,
    });
  });

  it('treats the first raise over a straddle as the open', () => {
    // Olive6 straddles, Cedar2 calls, Hero6 raises from the button.
    const hand = only(oneHand('pokerstars-edge-cases.txt', '262130000103'));

    expect(heroFacts(hand)).toMatchObject({
      playersDealt: 6,
      heroPosition: 'BTN',
      potType: 'single-raised',
      openerPosition: 'BTN',
      threeBettorPosition: null,
      aggressorPosition: 'BTN',
      heroAggressor: true,
    });
  });

  it('calls a Hand with two raises a 3-bet pot', () => {
    // HeroAI opens the button, Aces2 3-bets all in from the big blind.
    const called = only(oneHand('pokerstars-all-ins.txt', '262140000101'));
    // Hero straddles from the hijack, a0d3f6e1 opens the cutoff, Hero 3-bets.
    const straddled = only(oneHand('ggpoker-session.txt', 'HD1180452290'));

    expect([called, straddled].map(heroFacts)).toMatchObject([
      {
        heroPosition: 'BTN',
        potType: '3-bet',
        openerPosition: 'BTN',
        threeBettorPosition: 'BB',
        fourBettorPosition: null,
        aggressorPosition: 'BB',
        heroAggressor: false,
      },
      {
        playersDealt: 5,
        heroPosition: 'HJ',
        potType: '3-bet',
        openerPosition: 'CO',
        threeBettorPosition: 'HJ',
        aggressorPosition: 'HJ',
        heroAggressor: true,
      },
    ]);
  });

  it('counts a short all-in raise as a raise', () => {
    // Hand #RC2104577321 with Hero's Stack cut to $0.30: Hero's all-in
    // re-raise from the small blind adds $0.05, short of a full raise.
    const short = oneHand('ggpoker-session.txt', 'RC2104577321')
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

    expect(heroFacts(only(short))).toMatchObject({
      heroPosition: 'SB',
      potType: '3-bet',
      openerPosition: 'UTG',
      threeBettorPosition: 'SB',
      aggressorPosition: 'SB',
      heroAggressor: true,
    });
  });

  it('calls a Hand with three raises a 4-bet pot', () => {
    // c19e0a88 opens UTG, Hero 3-bets the small blind, 0be55d17 4-bets all
    // in from the big blind and Hero calls.
    const called = only(oneHand('ggpoker-session.txt', 'RC2104577321'));
    // Elm_UTG open-shoves short, Oak_BB 3-bets all in, Hero9max 4-bets
    // from the hijack.
    const fourBet = only(oneHand('pokerstars-edge-cases.txt', '262130000102'));

    expect([called, fourBet].map(heroFacts)).toMatchObject([
      {
        playersDealt: 6,
        potType: '4-bet',
        openerPosition: 'UTG',
        threeBettorPosition: 'SB',
        fourBettorPosition: 'BB',
        aggressorPosition: 'BB',
        heroAggressor: false,
      },
      {
        playersDealt: 9,
        heroPosition: 'HJ',
        potType: '4-bet',
        openerPosition: 'UTG',
        threeBettorPosition: 'BB',
        fourBettorPosition: 'HJ',
        aggressorPosition: 'HJ',
        heroAggressor: true,
      },
    ]);
  });

  it('calls a Hand with four raises or more a 5-bet+ pot', () => {
    // Hand #HD1180452290 with a0d3f6e1 4-betting Hero's 3-bet, and Hero
    // 5-betting all in.
    const fiveBet = oneHand('ggpoker-session.txt', 'HD1180452290')
      .replace(
        /a0d3f6e1: folds\r?\nUncalled bet \(\$3\.5\) returned to Hero/,
        [
          'a0d3f6e1: raises $7 to $12',
          'Hero: raises $13 to $25 and is all-in',
          'a0d3f6e1: folds',
          'Uncalled bet ($13) returned to Hero',
        ].join('\n'),
      )
      .replace(
        'Hero collected $3.35 from pot',
        'Hero collected $24.35 from pot',
      );

    expect(heroFacts(only(fiveBet))).toMatchObject({
      potType: '5-bet-plus',
      openerPosition: 'CO',
      threeBettorPosition: 'HJ',
      fourBettorPosition: 'CO',
      aggressorPosition: 'HJ',
      heroAggressor: true,
    });
  });
});

describe('Replay: the Hero’s facts, Showdown and Result', () => {
  // Hand #262130000104 with Hero4 folding the river to Aspen1's bet, which
  // Willow4 calls and loses.
  const foldedRiver = oneHand('pokerstars-edge-cases.txt', '262130000104')
    .replace('Hero4: calls €1', 'Hero4: folds')
    .replace(/Hero4: shows \[Ad Jc\] \(a pair of Aces\)\r?\n/, '')
    .replace(
      /Hero4 collected €2\.98 from pot\r?\nAspen1 collected €2\.97 from pot/,
      'Aspen1 collected €4.95 from pot',
    )
    .replace('Total pot €6.05', 'Total pot €5.05');

  it('tells the Street the Hero folded on, and none when they didn’t', () => {
    const preflop = only(oneHand('pokerstars-session.txt', '262120715506'));
    const turn = only(oneHand('pokerstars-session.txt', '262120711267'));
    const neverFolded = only(
      oneHand('pokerstars-showdown.txt', '262120750636'),
    );

    expect(
      [preflop, turn, only(foldedRiver), neverFolded].map(
        (hand) => heroFacts(hand).heroFoldedOn,
      ),
    ).toEqual(['preflop', 'turn', 'river', null]);
  });

  it('tells the Street the Hero went all in on', () => {
    // HeroAI calls all in preflop, then on the flop; Hero6 on the turn.
    const preflop = only(oneHand('pokerstars-all-ins.txt', '262140000101'));
    const flop = only(oneHand('pokerstars-all-ins.txt', '262140000102'));
    const turn = only(oneHand('pokerstars-edge-cases.txt', '262130000103'));
    const never = only(oneHand('pokerstars-showdown.txt', '262120750636'));

    expect(
      [preflop, flop, turn, never].map((hand) => heroFacts(hand).heroAllInOn),
    ).toEqual(['preflop', 'flop', 'turn', null]);
  });

  it('tells the all-in the Hero faced, its Street and how they answered', () => {
    // Aces2 shoves over HeroAI's open, and HeroAI calls; Aces2 shoves the
    // flop, and HeroAI calls; Cedar31 shoves over iMapleAA's open, and
    // iMapleAA re-raises all in after Birch Woods calls.
    const called = only(oneHand('pokerstars-all-ins.txt', '262140000101'));
    const calledFlop = only(oneHand('pokerstars-all-ins.txt', '262140000102'));
    const raised = only(
      oneHand('winamax-session.txt', '20954312-7733-1757700200'),
    );
    // Hand #262130000103 with Hero6 folding to Olive6's turn shove.
    const folded = only(
      oneHand('pokerstars-edge-cases.txt', '262130000103')
        .replace(
          /Hero6: calls \$31 and is all-in[\s\S]*Olive6 collected \$98\.75 from pot/,
          [
            'Hero6: folds',
            'Uncalled bet ($31) returned to Olive6',
            'Olive6 collected $36.75 from pot',
          ].join('\n'),
        )
        .replace('Total pot $101.75', 'Total pot $39.75')
        .replace('Board [9d 5c 2h Jc 5h]', 'Board [9d 5c 2h Jc]'),
    );
    const none = only(oneHand('pokerstars-showdown.txt', '262120750636'));

    expect(
      [called, calledFlop, raised, folded, none].map((hand) => {
        const { heroFacedAllInOn, heroFacedAllInAnswer } = heroFacts(hand);
        return [heroFacedAllInOn, heroFacedAllInAnswer];
      }),
    ).toEqual([
      ['preflop', 'call'],
      ['flop', 'call'],
      ['preflop', 'raise'],
      ['turn', 'fold'],
      [null, null],
    ]);
    expect(heroFacts(folded).heroFoldedOn).toBe('turn');
  });

  it('counts a split pot and a side pot won alone as won money, at Showdown', () => {
    // Hero4 splits the pot with Aspen1; Hero9max takes both side pots and
    // loses the main pot to Elm_UTG.
    const split = only(oneHand('pokerstars-edge-cases.txt', '262130000104'));
    const sidePots = only(oneHand('pokerstars-edge-cases.txt', '262130000102'));

    for (const hand of [split, sidePots]) {
      expect(heroFacts(hand)).toMatchObject({
        heroWonMoney: true,
        heroWonAtShowdown: true,
      });
    }
  });

  it('counts a Hero all in preflop and run out to Showdown as reaching it', () => {
    // HeroAI calls all in preflop with KdKc and wins; on the next Hand, all
    // in on the flop with 7c7d, they lose.
    const won = only(oneHand('pokerstars-all-ins.txt', '262140000101'));
    const lost = only(oneHand('pokerstars-all-ins.txt', '262140000102'));

    expect(heroOutcome(won).reachedShowdown).toBe(true);
    expect(heroFacts(won)).toMatchObject({
      heroAllInOn: 'preflop',
      heroWonMoney: true,
      heroWonAtShowdown: true,
    });
    expect(heroOutcome(lost).reachedShowdown).toBe(true);
    expect(heroFacts(lost)).toMatchObject({
      heroWonMoney: false,
      heroWonAtShowdown: false,
    });
  });

  it('wins money without Showdown when everyone folds to the Hero', () => {
    // iMapleAA bets the flop and everyone folds.
    const hand = only(oneHand('pokerstars-session.txt', '262120710959'));

    expect(heroFacts(hand)).toMatchObject({
      heroFoldedOn: null,
      heroWonMoney: true,
      heroWonAtShowdown: false,
    });
  });

  it('gives WTSD, W$SD and WWSF the values the Hero Stats give, on every fixture', () => {
    const hands = FIXTURE_FILES.flatMap(
      (name) => importHandHistory(text(name)).hands,
    );
    expect(hands.length).toBeGreaterThan(20);

    const count = (fact: boolean) => (fact ? 1 : 0);
    for (const hand of hands) {
      const facts = heroFacts(hand);
      // Reached Showdown is the Hand's own column, worked out with its Result.
      const reachedShowdown = count(heroOutcome(hand).reachedShowdown);
      const sawFlop = count(
        hand.board.length >= 3 && facts.heroFoldedOn !== 'preflop',
      );
      const { wtsd, wsd, wwsf } = heroStats(hand);

      expect(
        {
          wtsd: { opportunities: sawFlop, taken: reachedShowdown },
          wsd: {
            opportunities: reachedShowdown,
            taken: count(facts.heroWonAtShowdown),
          },
          wwsf: {
            opportunities: sawFlop,
            taken: count(sawFlop === 1 && facts.heroWonMoney),
          },
        },
        hand.siteHandId,
      ).toEqual({ wtsd, wsd, wwsf });
    }
  });
});

/** Every fixture the import module reads Hands from. */
const FIXTURE_FILES = [
  'coinpoker-ante.txt',
  'coinpoker-session.txt',
  'ggpoker-session.txt',
  'pokerstars-all-ins.txt',
  'pokerstars-edge-cases.txt',
  'pokerstars-pot-limit.txt',
  'pokerstars-session.txt',
  'pokerstars-showdown.txt',
  'pokerstars-ten-max.txt',
  'winamax-session.txt',
];
