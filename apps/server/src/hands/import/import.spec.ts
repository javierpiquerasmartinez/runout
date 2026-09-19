import { readFileSync } from 'node:fs';
import { importHandHistory } from './import.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Hand History import: PokerStars format, as PokerTracker 4 exports it', () => {
  it('reads the table, Stake, seats and Hero of a Hand', () => {
    const { hands, discarded } = importHandHistory(
      fixture('pokerstars-showdown.txt'),
    );

    expect(discarded).toEqual([]);
    expect(hands).toHaveLength(1);
    expect(hands[0]).toMatchObject({
      site: 'pokerstars',
      siteHandId: '262120750636',
      sourceFormat: 'pokerstars',
      // 8:34:30 ET is EDT (UTC-4) in September.
      playedAt: '2026-09-18T12:34:30.000Z',
      tableName: 'Yildun II',
      tableSize: 6,
      buttonSeat: 5,
      stake: {
        limit: 'no-limit',
        smallBlind: 5,
        bigBlind: 10,
        currency: 'EUR',
      },
      seats: [
        {
          seat: 1,
          screenName: 'Alder239',
          startingStack: 1136,
          sittingOut: false,
        },
        {
          seat: 2,
          screenName: 'BIRCHWOODS',
          startingStack: 1204,
          sittingOut: false,
        },
        {
          seat: 3,
          screenName: 'Cedar31lse',
          startingStack: 1110,
          sittingOut: false,
        },
        {
          seat: 5,
          screenName: 'iMapleAA',
          startingStack: 1000,
          sittingOut: false,
        },
      ],
      hero: { screenName: 'iMapleAA', cards: ['Js', '8s'] },
    });
  });

  it('reads the blinds, every Action by Street, the board and the Showdown', () => {
    const [hand] = importHandHistory(fixture('pokerstars-showdown.txt')).hands;

    expect(hand.posts).toEqual([
      { screenName: 'Alder239', kind: 'small-blind', amount: 5 },
      { screenName: 'BIRCHWOODS', kind: 'big-blind', amount: 10 },
    ]);
    expect(hand.actions).toEqual([
      {
        street: 'preflop',
        screenName: 'Cedar31lse',
        type: 'fold',
        allIn: false,
      },
      {
        street: 'preflop',
        screenName: 'iMapleAA',
        type: 'raise',
        amount: 20,
        to: 30,
        allIn: false,
      },
      { street: 'preflop', screenName: 'Alder239', type: 'fold', allIn: false },
      {
        street: 'preflop',
        screenName: 'BIRCHWOODS',
        type: 'call',
        amount: 20,
        allIn: false,
      },
      { street: 'flop', screenName: 'BIRCHWOODS', type: 'check', allIn: false },
      { street: 'flop', screenName: 'iMapleAA', type: 'check', allIn: false },
      {
        street: 'turn',
        screenName: 'BIRCHWOODS',
        type: 'bet',
        amount: 20,
        allIn: false,
      },
      {
        street: 'turn',
        screenName: 'iMapleAA',
        type: 'call',
        amount: 20,
        allIn: false,
      },
      {
        street: 'river',
        screenName: 'BIRCHWOODS',
        type: 'check',
        allIn: false,
      },
      { street: 'river', screenName: 'iMapleAA', type: 'check', allIn: false },
    ]);
    expect(hand.board).toEqual(['2c', '10h', '4c', 'Qs', '8c']);
    expect(hand.showdown).toBe(true);
    expect(hand.shown).toEqual([
      { screenName: 'BIRCHWOODS', cards: ['As', '7d'] },
      { screenName: 'iMapleAA', cards: ['Js', '8s'] },
    ]);
    expect(hand.collected).toEqual([
      { screenName: 'iMapleAA', amount: 99, pot: 0 },
    ]);
    expect(hand.returned).toEqual([]);
    expect(hand.rake).toBe(6);
  });
});

