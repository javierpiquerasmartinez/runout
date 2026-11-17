import { readdirSync, readFileSync } from 'node:fs';
import { importHandHistory } from '../import/import.js';
import type { Hand } from '../hand.js';
import { heroFacts } from './hero-facts.js';
import { heroStats } from './hero-stats.js';

const FIXTURES = new URL('../import/fixtures/', import.meta.url);

/** Every Hand of every fixture the import module reads. */
function everyFixtureHand(): Hand[] {
  return readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.txt'))
    .flatMap(
      (name) =>
        importHandHistory(readFileSync(new URL(name, FIXTURES), 'utf8')).hands,
    );
}

describe('Replay: the named Actions on each postflop Street, against the Stats', () => {
  const hands = everyFixtureHand();

  it('reads the fixtures', () => {
    expect(hands.length).toBeGreaterThan(20);
  });

  it('gives C-bet, Fold to C-bet and flop Check-raise as the Hero Stats do, on every fixture', () => {
    for (const hand of hands) {
      const facts = heroFacts(hand);
      const stats = heroStats(hand);
      const id = hand.siteHandId;
      for (const street of ['flop', 'turn', 'river'] as const) {
        const cbet = stats[`cbet-${street}`];
        const fold = stats[`fold-to-cbet-${street}`];
        expect(
          {
            chance: facts[`${street}CbetChance`] === true ? 1 : 0,
            did: facts[`${street}CbetDid`] === true ? 1 : 0,
            faced: facts[`${street}CbetFaced`] === true ? 1 : 0,
            folded: facts[`${street}CbetAnswer`] === 'fold' ? 1 : 0,
          },
          `${id} ${street}`,
        ).toEqual({
          chance: cbet.opportunities,
          did: cbet.taken,
          faced: fold.opportunities,
          folded: fold.taken,
        });
      }
      const checkRaise = stats['check-raise-flop'];
      expect(
        {
          chance: facts.flopCheckRaiseChance === true ? 1 : 0,
          did: facts.flopCheckRaiseDid === true ? 1 : 0,
        },
        `${id} check-raise`,
      ).toEqual({
        chance: checkRaise.opportunities,
        did: checkRaise.taken,
      });
    }
  });
});

/**
 * A three-handed PokerStars Hand ($0.50/$1): Btn on the button, then Sb and
 * Bb, each with $100 unless `stacks` says otherwise, played as `streets`
 * lists, with `hero` dealt Ah Kd. The Board is Kh 9c 4d 2s 7h.
 */
function threeHanded(
  hero: 'Btn' | 'Sb' | 'Bb',
  streets: { preflop: string; flop?: string; turn?: string; river?: string },
  stacks: Partial<Record<'Btn' | 'Sb' | 'Bb', number>> = {},
): Hand {
  const stack = (name: 'Btn' | 'Sb' | 'Bb') => stacks[name] ?? 100;
  const lines = (block: string) => block.trim().replace(/^\s+/gm, '');
  const history = [
    "PokerStars Hand #262199000001:  Hold'em No Limit ($0.50/$1 USD) - 2026/09/10 21:00:00 CET [2026/09/10 15:00:00 ET]",
    "Table 'Spec' 3-max Seat #1 is the button",
    `Seat 1: Btn ($${stack('Btn')} in chips)`,
    `Seat 2: Sb ($${stack('Sb')} in chips)`,
    `Seat 3: Bb ($${stack('Bb')} in chips)`,
    'Sb: posts small blind $0.50',
    'Bb: posts big blind $1',
    '*** HOLE CARDS ***',
    `Dealt to ${hero} [Ah Kd]`,
    lines(streets.preflop),
    ...(streets.flop !== undefined
      ? ['*** FLOP *** [Kh 9c 4d]', lines(streets.flop)]
      : []),
    ...(streets.turn !== undefined
      ? ['*** TURN *** [Kh 9c 4d] [2s]', lines(streets.turn)]
      : []),
    ...(streets.river !== undefined
      ? ['*** RIVER *** [Kh 9c 4d 2s] [7h]', lines(streets.river)]
      : []),
    'Btn collected $1 from pot',
    '*** SUMMARY ***',
    'Total pot $1 | Rake $0',
  ]
    .filter((line) => line !== '')
    .join('\n');
  const [hand] = importHandHistory(`${history}\n`).hands;
  expect(hand).toBeDefined();
  return hand;
}

