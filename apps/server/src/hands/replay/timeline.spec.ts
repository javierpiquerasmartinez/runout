import { readFileSync } from 'node:fs';
import { importHandHistory } from '../import/import.js';
import { timeline } from './timeline.js';

function hands(name: string) {
  const text = readFileSync(
    new URL(`../import/fixtures/${name}`, import.meta.url),
    'utf8',
  );
  return importHandHistory(text).hands;
}

/** Each player in seat order, as [screenName, stack, bet, folded]. */
function players(state: ReturnType<typeof timeline>['states'][number]) {
  return state.players.map((p) => [p.screenName, p.stack, p.bet, p.folded]);
}

describe('Replay: a Hand’s Timeline', () => {
  const [showdown] = hands('pokerstars-showdown.txt');

  it('seats the players dealt in, with their Positions, the button and the Hero’s cards', () => {
    const { seats, buttonSeat, hero } = timeline(showdown);

    expect(seats).toEqual([
      { seat: 1, screenName: 'Alder239', position: 'SB', startingStack: 1136 },
      {
        seat: 2,
        screenName: 'BIRCHWOODS',
        position: 'BB',
        startingStack: 1204,
      },
      {
        seat: 3,
        screenName: 'Cedar31lse',
        position: 'CO',
        startingStack: 1110,
      },
      { seat: 5, screenName: 'iMapleAA', position: 'BTN', startingStack: 1000 },
    ]);
    expect(buttonSeat).toBe(5);
    expect(hero).toEqual({ screenName: 'iMapleAA', cards: ['Js', '8s'] });
  });

  it('starts at the Initial State, blinds posted, then has a state per Action, per Street dealt and for the end', () => {
    const { states } = timeline(showdown);

    expect(states).toHaveLength(1 + 10 + 3 + 1);
    expect(states[0]).toEqual({
      street: 'preflop',
      board: [],
      pot: 15,
      // The blinds are bets in play, not yet gathered into a pot.
      pots: [],
      toAct: 'Cedar31lse',
      action: null,
      players: [
        {
          screenName: 'Alder239',
          stack: 1131,
          bet: 5,
          folded: false,
          allIn: false,
          committed: 5,
        },
        {
          screenName: 'BIRCHWOODS',
          stack: 1194,
          bet: 10,
          folded: false,
          allIn: false,
          committed: 10,
        },
        {
          screenName: 'Cedar31lse',
          stack: 1110,
          bet: 0,
          folded: false,
          allIn: false,
          committed: 0,
        },
        {
          screenName: 'iMapleAA',
          stack: 1000,
          bet: 0,
          folded: false,
          allIn: false,
          committed: 0,
        },
      ],
      // Preflop, the second-deepest Stack of the players still in, bets included.
      effectiveStack: 1136,
      spr: null,
      result: null,
    });
  });

  it('updates Stacks, bets, pot and who is to act on every Action', () => {
    const { states } = timeline(showdown);

    expect(states[1].action).toMatchObject({
      screenName: 'Cedar31lse',
      type: 'fold',
    });
    expect(players(states[1])[2]).toEqual(['Cedar31lse', 1110, 0, true]);
    expect(states[1].toAct).toBe('iMapleAA');

    // iMapleAA raises to €0.30.
    expect(players(states[2])[3]).toEqual(['iMapleAA', 970, 30, false]);
    expect(states[2].pot).toBe(45);
    expect(states[2].toAct).toBe('Alder239');
  });

  it('shows the Action that closes a Street with the bets still in front, then deals the next Street as a step of its own', () => {
    const { states } = timeline(showdown);

    // BIRCHWOODS calls, closing preflop: both bets of €0.30 are still in
    // front of the players, and nobody else acts on this Street.
    expect(states[4]).toMatchObject({
      street: 'preflop',
      board: [],
      pot: 65,
      toAct: null,
      action: { screenName: 'BIRCHWOODS', type: 'call' },
    });
    expect(players(states[4])[1]).toEqual(['BIRCHWOODS', 1174, 30, false]);
    expect(players(states[4])[3]).toEqual(['iMapleAA', 970, 30, false]);

    // Then the flop is dealt, the bets gathered, and BIRCHWOODS acts first.
    expect(states[5]).toMatchObject({
      street: 'flop',
      board: ['2c', '10h', '4c'],
      pot: 65,
      pots: [{ amount: 65, contestants: ['BIRCHWOODS', 'iMapleAA'] }],
      toAct: 'BIRCHWOODS',
      action: null,
    });
    expect(players(states[5])).toEqual([
      ['Alder239', 1131, 0, true],
      ['BIRCHWOODS', 1174, 0, false],
      ['Cedar31lse', 1110, 0, true],
      ['iMapleAA', 970, 0, false],
    ]);
  });

  it('shows a check behind, and each Street dealt, before the next Action', () => {
    const { states } = timeline(showdown);

    expect(
      states.map((s) =>
        s.action
          ? `${s.action.screenName} ${s.action.type}`
          : s.result
            ? 'end'
            : `deal ${s.street}`,
      ),
    ).toEqual([
      'deal preflop',
      'Cedar31lse fold',
      'iMapleAA raise',
      'Alder239 fold',
      'BIRCHWOODS call',
      'deal flop',
      'BIRCHWOODS check',
      'iMapleAA check',
      'deal turn',
      'BIRCHWOODS bet',
      'iMapleAA call',
      'deal river',
      'BIRCHWOODS check',
      'iMapleAA check',
      'end',
    ]);
    // The turn call is shown with both bets in front, before the river.
    expect(players(states[10])[1]).toEqual(['BIRCHWOODS', 1154, 20, false]);
    expect(players(states[10])[3]).toEqual(['iMapleAA', 950, 20, false]);
  });

  it('ends with the whole board and nobody to act', () => {
    const { states } = timeline(showdown);

    expect(states.at(-1)).toMatchObject({
      street: 'river',
      board: ['2c', '10h', '4c', 'Qs', '8c'],
      pot: 105,
      toAct: null,
      action: null,
    });
  });

  it('ends at Showdown with the shown cards, each made hand and who won the pot', () => {
    const last = timeline(showdown).states.at(-1)!;

    expect(last.result).toEqual({
      revealed: [
        {
          screenName: 'BIRCHWOODS',
          cards: ['As', '7d'],
          madeHand: { category: 'high-card', ranks: ['A'], cards: ['As'] },
        },
        {
          screenName: 'iMapleAA',
          cards: ['Js', '8s'],
          madeHand: { category: 'pair', ranks: ['8'], cards: ['8s', '8c'] },
        },
      ],
      pots: [
        {
          amount: 105,
          contestants: ['BIRCHWOODS', 'iMapleAA'],
          winners: [{ screenName: 'iMapleAA', amount: 99 }],
        },
      ],
      rake: 6,
    });
    // The winner's Stack takes what they collected, net of rake.
    expect(players(last)[3]).toEqual(['iMapleAA', 1049, 0, false]);
    expect(
      timeline(showdown)
        .states.slice(0, -1)
        .map((s) => s.result),
    ).toEqual(Array(14).fill(null));
  });

  it('reads the effective stack preflop among the players still in the Hand', () => {
    const { states } = timeline(showdown);

    // BIRCHWOODS (€12.04) and Alder239 (€11.36) are the deepest until
    // Alder239 folds; then only iMapleAA's €10 can be won or lost.
    expect(states[2].effectiveStack).toBe(1136);
    expect(states[3].effectiveStack).toBe(1000);
  });

  it('labels only the hands shown: a Hero who mucks keeps their cards but gets no made hand', () => {
    const heroMucks = {
      ...showdown,
      shown: [{ screenName: 'BIRCHWOODS', cards: ['As', '7d'] }],
    };

    const { revealed } = timeline(heroMucks).states.at(-1)!.result!;
    expect(revealed.map((r) => r.screenName)).toEqual(['BIRCHWOODS']);
  });

  it('says what the rake took', () => {
    expect(timeline(showdown).states.at(-1)!.result!.rake).toBe(6);
  });

  it('says whether the Hand reached Showdown', () => {
    const [, wonByAFold] = hands('pokerstars-session.txt');

    expect(timeline(showdown).showdown).toBe(true);
    expect(timeline(wonByAFold).showdown).toBe(false);
  });

  it('names Positions from the blinds when the button seat is empty', () => {
    // A dead button: seat 4 had the button and left. iMapleAA (seat 5) posts
    // the small blind and Alder239 (seat 1) the big blind.
    const deadButton = {
      ...showdown,
      buttonSeat: 4,
      posts: [
        { screenName: 'iMapleAA', kind: 'small-blind' as const, amount: 5 },
        { screenName: 'Alder239', kind: 'big-blind' as const, amount: 10 },
      ],
    };

    expect(
      timeline(deadButton).seats.map((seat) => [
        seat.screenName,
        seat.position,
      ]),
    ).toEqual([
      ['Alder239', 'BB'],
      ['BIRCHWOODS', 'CO'],
      ['Cedar31lse', 'BTN'],
      ['iMapleAA', 'SB'],
    ]);
  });

  it('puts antes and a dead small blind straight into the pot, not in front of the player', () => {
    // The showdown Hand again, now with €0.01 antes and Cedar31lse posting
    // small and big blinds (€0.15, of which €0.05 is dead) to come in.
    const withAntes = {
      ...showdown,
      posts: [
        ...showdown.posts,
        ...['Alder239', 'BIRCHWOODS', 'Cedar31lse', 'iMapleAA'].map(
          (screenName) => ({ screenName, kind: 'ante' as const, amount: 1 }),
        ),
        {
          screenName: 'Cedar31lse',
          kind: 'small-and-big-blinds' as const,
          amount: 15,
        },
      ],
    };

    const { states } = timeline(withAntes);

    expect(states[0].pot).toBe(34);
    expect(players(states[0])).toEqual([
      ['Alder239', 1130, 5, false],
      ['BIRCHWOODS', 1193, 10, false],
      ['Cedar31lse', 1094, 10, false],
      ['iMapleAA', 999, 0, false],
    ]);
    // iMapleAA raises to €0.30 with nothing in yet: all 30 goes in.
    expect(states[2].pot).toBe(64);
    expect(players(states[2])[3]).toEqual(['iMapleAA', 969, 30, false]);
  });

  it('leaves out players who sat out, and hands back the uncalled bet of a Hand won by a fold', () => {
    const [first, second] = hands('pokerstars-session.txt');

    expect(timeline(first).seats.map((seat) => seat.screenName)).not.toContain(
      'Dogwood55',
    );
    const last = timeline(second).states.at(-1)!;
    expect(last).toMatchObject({
      street: 'flop',
      board: ['Qs', 'Qd', '10s'],
      toAct: null,
    });
    // Nobody called the €0.17 flop bet: it goes back, and the €0.55 pot
    // (€0.52 after rake) is juniperpallo's.
    expect(last.pot).toBe(55);
    expect(last.result).toEqual({
      revealed: [],
      pots: [
        {
          amount: 55,
          contestants: ['juniperpallo'],
          winners: [{ screenName: 'juniperpallo', amount: 52 }],
        },
      ],
      rake: 3,
    });
    expect(
      last.players.find((p) => p.screenName === 'juniperpallo'),
    ).toMatchObject({ stack: 922 - 25 + 52, bet: 0, committed: 25 });
  });
});