describe('Hand History import: several Hands at once', () => {
  it('imports every Hand of a multi-Hand export, in order', () => {
    const { hands, discarded } = importHandHistory(
      fixture('pokerstars-session.txt'),
    );

    expect(discarded).toEqual([]);
    expect(hands.map((hand) => hand.siteHandId)).toEqual([
      '262120715506',
      '262120715010',
      '262120711267',
      '262120710959',
    ]);
  });

  it('keeps seats that were sitting out, marked as not dealt in', () => {
    const [hand] = importHandHistory(fixture('pokerstars-session.txt')).hands;

    expect(hand.seats.map((seat) => [seat.seat, seat.sittingOut])).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, true],
      [5, false],
    ]);
  });

  it('reads an uncalled bet handed back when everyone folds', () => {
    const [hand] = importHandHistory(fixture('pokerstars-session.txt')).hands;

    expect(hand.returned).toEqual([{ screenName: 'BIRCHWOODS', amount: 15 }]);
    expect(hand.collected).toEqual([
      { screenName: 'BIRCHWOODS', amount: 25, pot: 0 },
    ]);
    expect(hand.showdown).toBe(false);
    expect(hand.board).toEqual([]);
    expect(hand.rake).toBe(0);
  });

  it('imports Hands pasted one after another with Windows line endings', () => {
    const text = [
      fixture('pokerstars-showdown.txt'),
      fixture('pokerstars-session.txt').replace(/\n/g, '\r\n'),
    ].join('\r\n\r\n');

    expect(importHandHistory(text).hands).toHaveLength(5);
  });
});

describe('Hand History import: what is discarded', () => {
  it("discards PokerTracker 4's converted forum layout as an unrecognised format", () => {
    const text = fixture('pokertracker-forum.txt');

    const { hands, discarded } = importHandHistory(text);

    expect(hands).toEqual([]);
    expect(discarded).toEqual([
      { text: text.trim(), reason: 'unrecognised-format' },
    ]);
  });

  it('discards a bad Hand without blocking the Hands around it', () => {
    const [first, second] = fixture('pokerstars-session.txt').split(/\n\n\n/);
    const text = [first, 'not a hand history', second].join('\n\n');

    const { hands, discarded } = importHandHistory(text);

    expect(hands.map((hand) => hand.siteHandId)).toEqual([
      '262120715506',
      '262120715010',
    ]);
    expect(discarded).toEqual([
      { text: 'not a hand history', reason: 'unrecognised-format' },
    ]);
  });

  it('discards tournament Hands and games other than hold’em', () => {
    const cash = fixture('pokerstars-showdown.txt');
    const tournament = cash.replace(
      "Hold'em No Limit (€0.05/€0.10 EUR)",
      "Tournament #3912345678, €4.40+€0.60 EUR Hold'em No Limit - Level I (10/20)",
    );
    const omaha = cash.replace("Hold'em No Limit", 'Omaha Pot Limit');

    const { discarded } = importHandHistory(`${tournament}\n\n${omaha}`);

    expect(discarded.map((entry) => entry.reason)).toEqual([
      'not-cash-holdem',
      'not-cash-holdem',
    ]);
  });

  it('discards a Hand with no Hero, since it was not recorded from a seat', () => {
    const observed = fixture('pokerstars-showdown.txt').replace(
      /Dealt to .*\r?\n/,
      '',
    );

    expect(importHandHistory(observed).discarded).toEqual([
      { text: observed.trim(), reason: 'no-hero' },
    ]);
  });

  it('discards a Hand with an Action it cannot read', () => {
    const garbled = fixture('pokerstars-showdown.txt').replace(
      'iMapleAA: raises €0.20 to €0.30',
      'iMapleAA: raises lots',
    );

    expect(importHandHistory(garbled).discarded).toEqual([
      { text: garbled.trim(), reason: 'malformed' },
    ]);
  });
});

describe('Hand History import: detecting the format', () => {
  it('reports the format it detected', () => {
    const result = importHandHistory(fixture('pokerstars-session.txt'));

    expect(result.format).toBe('pokerstars');
  });

  it('reports no format, and every format it tried, when nothing is recognised', () => {
    const result = importHandHistory(fixture('pokertracker-forum.txt'));

    expect(result.format).toBeNull();
    expect(result.tried).toEqual(['pokerstars']);
  });

  it('reads every piece of the text in a format picked by hand, discarding what it cannot read', () => {
    const text = [
      fixture('pokerstars-showdown.txt'),
      fixture('pokertracker-forum.txt'),
    ].join('\n\n');

    const result = importHandHistory(text, { format: 'pokerstars' });

    expect(result.format).toBe('pokerstars');
    expect(result.tried).toEqual(['pokerstars']);
    expect(result.hands).toHaveLength(1);
    // Each piece is judged by the picked format's own parser.
    expect(result.discarded.length).toBeGreaterThan(0);
    expect(
      result.discarded.every((entry) => entry.reason === 'malformed'),
    ).toBe(true);
  });
});
