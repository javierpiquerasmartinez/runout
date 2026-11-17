import { readFileSync } from 'node:fs';
import { importHandHistory } from '../import/import.js';
import { heroFacts } from './hero-facts.js';

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

    expect(heroFacts(only(walk))).toEqual({
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