describe('Replay: pots, side pots and results across edge cases', () => {
  const [headsUp, nineMax, straddled, split] = hands(
    'pokerstars-edge-cases.txt',
  );

  it('plays heads-up with the button on the small blind, and ends preflop when the big blind folds', () => {
    const { seats, states } = timeline(headsUp);

    expect(seats.map((seat) => [seat.screenName, seat.position])).toEqual([
      ['HeroHU', 'BTN'],
      ['VillainHU', 'BB'],
    ]);
    const last = states.at(-1)!;
    expect(last).toMatchObject({ street: 'preflop', board: [], pot: 100 });
    expect(last.result).toEqual({
      revealed: [],
      pots: [
        {
          amount: 100,
          contestants: ['HeroHU'],
          winners: [{ screenName: 'HeroHU', amount: 100 }],
        },
      ],
      rake: 0,
    });
    // The raise over the big blind comes back, then the pot is won.
    expect(players(last)).toEqual([
      ['HeroHU', 5050, 0, false],
      ['VillainHU', 6180, 0, true],
    ]);
  });

  it('names all nine Positions and gathers the antes into the pot before the first Action', () => {
    const { seats, states } = timeline(nineMax);

    expect(seats.map((seat) => seat.position)).toEqual([
      'SB',
      'BB',
      'UTG',
      'UTG+1',
      'MP',
      'LJ',
      'HJ',
      'CO',
      'BTN',
    ]);
    expect(states[0].pot).toBe(45 + 25 + 50);
    // Spruce9's $60, less the ante, is the second-deepest Stack.
    expect(states[0].effectiveStack).toBe(5995);
    expect(states[0].pots).toEqual([
      { amount: 45, contestants: seats.map((seat) => seat.screenName) },
    ]);
  });

  it('keeps all-in bets in play until the Street closes', () => {
    const { states } = timeline(nineMax);

    // Oak_BB has just moved all in: nobody's bets are gathered yet.
    const oakAllIn = states[9];
    expect(oakAllIn.action).toMatchObject({
      screenName: 'Oak_BB',
      allIn: true,
    });
    expect(oakAllIn.pots).toEqual([
      { amount: 45, contestants: expect.any(Array) },
    ]);
    expect(
      oakAllIn.players
        .filter((p) => p.allIn)
        .map((p) => [p.screenName, p.stack, p.bet]),
    ).toEqual([
      ['Oak_BB', 0, 2495],
      ['Elm_UTG', 0, 995],
    ]);
  });

  it('runs an all-in board out a Street at a time, handing back the uncalled bet first', () => {
    const { states } = timeline(nineMax);
    const lastCall = states.findIndex(
      (s) => s.action?.screenName === 'Spruce9' && s.action.allIn,
    );
    const hero = (state: (typeof states)[number]) =>
      state.players.find((p) => p.screenName === 'Hero9max')!;

    // Spruce9's call is shown with Hero9max's whole all-in still in front.
    expect(states[lastCall]).toMatchObject({ street: 'preflop', toAct: null });
    expect(hero(states[lastCall])).toMatchObject({ bet: 7995, stack: 0 });

    expect(
      states
        .slice(lastCall + 1)
        .map((s) => [s.street, s.board.length, s.toAct]),
    ).toEqual([
      ['flop', 3, null],
      ['turn', 4, null],
      ['river', 5, null],
      ['river', 5, null],
    ]);
    // $20 went back as the flop was dealt.
    expect(hero(states[lastCall + 1])).toMatchObject({
      bet: 0,
      stack: 2000,
      allIn: false,
    });
    expect(states[lastCall + 1].pots).toHaveLength(3);
  });

  it('splits a multi-way all-in into a main pot and two side pots, each with who contests it and who won it', () => {
    const last = timeline(nineMax).states.at(-1)!;

    expect(last).toMatchObject({
      street: 'river',
      board: ['Kh', '9c', '4d', '2s', '7h'],
      pot: 15550,
      toAct: null,
    });
    expect(last.result!.pots).toEqual([
      {
        amount: 4050,
        contestants: ['Oak_BB', 'Elm_UTG', 'Hero9max', 'Spruce9'],
        winners: [{ screenName: 'Elm_UTG', amount: 3950 }],
      },
      {
        amount: 4500,
        contestants: ['Oak_BB', 'Hero9max', 'Spruce9'],
        winners: [{ screenName: 'Hero9max', amount: 4400 }],
      },
      {
        amount: 7000,
        contestants: ['Hero9max', 'Spruce9'],
        winners: [{ screenName: 'Hero9max', amount: 6900 }],
      },
    ]);
    expect(last.pots).toEqual(
      last.result!.pots.map(({ amount, contestants }) => ({
        amount,
        contestants,
      })),
    );
  });

  it('hands back the part of an all-in nobody could call, so that player is no longer all in', () => {
    const last = timeline(nineMax).states.at(-1)!;
    const hero = last.players.find((p) => p.screenName === 'Hero9max')!;

    // $20 back, then $69 + $44 won.
    expect(hero).toMatchObject({
      stack: 2000 + 6900 + 4400,
      allIn: false,
      committed: 6000,
    });
    expect(
      last.players.filter((p) => p.allIn).map((p) => p.screenName),
    ).toEqual(['Oak_BB', 'Elm_UTG', 'Spruce9']);
  });

  it('labels every hand shown at Showdown with its own evaluator', () => {
    const { revealed } = timeline(nineMax).states.at(-1)!.result!;

    expect(
      revealed.map((r) => [
        r.screenName,
        r.madeHand.category,
        r.madeHand.ranks,
      ]),
    ).toEqual([
      ['Oak_BB', 'pair', ['Q']],
      ['Elm_UTG', 'three-of-a-kind', ['K']],
      ['Hero9max', 'pair', ['A']],
      ['Spruce9', 'high-card', ['A']],
    ]);
    expect(revealed[1].madeHand.cards).toEqual(['Ks', 'Kd', 'Kh']);
  });

  it('treats a straddle as a live bet in front of the straddler', () => {
    const { states } = timeline(straddled);

    expect(states[0].pot).toBe(175);
    expect(states[0].toAct).toBe('Birch1');
    expect(
      states[0].players
        .map((p) => [p.screenName, p.bet])
        .filter(([, bet]) => bet),
    ).toEqual([
      ['Larch4', 25],
      ['Maple5', 50],
      ['Olive6', 100],
    ]);
  });

  it('separates the pot gathered from earlier Streets from the bets in play on this one', () => {
    const { states } = timeline(straddled);

    // The flop: Olive6 checks, Hero6 bets $4.50.
    const heroBets = states.find(
      (s) => s.action?.screenName === 'Hero6' && s.action.type === 'bet',
    )!;
    expect(heroBets.action).toMatchObject({ screenName: 'Hero6', type: 'bet' });
    expect(heroBets.pots).toEqual([
      { amount: 975, contestants: ['Hero6', 'Olive6'] },
    ]);
    expect(heroBets.pot).toBe(975 + 450);
  });

  it('reads the effective stack and SPR as each Street begins', () => {
    const { states } = timeline(straddled);

    const flop = states.findIndex((s) => s.street === 'flop');
    const turn = states.findIndex((s) => s.street === 'turn');
    // Flop: $46 behind each into a $9.75 pot.
    expect(states[flop]).toMatchObject({ effectiveStack: 4600 });
    expect(states[flop].spr).toBeCloseTo(4600 / 975);
    // It holds for the whole Street, whatever is bet on it.
    expect(states[turn - 1]).toMatchObject({ effectiveStack: 4600 });
    expect(states[turn - 1].spr).toBeCloseTo(4600 / 975);
    // Turn: $31 behind into a $39.75 pot.
    expect(states[turn]).toMatchObject({ effectiveStack: 3100 });
    expect(states[turn].spr).toBeCloseTo(3100 / 3975);
  });

  it('labels a full house by its trips and its pair', () => {
    const { revealed, pots } = timeline(straddled).states.at(-1)!.result!;

    expect(revealed.map((r) => [r.screenName, r.madeHand])).toEqual([
      [
        'Hero6',
        {
          category: 'full-house',
          ranks: ['9', '5'],
          cards: ['9s', '9h', '9d', '5c', '5h'],
        },
      ],
      [
        'Olive6',
        {
          category: 'full-house',
          ranks: ['J', '5'],
          cards: ['Jh', 'Js', 'Jc', '5c', '5h'],
        },
      ],
    ]);
    expect(pots).toEqual([
      {
        amount: 10175,
        contestants: ['Hero6', 'Olive6'],
        winners: [{ screenName: 'Olive6', amount: 9875 }],
      },
    ]);
  });

  it('shows one pot with every winner when the Hand History’s pots don’t match the ones worked out', () => {
    // A "side pot-3" this Hand never had, and a win recorded with no pot at
    // all: rather than guess which pot each went to, they share one.
    const mismatched = {
      ...nineMax,
      collected: [
        { screenName: 'Hero9max', amount: 6900, pot: 3 },
        { screenName: 'Hero9max', amount: 4400 },
        { screenName: 'Elm_UTG', amount: 3950, pot: 0 },
      ],
    };

    const { pots } = timeline(mismatched).states.at(-1)!.result!;
    expect(pots).toEqual([
      {
        amount: 15550,
        contestants: ['Oak_BB', 'Elm_UTG', 'Hero9max', 'Spruce9'],
        winners: [
          { screenName: 'Hero9max', amount: 11300 },
          { screenName: 'Elm_UTG', amount: 3950 },
        ],
      },
    ]);
  });

  it('shares a split pot, and keeps a mucked hand face down', () => {
    const { revealed, pots } = timeline(split).states.at(-1)!.result!;

    expect(revealed.map((r) => [r.screenName, r.cards, r.madeHand])).toEqual([
      [
        'Aspen1',
        ['Ah', 'Jd'],
        { category: 'pair', ranks: ['A'], cards: ['Ah', 'As'] },
      ],
      [
        'Hero4',
        ['Ad', 'Jc'],
        { category: 'pair', ranks: ['A'], cards: ['Ad', 'As'] },
      ],
    ]);
    expect(pots).toEqual([
      {
        amount: 605,
        contestants: ['Aspen1', 'Hero4', 'Willow4'],
        winners: [
          { screenName: 'Hero4', amount: 298 },
          { screenName: 'Aspen1', amount: 297 },
        ],
      },
    ]);
  });
});