/** The Btn opens, the Sb folds and the Bb calls: heads-up to the flop. */
const OPEN_CALLED = `
  Btn: raises $2 to $3
  Sb: folds
  Bb: calls $2`;

const quartet = (
  did: boolean,
  chance: boolean,
  faced = false,
  answer: string | null = null,
) => ({ did, chance, faced, answer });
const none = quartet(false, false);

/** One named Action's four facts on a Street. */
function action(hand: Hand, street: string, name: string) {
  const facts = heroFacts(hand) as unknown as Record<string, unknown>;
  const key = `${street}${name[0].toUpperCase()}${name.slice(1)}`;
  return {
    did: facts[`${key}Did`],
    chance: facts[`${key}Chance`],
    faced: facts[`${key}Faced`],
    answer: facts[`${key}Answer`],
  };
}

describe('Replay: the named Actions on each postflop Street', () => {
  // The Btn C-bets the flop, checks the turn behind, and folds to the Bb's
  // river bet: a probe, since the turn was checked through.
  const cbetThenChecked = {
    preflop: OPEN_CALLED,
    flop: `
      Bb: checks
      Btn: bets $3
      Bb: calls $3`,
    turn: `
      Bb: checks
      Btn: checks`,
    river: `
      Bb: bets $5
      Btn: folds
      Uncalled bet ($5) returned to Bb`,
  };

  it('gives a turn C-bet chance only after a flop C-bet, and none on the river after the turn is checked', () => {
    const hand = threeHanded('Btn', cbetThenChecked);

    expect(action(hand, 'flop', 'cbet')).toEqual(quartet(true, true));
    expect(action(hand, 'turn', 'cbet')).toEqual(quartet(false, true));
    expect(action(hand, 'river', 'cbet')).toEqual(none);
  });

  it('tells a probe, after a Street checked through, from a donk bet', () => {
    const btn = threeHanded('Btn', cbetThenChecked);
    const bb = threeHanded('Bb', cbetThenChecked);

    expect(action(btn, 'river', 'probe')).toEqual(
      quartet(false, false, true, 'fold'),
    );
    expect(action(btn, 'river', 'donkBet')).toEqual(none);
    expect(action(bb, 'river', 'probe')).toEqual(quartet(true, true));
    expect(action(bb, 'river', 'donkBet')).toEqual(none);
    expect(action(bb, 'river', 'bet')).toEqual(quartet(true, true));
    // The Bb faced the flop C-bet and called it; on the flop it could have
    // donk bet into the Btn, and on the turn into the flop's C-bettor.
    expect(action(bb, 'flop', 'cbet')).toEqual(
      quartet(false, false, true, 'call'),
    );
    expect(action(bb, 'flop', 'donkBet')).toEqual(quartet(false, true));
    expect(action(bb, 'turn', 'donkBet')).toEqual(quartet(false, true));
    expect(action(bb, 'turn', 'probe')).toEqual(none);
  });

  // The Bb bets the turn into the flop's C-bettor, a donk bet; the Btn
  // calls in position and bets the river when checked to: a float.
  const donkThenFloat = {
    preflop: OPEN_CALLED,
    flop: `
      Bb: checks
      Btn: bets $3
      Bb: calls $3`,
    turn: `
      Bb: bets $6
      Btn: calls $6`,
    river: `
      Bb: checks
      Btn: bets $10
      Bb: folds
      Uncalled bet ($10) returned to Btn`,
  };

  it('gives a donk bet when the Street before had a bet, and a float only after calling in position', () => {
    const btn = threeHanded('Btn', donkThenFloat);
    const bb = threeHanded('Bb', donkThenFloat);

    expect(action(bb, 'turn', 'donkBet')).toEqual(quartet(true, true));
    expect(action(bb, 'turn', 'probe')).toEqual(none);
    expect(action(btn, 'turn', 'donkBet')).toEqual(
      quartet(false, false, true, 'call'),
    );
    expect(action(btn, 'turn', 'cbet')).toEqual(none);
    expect(action(btn, 'river', 'float')).toEqual(quartet(true, true));
    expect(action(bb, 'river', 'float')).toEqual(
      quartet(false, false, true, 'fold'),
    );
    // On the turn the Btn had bet the flop, not called it: no float.
    expect(action(btn, 'turn', 'float')).toEqual(none);
  });

  // The flop is checked by both; the Btn bets the turn and the Bb
  // check-raises it.
  const delayed = {
    preflop: OPEN_CALLED,
    flop: `
      Bb: checks
      Btn: checks`,
    turn: `
      Bb: checks
      Btn: bets $4
      Bb: raises $8 to $12
      Btn: folds
      Uncalled bet ($8) returned to Bb`,
  };

  it('gives a delayed C-bet only after a flop checked by everyone', () => {
    const btn = threeHanded('Btn', delayed);
    const bb = threeHanded('Bb', delayed);

    expect(action(btn, 'flop', 'cbet')).toEqual(quartet(false, true));
    expect(action(btn, 'turn', 'cbet')).toEqual(none);
    expect(action(btn, 'turn', 'delayedCbet')).toEqual(quartet(true, true));
    expect(action(bb, 'turn', 'delayedCbet')).toEqual(
      quartet(false, false, true, 'raise'),
    );
    // The Bb could have probed the turn, and check-raised instead.
    expect(action(bb, 'turn', 'probe')).toEqual(quartet(false, true));
    expect(action(bb, 'turn', 'checkRaise')).toEqual(quartet(true, true));
    expect(action(bb, 'turn', 'raise')).toEqual(quartet(true, true));
    expect(action(btn, 'turn', 'checkRaise')).toEqual(
      quartet(false, false, true, 'fold'),
    );
    // The Btn could have re-raised the check-raise.
    expect(action(btn, 'turn', 'raise')).toEqual(
      quartet(false, true, true, 'fold'),
    );
    // There is no delayed C-bet on the flop.
    expect(action(btn, 'flop', 'delayedCbet').did).toBeUndefined();
  });

  it('gives a check-raise chance only when the Hero could raise the bet', () => {
    // The Bb, with $20, checks and faces a bet bigger than their Stack.
    const hand = threeHanded(
      'Bb',
      {
        preflop: OPEN_CALLED,
        flop: `
          Bb: checks
          Btn: bets $30
          Bb: calls $17 and is all-in
          Uncalled bet ($13) returned to Btn`,
        turn: '',
        river: '',
      },
      { Bb: 20 },
    );

    expect(action(hand, 'flop', 'checkRaise')).toEqual(none);
    expect(action(hand, 'flop', 'raise')).toEqual(none);
    expect(action(hand, 'flop', 'bet')).toEqual(
      quartet(false, true, true, 'call'),
    );
  });

  // Three see the flop. The Bb donk bets, the Btn raises it, the Sb folds,
  // and the Bb 3-bets.
  const multiway = {
    preflop: `
      Btn: raises $2 to $3
      Sb: calls $2.50
      Bb: calls $2`,
    flop: `
      Sb: checks
      Bb: bets $5
      Btn: raises $10 to $15
      Sb: folds
      Bb: raises $30 to $45
      Btn: calls $30`,
    turn: `
      Bb: checks
      Btn: checks`,
    river: `
      Bb: checks
      Btn: checks`,
  };

  it('reads raises, re-raises and donk bets in a multiway pot', () => {
    const btn = threeHanded('Btn', multiway);
    const sb = threeHanded('Sb', multiway);
    const bb = threeHanded('Bb', multiway);

    expect(action(bb, 'flop', 'donkBet')).toEqual(quartet(true, true));
    expect(action(bb, 'flop', 'raise')).toEqual(
      quartet(true, true, true, 'raise'),
    );
    expect(action(bb, 'flop', 'threeBet')).toEqual(quartet(true, true));
    expect(action(btn, 'flop', 'donkBet')).toEqual(
      quartet(false, false, true, 'raise'),
    );
    expect(action(btn, 'flop', 'cbet')).toEqual(none);
    expect(action(btn, 'flop', 'raise')).toEqual(quartet(true, true));
    expect(action(btn, 'flop', 'threeBet')).toEqual(
      quartet(false, false, true, 'call'),
    );
    expect(action(btn, 'flop', 'fourBet')).toEqual(quartet(false, true));
    // The Sb, out of position to the Btn, could have donk bet; the Bb's bet
    // was raised before they answered it.
    expect(action(sb, 'flop', 'donkBet')).toEqual(quartet(false, true));
    expect(action(sb, 'flop', 'bet')).toEqual(quartet(false, true));
    expect(action(sb, 'flop', 'raise')).toEqual(quartet(false, true));
    // A Street the Hero didn't see has its Actions empty.
    expect(action(sb, 'turn', 'cbet')).toEqual({
      did: null,
      chance: null,
      faced: null,
      answer: null,
    });
  });
});
