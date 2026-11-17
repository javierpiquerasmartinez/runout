import { readFileSync } from 'node:fs';
import { importHandHistory } from '../import/import.js';
import { heroFacts, onStreet } from './hero-facts.js';
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

/** The Hero's cards on each Street, for a Hand that never reached the flop. */
const noStreetsSeen = {
  flopMadeHand: null,
  flopDraws: null,
  flopNuts: null,
  flopKicker: null,
  flopNutFlushDraw: null,
  turnMadeHand: null,
  turnDraws: null,
  turnNuts: null,
  turnKicker: null,
  turnNutFlushDraw: null,
  riverMadeHand: null,
  riverNuts: null,
  riverKicker: null,
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
      ...noStreetsSeen,
      ...unseen('flop'),
      ...unseen('turn'),
      ...unseen('river'),
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

/** Every fact of one Street empty: not dealt, or the Hero no longer in. */
function unseen(street: 'flop' | 'turn' | 'river') {
  const empty = [
    'Players',
    'Ip',
    'First',
    'Pot',
    'EffectiveStack',
    'Spr',
    'AllIn',
    'Line',
    'BetSize',
    'RaiseSize',
    'BetSizeFaced',
    'RaiseSizeFaced',
    'Bets',
    'Raises',
    'Calls',
    'Folds',
  ].map((fact) => [`${street}${fact}`, null]);
  return Object.fromEntries([[`${street}Saw`, false], ...empty]);
}

describe('Replay: the Hero’s facts, the situation on each postflop Street', () => {
  // Expected values are read by hand off each Hand History, in big blinds.
  it('describes a heads-up flop the Hero checks and raises out of position', () => {
    // Hero (BB, $26.85) calls 9b7c2e44's open to $0.75 (CO, $25): a pot of
    // $1.60 on the flop, 6.4 big blinds. 9b7c2e44 has $24.25 left, Hero
    // $26.10, so the effective stack is 97 big blinds and the SPR 15.2.
    // Hero checks, faces $0.80 (50 % of the pot) and raises to $3 (3.75
    // times the bet). The turn and the river aren't dealt.
    const hand = only(oneHand('ggpoker-session.txt', 'HD1180452377'));

    expect(heroFacts(hand)).toMatchObject({
      flopSaw: true,
      flopPlayers: 2,
      flopIp: false,
      flopFirst: true,
      flopPot: 6.4,
      flopEffectiveStack: 97,
      flopSpr: 15.2,
      flopAllIn: false,
      flopLine: 'XR',
      flopBetSize: null,
      flopRaiseSize: 3.75,
      flopBetSizeFaced: 50,
      flopRaiseSizeFaced: null,
      flopBets: 0,
      flopRaises: 1,
      flopCalls: 0,
      flopFolds: 0,
      ...unseen('turn'),
      ...unseen('river'),
    });
  });

  it('puts a Hero who acts between two players on a multiway flop neither IP nor first', () => {
    // Hand #262130000104 from Aspen1's seat (CO, €10): a limp, then calls of
    // Hero4's raise to €0.40 (BTN) by Willow4 (BB) and Aspen1. €1.25 on the
    // flop, 12.5 big blinds, every Stack €9.60: 96 big blinds, an SPR of
    // 7.7. Willow4 checks, Aspen1 checks and calls Hero4's €0.60 (48 %).
    // The turn is checked through; on the river, €3.05 in the pot, Aspen1
    // bets €1 (33 %) after Willow4 checks.
    const hand = only(
      oneHand('pokerstars-edge-cases.txt', '262130000104').replace(
        'Dealt to Hero4 [Ad Jc]',
        'Dealt to Aspen1 [Ah Jd]',
      ),
    );

    expect(heroFacts(hand)).toMatchObject({
      flopSaw: true,
      flopPlayers: 3,
      flopIp: false,
      flopFirst: false,
      flopPot: 12.5,
      flopEffectiveStack: 96,
      flopSpr: 7.7,
      flopLine: 'XC',
      flopBetSizeFaced: 48,
      flopCalls: 1,
      turnSaw: true,
      turnPlayers: 3,
      turnPot: 30.5,
      turnLine: 'X',
      turnBetSizeFaced: null,
      riverSaw: true,
      riverLine: 'B',
      riverBetSize: 33,
      riverBets: 1,
      riverCalls: 0,
    });
  });

  it('sizes the Hero’s bet, the raise they face, and the turn they call all in', () => {
    // Hero6 (BTN) bets $4.50 into $9.75 (46 %); Olive6 (the straddle, first
    // to act) raises to $15, 3.33 times it, and Hero6 calls. On the turn,
    // $39.75 in the pot and $31 behind each (SPR 0.8), Olive6 bets all in
    // (78 %) and Hero6 calls all in. The river finds Hero6 all in.
    const hand = only(oneHand('pokerstars-edge-cases.txt', '262130000103'));

    expect(heroFacts(hand)).toMatchObject({
      flopPlayers: 2,
      flopIp: true,
      flopFirst: false,
      flopPot: 19.5,
      flopLine: 'BC',
      flopBetSize: 46,
      flopRaiseSize: null,
      flopBetSizeFaced: null,
      flopRaiseSizeFaced: 3.33,
      flopBets: 1,
      flopCalls: 1,
      turnPot: 79.5,
      turnEffectiveStack: 62,
      turnSpr: 0.8,
      turnAllIn: false,
      turnLine: 'C',
      turnBetSizeFaced: 78,
      riverSaw: true,
      riverPlayers: 2,
      riverPot: 203.5,
      riverEffectiveStack: 0,
      riverSpr: 0,
      riverAllIn: true,
      riverLine: null,
      riverBets: 0,
      riverRaises: 0,
      riverCalls: 0,
      riverFolds: 0,
    });
  });

  it('follows a Hero all in preflop through every Street', () => {
    // HeroAI (BTN, heads-up) calls all in preflop: $100 in the pot, 200 big
    // blinds, and nothing left to bet on any Street.
    const hand = only(oneHand('pokerstars-all-ins.txt', '262140000101'));

    const allIn = {
      saw: true,
      players: 2,
      ip: true,
      first: false,
      pot: 200,
      effectiveStack: 0,
      spr: 0,
      allIn: true,
      line: null,
      betSize: null,
      raiseSize: null,
      betSizeFaced: null,
      raiseSizeFaced: null,
      bets: 0,
      raises: 0,
      calls: 0,
      folds: 0,
    };
    expect(heroFacts(hand)).toMatchObject({
      ...onStreet('flop', allIn),
      ...onStreet('turn', allIn),
      ...onStreet('river', allIn),
    });
  });

  it('leaves the turn and the river empty after the Hero folds the flop', () => {
    // Hero checks the big blind in a limped pot, ₮0.86 with the antes, and
    // folds to a ₮0.43 bet (50 %). The turn and the river aren't dealt.
    const hand = only(oneHand('coinpoker-ante.txt', '172668000015'));

    expect(heroFacts(hand)).toMatchObject({
      flopSaw: true,
      flopLine: 'F',
      flopBetSizeFaced: 50,
      flopFolds: 1,
      ...unseen('turn'),
      ...unseen('river'),
    });
  });

  it('leaves a Street the Hero folded before empty, though it was dealt', () => {
    // iMapleAA folds preflop; the flop is dealt for the others.
    const hand = only(oneHand('pokerstars-session.txt', '262120715010'));

    expect(heroFacts(hand)).toMatchObject({
      ...unseen('flop'),
      ...unseen('turn'),
      ...unseen('river'),
    });
  });
});

describe('Replay: the Board’s texture on each Street', () => {
  // Texture reads the Board alone, so each test deals its own on this Hand.
  const hand = only(oneHand('pokerstars-session.txt', '262120715506'));
  const dealt = (cards: string) =>
    heroFacts({ ...hand, board: cards.split(' ') });

  it('describes the flop, the turn and the river as each was dealt', () => {
    expect(dealt('Kh 9h 4h 9s 10h')).toMatchObject({
      flopSuits: 'monotone',
      flopPairing: 'unpaired',
      flopStraightPossible: false,
      flopConnectedness: 2,
      flopHighCard: 'K',
      turnSuits: 'flush-possible',
      turnPairing: 'paired',
      turnStraightPossible: false,
      turnConnectedness: 2,
      turnHighCard: 'K',
      turnPairsBoard: true,
      turnBringsFlush: false,
      turnBringsStraight: false,
      turnOvercard: false,
      riverSuits: 'four-of-a-suit',
      riverPairing: 'paired',
      riverStraightPossible: true,
      riverConnectedness: 3,
      riverHighCard: 'K',
      riverPairsBoard: false,
      riverBringsFlush: true,
      riverBringsStraight: true,
      riverOvercard: false,
    });
  });

  const emptyTurn = {
    turnSuits: null,
    turnPairing: null,
    turnStraightPossible: null,
    turnConnectedness: null,
    turnHighCard: null,
    turnPairsBoard: null,
    turnBringsFlush: null,
    turnBringsStraight: null,
    turnOvercard: null,
  };

  it('leaves a Street’s texture empty when it wasn’t dealt', () => {
    expect(dealt('8h 5d 2c')).toMatchObject({
      flopSuits: 'rainbow',
      ...emptyTurn,
      riverSuits: null,
      riverOvercard: null,
    });
    expect(heroFacts({ ...hand, board: [] })).toMatchObject({
      flopSuits: null,
      flopPairing: null,
      flopStraightPossible: null,
      flopConnectedness: null,
      flopHighCard: null,
      ...emptyTurn,
    });
  });

  it('describes a Board the Hero didn’t see', () => {
    // iMapleAA folds preflop; the flop is Qs Qd Ts and the Hand ends there.
    const folded = only(oneHand('pokerstars-session.txt', '262120715010'));

    expect(heroFacts(folded)).toMatchObject({
      flopSuits: 'two-tone',
      flopPairing: 'paired',
      flopStraightPossible: false,
      flopConnectedness: 2,
      flopHighCard: 'Q',
      ...emptyTurn,
    });
  });
});

describe('Replay: the Hero’s facts, their cards on each Street', () => {
  // Hero4 holds Ad Jc and stays in to the river: As 8h 3c, Kd, Qs.
  const toTheRiver = () =>
    only(oneHand('pokerstars-edge-cases.txt', '262130000104'));

  /** Hero4's Hand, with other hole cards and another Board. */
  function dealt(hole: string, board: string) {
    const hand = toTheRiver();
    return heroFacts({
      ...hand,
      hero: { ...hand.hero, cards: hole.split(' ') },
      board: board.split(' '),
    });
  }

  // Expected values are read by hand off each Hand History or Board.
  it('names the Made Hand, the Draws, the nuts and the kicker on each Street', () => {
    expect(heroFacts(toTheRiver())).toMatchObject({
      // A J on A 8 3: top pair, with K and Q above the jack still out.
      flopMadeHand: 'top-pair',
      flopDraws: [],
      flopNuts: false,
      flopKicker: 'weak',
      flopNutFlushDraw: false,
      // The king comes: only the queen is above the jack now.
      turnMadeHand: 'top-pair',
      turnDraws: [],
      turnNuts: false,
      turnKicker: 'second',
      turnNutFlushDraw: false,
      // And the queen: the jack is the highest rank not on the Board.
      riverMadeHand: 'top-pair',
      riverNuts: false,
      riverKicker: 'top',
    });
  });

  it('gives the Draws and combination Draws on the flop and the turn', () => {
    // iMapleAA's Qc Tc on 3d 6h 9s, then the 8c, and folds to the turn's bet.
    const hand = only(oneHand('pokerstars-session.txt', '262120711267'));

    expect(heroFacts(hand)).toMatchObject({
      flopMadeHand: 'nothing',
      flopDraws: ['overcards'],
      // A jack or a seven: two ranks make the straight.
      turnMadeHand: 'nothing',
      turnDraws: ['open-ended-two-cards', 'overcards'],
      riverMadeHand: null,
    });
    // A flush draw with a pair of tens, and the two combined.
    expect(dealt('Kh Th', 'Ah Td 4h').flopDraws).toEqual([
      'flush-draw',
      'flush-draw-pair',
    ]);
  });

  it('leaves out the Streets the Hero didn’t see', () => {
    // iMapleAA folds preflop; the Board was never dealt.
    const folded = only(oneHand('pokerstars-session.txt', '262120715506'));
    // Hero6 calls all in on the turn: the river is theirs too.
    const allIn = only(oneHand('pokerstars-edge-cases.txt', '262130000103'));

    expect(heroFacts(folded)).toMatchObject(noStreetsSeen);
    expect(heroFacts(allIn)).toMatchObject({
      // Top set on a rainbow 9 5 2.
      flopMadeHand: 'set',
      flopNuts: true,
      flopKicker: null,
      // A higher set is possible once the jack comes, and a bigger full
      // house when the five pairs the Board.
      turnNuts: false,
      riverMadeHand: 'full-house',
      riverNuts: false,
    });
    // A Board that stops at the flop has no turn.
    expect(dealt('Ad Jc', 'As 8h 3c')).toMatchObject({
      turnMadeHand: null,
      riverMadeHand: null,
    });
    // iMapleAA folds on the turn, so a river dealt after is not theirs.
    const turnFold = only(oneHand('pokerstars-session.txt', '262120711267'));
    expect(
      heroFacts({ ...turnFold, board: [...turnFold.board, 'Jd'] }),
    ).toMatchObject({ turnMadeHand: 'nothing', riverMadeHand: null });
  });

  it('calls a hand the nuts when no two cards beat it, a tie included', () => {
    // Top pair, top kicker on A 7 2 loses to a set.
    expect(dealt('Ah Kd', 'As 7c 2d').flopNuts).toBe(false);
    // The ace-high flush on the river, with no pair and no straight flush.
    expect(dealt('Ah 4h', 'Kh 9h 2h 7c 3s').riverNuts).toBe(true);
    // A broadway on the Board: everyone ties it, nobody beats it.
    expect(dealt('2c 3h', '10s Js Qd Kc Ad').riverNuts).toBe(true);
  });

  it('rates the kicker only when the Made Hand uses one hole card', () => {
    expect(
      ['Ah Kd', 'Ah Qd', 'Ah Jd'].map(
        (hole) => dealt(hole, 'As 7c 2d').flopKicker,
      ),
    ).toEqual(['top', 'second', 'weak']);
    // Trips on a paired Board: the ace is the highest rank not on it.
    expect(dealt('Ah 7d', '7s 7c 2d')).toMatchObject({
      flopMadeHand: 'trips',
      flopKicker: 'top',
    });
    // A pocket pair, and a hand using both cards.
    expect(dealt('Kh Kd', 'As 7c 2d').flopKicker).toBeNull();
    expect(dealt('Ah 7d', 'As 7c 2d')).toMatchObject({
      flopMadeHand: 'two-pair',
      flopKicker: null,
    });
  });

  it('calls a flush draw the nut one when no higher card of its suit is out', () => {
    expect(
      ['Ah 5h', 'Kh 5h', 'Qh 5h'].map(
        (hole) => dealt(hole, 'Jh 8h 2c').flopNutFlushDraw,
      ),
    ).toEqual([true, false, false]);
    // The king, with the ace on the Board.
    expect(dealt('Kh 5h', 'Ah 8h 2c').flopNutFlushDraw).toBe(true);
    // A backdoor never counts.
    expect(dealt('Ah 5h', '8h 2c 3d')).toMatchObject({
      flopDraws: expect.arrayContaining(['backdoor-two-cards']),
      flopNutFlushDraw: false,
    });
    // On the turn too.
    expect(dealt('Ah 5h', 'Jh 8c 2c 3h').turnNutFlushDraw).toBe(true);
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