describe('Replay: made hands at Showdown', () => {
  const [showdown] = hands('pokerstars-showdown.txt');

  /** The Showdown Hand dealt again: BIRCHWOODS's cards and the board. */
  function madeHand(cards: string[], board: string[]) {
    const hand = {
      ...showdown,
      board,
      shown: [{ screenName: 'BIRCHWOODS', cards }],
    };
    return timeline(hand).states.at(-1)!.result!.revealed[0].madeHand;
  }

  it.each([
    [
      ['As', '7d'],
      ['Ah', '7c', '2d', '9s', 'Kc'],
      'two-pair',
      ['A', '7'],
      ['As', 'Ah', '7d', '7c'],
    ],
    [
      ['6s', '7d'],
      ['8h', '9c', '10d', '2s', 'Kc'],
      'straight',
      ['10'],
      ['10d', '9c', '8h', '7d', '6s'],
    ],
    [
      ['As', '2d'],
      ['3h', '4c', '5d', 'Js', 'Kc'],
      'straight',
      ['5'],
      ['5d', '4c', '3h', '2d', 'As'],
    ],
    [
      ['As', '7s'],
      ['2s', '9s', 'Qs', 'Jh', 'Kc'],
      'flush',
      ['A'],
      ['As', 'Qs', '9s', '7s', '2s'],
    ],
    [
      ['7s', '7d'],
      ['7h', '7c', '2d', 'As', 'Kc'],
      'four-of-a-kind',
      ['7'],
      ['7s', '7d', '7h', '7c'],
    ],
    [
      ['9h', '10h'],
      ['Jh', 'Qh', 'Kh', 'Ah', '2c'],
      'straight-flush',
      ['A'],
      ['Ah', 'Kh', 'Qh', 'Jh', '10h'],
    ],
  ])('%j on %j makes a %s', (cards, board, category, ranks, made) => {
    expect(madeHand(cards, board)).toEqual({ category, ranks, cards: made });
  });

  it('plays the board when it beats the hole cards', () => {
    expect(madeHand(['2c', '3d'], ['As', 'Ks', 'Qs', 'Js', '10s'])).toEqual({
      category: 'straight-flush',
      ranks: ['A'],
      cards: ['As', 'Ks', 'Qs', 'Js', '10s'],
    });
  });
});
