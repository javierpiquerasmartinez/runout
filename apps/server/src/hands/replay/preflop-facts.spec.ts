import { readdirSync, readFileSync } from 'node:fs';
import { importHandHistory } from '../import/import.js';
import { heroFacts } from './hero-facts.js';
import { heroStats } from './hero-stats.js';

const FIXTURES = new URL('../import/fixtures/', import.meta.url);

function text(name: string) {
  return readFileSync(new URL(name, FIXTURES), 'utf8');
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

/** Every Hand the fixture corpus reads. */
function everyFixtureHand() {
  return readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.txt'))
    .flatMap((name) => importHandHistory(text(name)).hands);
}

describe('Replay: the Hero’s preflop Actions agree with the Hero Stats', () => {
  it('gives every Action a Stat counts the same chance and did on every fixture', () => {
    const hands = everyFixtureHand();
    expect(hands.length).toBeGreaterThan(20);
    for (const hand of hands) {
      const stats = heroStats(hand);
      const facts = heroFacts(hand);
      const pair = (chance: boolean, did: boolean) => ({
        opportunities: chance ? 1 : 0,
        taken: did ? 1 : 0,
      });
      const folded = (faced: boolean, answer: string | null) =>
        pair(faced, faced && answer === 'fold');
      const id = hand.siteHandId;
      expect(pair(facts.vpipChance, facts.vpipDid), id).toEqual(stats.vpip);
      expect(pair(facts.pfrChance, facts.pfrDid), id).toEqual(stats.pfr);
      expect(pair(facts.stealChance, facts.stealDid), id).toEqual(stats.steal);
      expect(pair(facts.threeBetChance, facts.threeBetDid), id).toEqual(
        stats['three-bet'],
      );
      expect(pair(facts.squeezeChance, facts.squeezeDid), id).toEqual(
        stats.squeeze,
      );
      expect(pair(facts.coldCallChance, facts.coldCallDid), id).toEqual(
        stats['cold-call'],
      );
      expect(pair(facts.fourBetChance, facts.fourBetDid), id).toEqual(
        stats['four-bet'],
      );
      expect(folded(facts.threeBetFaced, facts.threeBetAnswer), id).toEqual(
        stats['fold-to-three-bet'],
      );
      expect(folded(facts.fourBetFaced, facts.fourBetAnswer), id).toEqual(
        stats['fold-to-four-bet'],
      );
      expect(
        folded(
          facts.stealFaced && facts.heroPosition === 'BB',
          facts.stealAnswer,
        ),
        id,
      ).toEqual(stats['fold-bb-to-steal']);
    }
  });
});

describe('Replay: the Hero’s preflop Actions and role', () => {
  // Expected values are read by hand off each Hand History.

  it('calls an open that then called a 3-bet "called a 3-bet", and a 3-bet of a steal from a blind a resteal faced', () => {
    // Hero opens the button, 8b0b5f9d 3-bets from the small blind, Hero calls.
    const hand = only(oneHand('coinpoker-session.txt', '160054200061'));

    expect(heroFacts(hand)).toMatchObject({
      heroPosition: 'BTN',
      preflopRole: 'called-3-bet',
      preflopFacedFirst: 'unopened',
      preflopLine: 'RC',
      openDid: true,
      openChance: true,
      stealDid: true,
      stealChance: true,
      threeBetChance: false,
      threeBetFaced: true,
      threeBetAnswer: 'call',
      restealFaced: true,
      restealAnswer: 'call',
      squeezeFaced: false,
      fourBetChance: true,
      fourBetDid: false,
      vpipDid: true,
      pfrDid: true,
      limpers: 0,
      openSize: 2.5,
      threeBetSize: 4,
      heroRaiseSize: 2.5,
      heroRaiseMultiple: 2.5,
      sizeFaced: null,
      heroStartingStack: 101.7,
      preflopEffectiveStack: 101.7,
      straddle: false,
      antes: false,
    });
  });

  it('calls a limp that called a raise "called an open", the raise over it an isolation', () => {
    // Aspen1 limps, Hero4 raises from the button, the big blind and Aspen1
    // call.
    const seenBy = (screenName: string) =>
      only(
        oneHand('pokerstars-edge-cases.txt', '262130000104').replace(
          'Dealt to Hero4 [Ad Jc]',
          `Dealt to ${screenName} [Ah Jd]`,
        ),
      );

    expect(heroFacts(seenBy('Hero4'))).toMatchObject({
      preflopRole: 'isolator',
      preflopFacedFirst: 'limps',
      limpers: 1,
      isolateDid: true,
      isolateChance: true,
      openChance: false,
      stealChance: false,
      limpChance: true,
      limpDid: false,
      heroRaiseSize: 4,
      heroRaiseMultiple: 4,
    });
    expect(heroFacts(seenBy('Aspen1'))).toMatchObject({
      preflopRole: 'called-open',
      preflopFacedFirst: 'unopened',
      preflopLine: 'CC',
      limpDid: true,
      limpChance: true,
      isolateFaced: true,
      isolateAnswer: 'call',
      coldCallChance: false,
      threeBetChance: true,
      threeBetDid: false,
    });
    // The big blind's call of the raise is no cold call.
    expect(heroFacts(seenBy('Willow4'))).toMatchObject({
      heroPosition: 'BB',
      preflopRole: 'called-open',
      preflopFacedFirst: 'open',
      coldCallChance: false,
      coldCallDid: false,
      limpChance: false,
      isolateFaced: false,
      sizeFaced: 4,
    });
  });

  it('makes a 3-bet from a blind over a caller of the steal a squeeze, not a resteal', () => {
    // Birch Woods opens the button, iMapleAA calls from the small blind and
    // Cedar31 re-raises from the big blind.
    const squeezed = oneHand('winamax-session.txt', '20954312-7731')
      .replace(
        /Cedar31 folds[\s\S]*$/,
        'Cedar31 raises 0.90€ to 1€\nBirch Woods folds\niMapleAA folds\n',
      )
      .replace('Dealt to iMapleAA [Th 9h]', 'Dealt to Cedar31 [Qs Qc]');
    const seenBy = (screenName: string) =>
      only(squeezed.replace('Dealt to Cedar31', `Dealt to ${screenName}`));

    expect(heroFacts(seenBy('Cedar31'))).toMatchObject({
      heroPosition: 'BB',
      preflopRole: '3-bettor',
      squeezeDid: true,
      squeezeChance: true,
      threeBetDid: true,
      restealDid: false,
      restealChance: false,
      stealFaced: false,
      stealAnswer: null,
      threeBetSize: 4,
    });
    expect(heroFacts(seenBy('Birch Woods'))).toMatchObject({
      stealDid: true,
      squeezeFaced: true,
      squeezeAnswer: 'fold',
      threeBetFaced: true,
      threeBetAnswer: 'fold',
      restealFaced: false,
      preflopRole: 'opener',
    });
    expect(heroFacts(seenBy('iMapleAA'))).toMatchObject({
      heroPosition: 'SB',
      stealFaced: true,
      stealAnswer: 'call',
      squeezeFaced: true,
      squeezeAnswer: 'fold',
      threeBetFaced: false,
      preflopRole: 'called-open',
    });
  });

  it('counts a 3-bet of a lone steal from the big blind as a resteal', () => {
    // BIRCHWOODS opens the button, the small blind folds, iMapleAA re-raises.
    const hand = only(
      oneHand('pokerstars-session.txt', '262120715506').replace(
        /iMapleAA: folds[\s\S]*$/,
        'iMapleAA: raises €0.50 to €0.75\nBIRCHWOODS: folds\n',
      ),
    );

    expect(heroFacts(hand)).toMatchObject({
      heroPosition: 'BB',
      stealFaced: true,
      stealAnswer: 'raise',
      restealDid: true,
      restealChance: true,
      threeBetDid: true,
      squeezeChance: false,
      preflopRole: '3-bettor',
      preflopFacedFirst: 'open',
      sizeFaced: 2.5,
      openSize: 2.5,
      threeBetSize: 3,
      heroRaiseSize: 7.5,
      heroRaiseMultiple: 3,
      heroSecondRaiseSize: null,
    });
  });

  it('sizes the Hero’s second raise against the 3-bet it answers', () => {
    // Hero9max calls Elm_UTG's all-in open, Oak_BB 3-bets all in, Hero9max
    // 4-bets to $79.95: a 9-max table with antes.
    const hand = only(oneHand('pokerstars-edge-cases.txt', '262130000102'));

    expect(heroFacts(hand)).toMatchObject({
      antes: true,
      preflopRole: '4-bettor',
      coldCallDid: true,
      fourBetDid: true,
      squeezeFaced: true,
      squeezeAnswer: 'raise',
      sizeFaced: 19.9,
      heroRaiseSize: 159.9,
      heroRaiseMultiple: 3.2,
      heroSecondRaiseSize: null,
      openSize: 19.9,
      threeBetSize: 2.51,
      fourBetSize: 3.2,
      heroStartingStack: 160,
      preflopEffectiveStack: 120,
    });
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

    it('gives the raiser it answers, who has acted, no re-raise chance', () => {
      const opener = only(
        shortThreeBet
          .replace('Dealt to Hero [Ah Tc]', 'Dealt to Hero ')
          .replace('Dealt to c19e0a88 ', 'Dealt to c19e0a88 [Kc Qc]'),
      );

      expect(heroFacts(opener)).toMatchObject({
        threeBetFaced: true,
        threeBetAnswer: 'call',
        fourBetChance: false,
        fourBetDid: false,
        preflopRole: 'called-3-bet',
      });
    });

    it('counts as the Hero’s 3-bet', () => {
      expect(heroFacts(only(shortThreeBet))).toMatchObject({
        heroPosition: 'SB',
        threeBetDid: true,
        preflopRole: '3-bettor',
        heroStartingStack: 3,
        preflopEffectiveStack: 3,
      });
    });
  });

  it('gives a walk no Action and no line', () => {
    // Hand #159950300403: everyone folds to 4e097d34's straddle, the Hero's
    // big blind too.
    const folded = only(oneHand('coinpoker-session.txt', '159950300403'));
    // CoinPoker Hand #159583401410 seen from the straddler, who gets a walk.
    const walk = only(
      oneHand('coinpoker-session.txt', '4e097d34: STRADDLE')
        .replace('Dealt to Hero [9d 5d]', 'Dealt to 0a0a0a0a')
        .replace(/Hero/g, '0a0a0a0a')
        .replace(/Dealt to 4e097d34(?=\r?\n)/, 'Dealt to 4e097d34 [7c 2d]')
        .replace(/4e097d34/g, 'Hero'),
    );

    expect(heroFacts(folded)).toMatchObject({
      straddle: true,
      preflopRole: 'folded',
      preflopLine: 'F',
      vpipChance: true,
      vpipDid: false,
    });
    expect(heroFacts(walk)).toMatchObject({
      potType: 'walk',
      straddle: true,
      preflopRole: 'walk',
      preflopLine: null,
      preflopFacedFirst: null,
      vpipChance: false,
      pfrChance: false,
      openChance: false,
      limpers: 0,
      sizeFaced: null,
      openSize: null,
    });
  });

  it('gives a Hero all in from a blind no Action and no role', () => {
    // HeroAI's big blind is their whole Stack; Aces2 completes.
    const hand = only(
      oneHand('pokerstars-all-ins.txt', '262140000102')
        .replace(
          'Seat 1: HeroAI ($50 in chips)',
          'Seat 1: HeroAI ($0.5 in chips)',
        )
        .replace(
          'HeroAI: posts big blind $0.50',
          'HeroAI: posts big blind $0.50 and is all-in',
        )
        .replace(/Aces2: raises[\s\S]*$/, 'Aces2: calls $0.25\n'),
    );

    expect(heroFacts(hand)).toMatchObject({
      vpipChance: false,
      pfrChance: false,
      preflopRole: null,
      preflopFacedFirst: null,
      preflopLine: null,
      limpers: 1,
      heroStartingStack: 1,
      preflopEffectiveStack: 1,
      threeBetFaced: false,
      threeBetAnswer: null,
      stealFaced: false,
      stealAnswer: null,
    });
  });
});
