import { readFileSync } from 'node:fs';
import type { Hand, SourceFormat } from '../hand.js';
import { summarise } from '../replay/summary.js';
import { timeline } from '../replay/timeline.js';
import { importHandHistory, type DiscardReason } from './import.js';

/*
 * The fixture corpus: one entry per file in ./fixtures, each with what it
 * must read as. A file the parser can't handle stays here with the discard
 * reason it is expected to get; it is never deleted. See fixtures/README.md.
 */

interface CorpusEntry {
  file: string;
  format: SourceFormat | null;
  /** Each Hand read, in order, checked field by field. */
  hands: Partial<Hand>[];
  /** Each discarded entry's reason, in order. */
  discarded: DiscardReason[];
}

const USD_05_10 = {
  limit: 'no-limit',
  smallBlind: 5,
  bigBlind: 10,
  currency: 'USD',
} as const;
const USD_10_25 = { ...USD_05_10, smallBlind: 10, bigBlind: 25 };
const EUR_05_10 = { ...USD_05_10, currency: 'EUR' };

const CORPUS: CorpusEntry[] = [
  {
    file: 'pokerstars-showdown.txt',
    format: 'pokerstars',
    hands: [{ site: 'pokerstars', siteHandId: '262120750636' }],
    discarded: [],
  },
  {
    file: 'pokerstars-session.txt',
    format: 'pokerstars',
    hands: [
      { siteHandId: '262120715506' },
      { siteHandId: '262120715010' },
      { siteHandId: '262120711267' },
      { siteHandId: '262120710959' },
    ],
    discarded: [],
  },
  {
    file: 'pokerstars-edge-cases.txt',
    format: 'pokerstars',
    hands: [
      { siteHandId: '262130000101', tableSize: 2 },
      { siteHandId: '262130000102', tableSize: 9 },
      { siteHandId: '262130000103' },
      { siteHandId: '262130000104' },
    ],
    discarded: [],
  },
  {
    file: 'pokerstars-ten-max.txt',
    format: 'pokerstars',
    hands: [],
    discarded: ['too-many-seats'],
  },
  {
    file: 'ggpoker-session.txt',
    format: 'ggpoker',
    hands: [
      {
        site: 'ggpoker',
        siteHandId: 'RC2104577321',
        sourceFormat: 'ggpoker',
        playedAt: '2026-09-12T19:02:11.000Z',
        tableName: 'RushAndCash10354271',
        tableSize: 6,
        buttonSeat: 1,
        stake: USD_05_10,
        hero: { screenName: 'Hero', cards: ['Ah', '10c'] },
        board: ['10d', '7s', '2h', 'Kc', '9d'],
        showdown: true,
        shown: [
          { screenName: '0be55d17', cards: ['Qd', 'Qs'] },
          { screenName: 'Hero', cards: ['Ah', '10c'] },
        ],
        collected: [{ screenName: '0be55d17', amount: 823, pot: 0 }],
        // Everything the house took: rake and the jackpot fee.
        rake: 42,
      },
      {
        siteHandId: 'HD1180452290',
        stake: USD_10_25,
        hero: { screenName: 'Hero', cards: ['Kh', 'Kd'] },
        posts: [
          { screenName: '44f1b8a2', kind: 'small-blind', amount: 10 },
          { screenName: 'd6e02c7f', kind: 'big-blind', amount: 25 },
          { screenName: 'Hero', kind: 'straddle', amount: 50 },
        ],
        returned: [{ screenName: 'Hero', amount: 350 }],
        // GGPoker prints a Showdown marker even when nobody is left to show.
        showdown: false,
        board: [],
      },
      {
        siteHandId: 'HD1180452377',
        hero: { screenName: 'Hero', cards: ['9s', '8s'] },
        board: ['10s', '7d', '2s'],
        returned: [{ screenName: 'Hero', amount: 220 }],
        // Shown by choice after everyone folded: not a Showdown.
        showdown: false,
      },
    ],
    discarded: [],
  },
  {
    file: 'ggpoker-discarded.txt',
    format: 'ggpoker',
    hands: [],
    discarded: ['not-cash-holdem', 'not-cash-holdem'],
  },
  {
    file: 'winamax-session.txt',
    format: 'winamax',
    hands: [
      {
        site: 'winamax',
        siteHandId: '20954312-7731-1757700000',
        sourceFormat: 'winamax',
        playedAt: '2026-09-12T18:40:00.000Z',
        tableName: 'Wichita 03',
        tableSize: 6,
        buttonSeat: 2,
        stake: EUR_05_10,
        seats: [
          {
            seat: 1,
            screenName: 'Alder239',
            startingStack: 1000,
            sittingOut: false,
          },
          {
            seat: 2,
            screenName: 'Birch Woods',
            startingStack: 1240,
            sittingOut: false,
          },
          {
            seat: 3,
            screenName: 'iMapleAA',
            startingStack: 1010,
            sittingOut: false,
          },
          {
            seat: 5,
            screenName: 'Cedar31',
            startingStack: 875,
            sittingOut: false,
          },
        ],
        hero: { screenName: 'iMapleAA', cards: ['10h', '9h'] },
        posts: [
          { screenName: 'iMapleAA', kind: 'small-blind', amount: 5 },
          { screenName: 'Cedar31', kind: 'big-blind', amount: 10 },
        ],
        board: ['9c', '5d', '2s', '10s', 'Qd'],
        showdown: true,
        returned: [],
        collected: [{ screenName: 'iMapleAA', amount: 224, pot: 0 }],
        rake: 16,
      },
      {
        siteHandId: '20954312-7732-1757700090',
        hero: { screenName: 'iMapleAA', cards: ['Ks', 'Jd'] },
        // Winamax doesn't print uncalled bets; they are worked out.
        returned: [{ screenName: 'iMapleAA', amount: 20 }],
        showdown: false,
        rake: 0,
      },
      {
        siteHandId: '20954312-7733-1757700200',
        returned: [{ screenName: 'iMapleAA', amount: 9 }],
        showdown: true,
        collected: [
          { screenName: 'iMapleAA', amount: 530, pot: 1 },
          { screenName: 'Cedar31', amount: 2524, pot: 0 },
        ],
      },
    ],
    discarded: [],
  },
  {
    file: 'winamax-discarded.txt',
    format: 'winamax',
    hands: [],
    discarded: ['not-cash-holdem', 'not-cash-holdem'],
  },
  {
    // PokerTracker 4's forum layout has no exact Amounts to replay.
    file: 'pokertracker-forum.txt',
    format: null,
    hands: [],
    discarded: ['unrecognised-format'],
  },
  {
    // A Poker Site whose layout isn't read yet.
    file: '888poker-unsupported.txt',
    format: null,
    hands: [],
    discarded: ['unrecognised-format'],
  },
];

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('Hand History import: the fixture corpus', () => {
  it.each(CORPUS)(
    '$file reads as its expected Hands and discards',
    ({ file, format, hands, discarded }) => {
      const result = importHandHistory(fixture(file));

      expect(result.format).toBe(format);
      expect(result.discarded.map((entry) => entry.reason)).toEqual(discarded);
      expect(result.hands).toHaveLength(hands.length);
      result.hands.forEach((hand, index) => {
        expect(hand).toMatchObject(hands[index]);
      });
    },
  );

  const everyHand = CORPUS.flatMap(({ file }) =>
    importHandHistory(fixture(file)).hands.map((hand) => ({
      file,
      id: hand.siteHandId,
      hand,
    })),
  );

  it.each(everyHand)(
    '$file #$id pays out exactly what was put in',
    ({ hand }) => {
      const paid =
        hand.collected.reduce((sum, { amount }) => sum + amount, 0) + hand.rake;

      expect(paid).toBe(summarise(hand).finalPot);
    },
  );

  it.each(everyHand)('$file #$id replays to the end', ({ hand }) => {
    expect(() => timeline(hand)).not.toThrow();
  });

  it.each(everyHand)('$file #$id writes tens as "10"', ({ hand }) => {
    const cards = [
      ...hand.hero.cards,
      ...hand.board,
      ...hand.shown.flatMap((shown) => shown.cards),
    ];

    expect(cards.filter((card) => card.startsWith('T'))).toEqual([]);
  });
});
