import { readFileSync } from 'node:fs';
import type { Hand, SourceFormat } from '../hand.js';
import { overview } from '../replay/overview.js';
import { timeline } from '../replay/timeline.js';
import { importHandHistory, type DiscardReason } from './import.js';
import { readUpload } from './upload.js';

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
// USDT has no ISO 4217 code: its ticker stands in for one.
const USDT_05_10 = { ...USD_05_10, currency: 'USDT' };
const USDT_10_25 = { ...USD_10_25, currency: 'USDT' };

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
    file: 'pokerstars-all-ins.txt',
    format: 'pokerstars',
    hands: [{ siteHandId: '262140000101' }, { siteHandId: '262140000102' }],
    discarded: [],
  },
  {
    // Written by hand: no real PokerStars Hand run twice has turned up, so
    // its Runs aren't read yet (issue 26 of mvp-study-session).
    file: 'pokerstars-run-it-twice.txt',
    format: 'pokerstars',
    hands: [],
    discarded: ['run-it-twice'],
  },
  {
    file: 'pokerstars-pot-limit.txt',
    format: 'pokerstars',
    hands: [
      {
        siteHandId: '262150000101',
        stake: {
          ...USD_05_10,
          limit: 'pot-limit',
          smallBlind: 25,
          bigBlind: 50,
        },
      },
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
        // The Rake alone; the Jackpot is a Fee.
        rake: 32,
        fees: 10,
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
        fees: 0,
      },
      {
        siteHandId: '20954312-7732-1757700090',
        hero: { screenName: 'iMapleAA', cards: ['Ks', 'Jd'] },
        // Winamax doesn't print uncalled bets; they are worked out.
        returned: [{ screenName: 'iMapleAA', amount: 20 }],
        showdown: false,
        // "No rake".
        rake: 0,
        fees: 0,
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
    // A real export from CoinPoker's client, opponents hashed by the site.
    file: 'coinpoker-session.txt',
    format: 'coinpoker',
    hands: [
      {
        site: 'coinpoker',
        siteHandId: '160064400025',
        sourceFormat: 'coinpoker',
        // CEST is two hours ahead of UTC.
        playedAt: '2026-10-19T15:55:42.000Z',
        tableName: '202099',
        tableSize: 6,
        buttonSeat: 2,
        stake: USDT_05_10,
        hero: { screenName: 'Hero', cards: ['Kc', '5d'] },
        board: [],
        returned: [{ screenName: 'ebe47eca', amount: 15 }],
        // CoinPoker prints a Showdown marker even when nobody is left to show.
        showdown: false,
        collected: [{ screenName: 'ebe47eca', amount: 24, pot: 0 }],
        // The Splash Fee is a Fee, not Rake.
        rake: 0,
        fees: 1,
      },
      {
        siteHandId: '159855200579',
        hero: { screenName: 'Hero', cards: ['10h', '7h'] },
        board: ['Jc', '10d', '4c', '10s', '7s'],
        showdown: true,
        collected: [
          { screenName: 'f8fd19a3', amount: 9, pot: 0 },
          { screenName: '15bc32e9', amount: 9, pot: 0 },
        ],
        rake: 1,
        fees: 1,
      },
      {
        siteHandId: '159855200581',
        splash: 40,
        showdown: true,
        // The Splash goes to the winner without being in what they collected.
        collected: [{ screenName: '24dfed21', amount: 325, pot: 0 }],
        rake: 17,
        fees: 1,
      },
      {
        siteHandId: '159855200582',
        posts: [
          { screenName: 'f66f4b74', kind: 'small-blind', amount: 5 },
          { screenName: 'fed88a1d', kind: 'big-blind', amount: 10 },
          // A new player's blind, posted out of turn.
          { screenName: '572c791a', kind: 'big-blind', amount: 10 },
        ],
        showdown: true,
        shown: [
          { screenName: 'fed88a1d', cards: ['2c', 'Ah'] },
          { screenName: 'f66f4b74', cards: ['8s', '9c'] },
        ],
        rake: 2,
        fees: 1,
      },
      {
        siteHandId: '160054200061',
        actions: expect.arrayContaining([
          // `ALLIN ₮2.41` facing a ₮0.90 bet: the chips added, raising to 2.41.
          {
            street: 'turn',
            screenName: '8b0b5f9d',
            type: 'raise',
            amount: 151,
            to: 241,
            allIn: true,
          },
          {
            street: 'turn',
            screenName: 'Hero',
            type: 'call',
            amount: 151,
            allIn: false,
          },
        ]) as Hand['actions'],
        collected: [{ screenName: 'Hero', amount: 769, pot: 0 }],
        rake: 40,
        fees: 1,
      },
      {
        siteHandId: '159950300403',
        // The straddle comes after the hole cards, in turn.
        posts: [
          { screenName: 'ad8da529', kind: 'small-blind', amount: 5 },
          { screenName: 'Hero', kind: 'big-blind', amount: 10 },
          { screenName: '4e097d34', kind: 'straddle', amount: 20 },
        ],
        returned: [{ screenName: '4e097d34', amount: 10 }],
        showdown: false,
      },
      {
        // Run twice after an all-in on the turn: one river per Run, each
        // with its own Showdown paying half the pot.
        siteHandId: '159583401409',
        actions: expect.arrayContaining([
          {
            street: 'turn',
            screenName: 'a9373981',
            type: 'raise',
            amount: 697,
            to: 887,
            allIn: true,
          },
        ]) as Hand['actions'],
        board: ['8d', '8h', '7s', 'Ad', '3d'],
        runs: [
          ['8d', '8h', '7s', 'Ad', '3d'],
          ['8d', '8h', '7s', 'Ad', 'Qh'],
        ],
        showdown: true,
        shown: [
          { screenName: 'a9373981', cards: ['10d', 'Jd'] },
          { screenName: '7160fe9f', cards: ['As', 'Ks'] },
        ],
        collected: [
          { screenName: 'a9373981', amount: 1192, pot: 0, run: 0 },
          { screenName: '7160fe9f', amount: 1194, pot: 0, run: 1 },
        ],
        rake: 100,
        fees: 1,
      },
    ],
    discarded: [],
  },
  {
    // From NL25 up CoinPoker plays with an ante, written in the header as a
    // third Amount: `(₮0.10/₮0.25/₮0.06)`. The Stake is the blinds alone.
    file: 'coinpoker-ante.txt',
    format: 'coinpoker',
    hands: [
      {
        siteHandId: '172668000015',
        stake: USDT_10_25,
        posts: [
          { screenName: '85579140', kind: 'ante', amount: 6 },
          { screenName: 'a1607a17', kind: 'ante', amount: 6 },
          { screenName: 'Hero', kind: 'ante', amount: 6 },
          { screenName: '4ca84f30', kind: 'ante', amount: 6 },
          { screenName: '9c771390', kind: 'ante', amount: 6 },
          { screenName: '2e870d29', kind: 'ante', amount: 6 },
          { screenName: 'a1607a17', kind: 'small-blind', amount: 10 },
          { screenName: 'Hero', kind: 'big-blind', amount: 25 },
        ],
        returned: [{ screenName: 'a1607a17', amount: 43 }],
        collected: [{ screenName: 'a1607a17', amount: 80, pot: 0 }],
        rake: 4,
        fees: 2,
      },
      {
        // Five seats, five antes, and an all-in called short on the river.
        siteHandId: '172684300013',
        stake: USDT_10_25,
        posts: [
          { screenName: 'ffae5470', kind: 'ante', amount: 6 },
          { screenName: '91d01ae5', kind: 'ante', amount: 6 },
          { screenName: 'Hero', kind: 'ante', amount: 6 },
          { screenName: '12ce8028', kind: 'ante', amount: 6 },
          { screenName: '06285290', kind: 'ante', amount: 6 },
          { screenName: '06285290', kind: 'small-blind', amount: 10 },
          { screenName: 'ffae5470', kind: 'big-blind', amount: 25 },
        ],
        returned: [{ screenName: '12ce8028', amount: 156 }],
        showdown: true,
        collected: [{ screenName: '12ce8028', amount: 2518, pot: 0 }],
        rake: 133,
        fees: 2,
      },
      {
        // Two preflop `ALLIN`s: each raises to the chips its player had
        // after the ante, which is dead money and no part of the bet.
        siteHandId: '174473000347',
        stake: USDT_10_25,
        actions: expect.arrayContaining([
          expect.objectContaining({
            screenName: 'd6fec7b1',
            type: 'raise',
            to: 1522,
            allIn: true,
          }),
          expect.objectContaining({
            screenName: '519eb755',
            type: 'raise',
            to: 2574,
            allIn: true,
          }),
        ]) as Hand['actions'],
        showdown: true,
        rake: 200,
        fees: 2,
      },
    ],
    discarded: [],
  },
  {
    // A session of the iPoker client: a walk, then a raise taken down on
    // the flop. Its actions are written out of their order.
    file: 'ipoker-session.xml',
    format: 'ipoker',
    hands: [
      {
        site: 'ipoker',
        siteHandId: '6100000101',
        sourceFormat: 'ipoker',
        // Spanish summer time, two hours ahead of UTC.
        playedAt: '2026-07-20T19:00:05.000Z',
        tableName: 'Alcalá, 912000101',
        tableSize: 6,
        buttonSeat: 2,
        stake: EUR_05_10,
        hero: { screenName: 'Maplewood', cards: ['7c', '2h'] },
        posts: [
          { screenName: 'Maplewood', kind: 'small-blind', amount: 5 },
          { screenName: 'Cedar', kind: 'big-blind', amount: 10 },
        ],
        returned: [{ screenName: 'Cedar', amount: 5 }],
        collected: [{ screenName: 'Cedar', amount: 10 }],
        showdown: false,
        board: [],
        rake: 0,
        fees: 0,
      },
      {
        siteHandId: '6100000102',
        playedAt: '2026-07-20T19:00:41.000Z',
        buttonSeat: 3,
        hero: { screenName: 'Maplewood', cards: ['9d', '8d'] },
        actions: [
          { street: 'preflop', screenName: 'Fir', type: 'fold', allIn: false },
          {
            street: 'preflop',
            screenName: 'Alder',
            type: 'raise',
            amount: 20,
            to: 30,
            allIn: false,
          },
          {
            street: 'preflop',
            screenName: 'Birch',
            type: 'fold',
            allIn: false,
          },
          {
            street: 'preflop',
            screenName: 'Maplewood',
            type: 'call',
            amount: 30,
            allIn: false,
          },
          {
            street: 'preflop',
            screenName: 'Cedar',
            type: 'fold',
            allIn: false,
          },
          { street: 'preflop', screenName: 'Elm', type: 'fold', allIn: false },
          {
            street: 'flop',
            screenName: 'Alder',
            type: 'bet',
            amount: 40,
            allIn: false,
          },
          {
            street: 'flop',
            screenName: 'Maplewood',
            type: 'fold',
            allIn: false,
          },
        ],
        board: ['2s', '7c', 'Qh'],
        returned: [{ screenName: 'Alder', amount: 40 }],
        collected: [{ screenName: 'Alder', amount: 72 }],
        // No `rakeamount`: what was put in, less what was won.
        rake: 3,
      },
    ],
    discarded: [],
  },
  {
    // A Hand played to a Showdown, in winter, its Rake written per player.
    file: 'ipoker-showdown.xml',
    format: 'ipoker',
    hands: [
      {
        site: 'ipoker',
        siteHandId: '6100000201',
        // Spanish winter time, one hour ahead of UTC.
        playedAt: '2026-01-15T21:14:03.000Z',
        buttonSeat: 6,
        stake: EUR_05_10,
        seats: [
          {
            seat: 1,
            screenName: 'Alder',
            startingStack: 1000,
            sittingOut: false,
          },
          {
            seat: 3,
            screenName: 'Birch',
            startingStack: 1235,
            sittingOut: false,
          },
          {
            seat: 5,
            screenName: 'Maplewood',
            startingStack: 1000,
            sittingOut: false,
          },
          {
            seat: 6,
            screenName: 'Cedar',
            startingStack: 965,
            sittingOut: false,
          },
          {
            seat: 8,
            screenName: 'Elm',
            startingStack: 1105,
            sittingOut: false,
          },
          {
            seat: 10,
            screenName: 'Fir',
            startingStack: 690,
            sittingOut: false,
          },
        ],
        hero: { screenName: 'Maplewood', cards: ['Ah', 'Ks'] },
        actions: expect.arrayContaining([
          {
            street: 'flop',
            screenName: 'Birch',
            type: 'raise',
            amount: 100,
            to: 150,
            allIn: false,
          },
          {
            street: 'river',
            screenName: 'Maplewood',
            type: 'call',
            amount: 200,
            allIn: false,
          },
        ]) as Hand['actions'],
        board: ['10d', '7s', '2h', 'Kc', '4d'],
        returned: [],
        showdown: true,
        shown: [
          { screenName: 'Birch', cards: ['10c', '9c'] },
          { screenName: 'Maplewood', cards: ['Ah', 'Ks'] },
        ],
        collected: [{ screenName: 'Maplewood', amount: 755 }],
        rake: 40,
        fees: 0,
      },
    ],
    discarded: [],
  },
  {
    // A client from before version 20, which counts the uncalled bet in the
    // `win` of whoever made it. Six seats on iPoker's ten table positions.
    file: 'ipoker-old-client.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6100000301',
        playedAt: '2013-07-30T16:26:02.000Z',
        tableSize: 6,
        buttonSeat: 10,
        stake: { ...USD_05_10, currency: 'GBP' },
        hero: { screenName: 'Maplewood', cards: ['Ac', 'Qh'] },
        actions: expect.arrayContaining([
          {
            street: 'preflop',
            screenName: 'Cedar',
            type: 'call',
            amount: 484,
            allIn: true,
          },
        ]) as Hand['actions'],
        board: ['5d', '7c', '9d', 'Jd', 'Qd'],
        returned: [{ screenName: 'Maplewood', amount: 46 }],
        showdown: true,
        shown: [
          { screenName: 'Maplewood', cards: ['Ac', 'Qh'] },
          { screenName: 'Cedar', cards: ['Kd', 'Ks'] },
        ],
        collected: [{ screenName: 'Cedar', amount: 1142 }],
        rake: 81,
      },
    ],
    discarded: [],
  },
  {
    // An ante table: four antes, one posted by a player who then sits out
    // (code 9), one player sitting out from the start (code 8), one seated
    // with no Action at all, and an empty seat written with no name. In the
    // second Hand everyone folds to a raise: the player who posted an ante
    // and sat out was never in it, so there is no Showdown.
    file: 'ipoker-antes.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6100000401',
        playedAt: '2013-12-19T19:00:35.000Z',
        tableSize: 9,
        buttonSeat: 10,
        stake: USD_05_10,
        seats: [
          { seat: 2, screenName: 'Oak', startingStack: 980, sittingOut: true },
          {
            seat: 3,
            screenName: 'Birch',
            startingStack: 2112,
            sittingOut: true,
          },
          {
            seat: 5,
            screenName: 'Cedar',
            startingStack: 2000,
            sittingOut: false,
          },
          { seat: 6, screenName: 'Elm', startingStack: 1176, sittingOut: true },
          {
            seat: 8,
            screenName: 'Maplewood',
            startingStack: 2245,
            sittingOut: false,
          },
          {
            seat: 10,
            screenName: 'Fir',
            startingStack: 566,
            sittingOut: false,
          },
        ],
        hero: { screenName: 'Maplewood', cards: ['Jh', '4d'] },
        posts: [
          { screenName: 'Cedar', kind: 'ante', amount: 2 },
          { screenName: 'Elm', kind: 'ante', amount: 2 },
          { screenName: 'Maplewood', kind: 'ante', amount: 2 },
          { screenName: 'Fir', kind: 'ante', amount: 2 },
          { screenName: 'Cedar', kind: 'small-blind', amount: 5 },
          { screenName: 'Maplewood', kind: 'big-blind', amount: 10 },
        ],
        actions: [
          {
            street: 'preflop',
            screenName: 'Fir',
            type: 'call',
            amount: 10,
            allIn: false,
          },
          {
            street: 'preflop',
            screenName: 'Cedar',
            type: 'fold',
            allIn: false,
          },
          {
            street: 'preflop',
            screenName: 'Maplewood',
            type: 'check',
            allIn: false,
          },
          {
            street: 'flop',
            screenName: 'Maplewood',
            type: 'check',
            allIn: false,
          },
          { street: 'flop', screenName: 'Fir', type: 'check', allIn: false },
          {
            street: 'turn',
            screenName: 'Maplewood',
            type: 'check',
            allIn: false,
          },
          { street: 'turn', screenName: 'Fir', type: 'check', allIn: false },
          {
            street: 'river',
            screenName: 'Maplewood',
            type: 'check',
            allIn: false,
          },
          { street: 'river', screenName: 'Fir', type: 'check', allIn: false },
        ],
        returned: [],
        showdown: true,
        shown: [
          { screenName: 'Maplewood', cards: ['Jh', '4d'] },
          { screenName: 'Fir', cards: ['6c', '7d'] },
        ],
        collected: [{ screenName: 'Maplewood', amount: 31 }],
        rake: 2,
      },
      {
        siteHandId: '6100000402',
        buttonSeat: 5,
        hero: { screenName: 'Maplewood', cards: ['9s', '3c'] },
        returned: [{ screenName: 'Cedar', amount: 20 }],
        showdown: false,
        shown: [],
        collected: [{ screenName: 'Cedar', amount: 32 }],
        rake: 1,
      },
    ],
    discarded: [],
  },
  {
    // All-ins (codes 6 and 7) as a raise, a bet and a call for less, a side
    // pot, and Hole Cards nobody saw (`X X`).
    file: 'ipoker-all-ins.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6100000501',
        playedAt: '2026-03-10T21:00:00.000Z',
        hero: { screenName: 'Maplewood', cards: ['Ks', 'Kh'] },
        actions: [
          {
            street: 'preflop',
            screenName: 'Cedar',
            type: 'call',
            amount: 10,
            allIn: false,
          },
          { street: 'preflop', screenName: 'Fir', type: 'fold', allIn: false },
          {
            street: 'preflop',
            screenName: 'Alder',
            type: 'raise',
            amount: 490,
            to: 500,
            allIn: true,
          },
          {
            street: 'preflop',
            screenName: 'Maplewood',
            type: 'call',
            amount: 490,
            allIn: false,
          },
          {
            street: 'preflop',
            screenName: 'Cedar',
            type: 'call',
            amount: 490,
            allIn: false,
          },
          {
            street: 'flop',
            screenName: 'Maplewood',
            type: 'bet',
            amount: 300,
            allIn: false,
          },
          {
            street: 'flop',
            screenName: 'Cedar',
            type: 'raise',
            amount: 400,
            to: 700,
            allIn: true,
          },
          {
            street: 'flop',
            screenName: 'Maplewood',
            type: 'call',
            amount: 400,
            allIn: false,
          },
        ],
        board: ['2c', '7d', '9h', 'Jc', '3s'],
        returned: [],
        showdown: true,
        shown: [
          { screenName: 'Alder', cards: ['As', 'Ah'] },
          { screenName: 'Maplewood', cards: ['Ks', 'Kh'] },
          { screenName: 'Cedar', cards: ['Qs', 'Qh'] },
        ],
        collected: [
          { screenName: 'Alder', amount: 1440 },
          { screenName: 'Maplewood', amount: 1360 },
        ],
        rake: 100,
      },
      {
        siteHandId: '6100000502',
        hero: { screenName: 'Maplewood', cards: ['8c', '8d'] },
        actions: expect.arrayContaining([
          {
            street: 'flop',
            screenName: 'Fir',
            type: 'bet',
            amount: 340,
            allIn: true,
          },
          {
            street: 'flop',
            screenName: 'Maplewood',
            type: 'call',
            amount: 190,
            allIn: true,
          },
        ]) as Hand['actions'],
        returned: [{ screenName: 'Fir', amount: 150 }],
        collected: [{ screenName: 'Fir', amount: 380 }],
        rake: 20,
      },
    ],
    discarded: [],
  },
  {
    // Table sizes from sessions that don't write one, by the table positions
    // their seats take: two at 3 and 8, nine with 7 left out, ten with all.
    file: 'ipoker-heads-up.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6100000601',
        tableSize: 2,
        buttonSeat: 3,
        posts: [
          { screenName: 'Maplewood', kind: 'small-blind', amount: 5 },
          { screenName: 'Birch', kind: 'big-blind', amount: 10 },
        ],
        returned: [{ screenName: 'Birch', amount: 5 }],
        collected: [{ screenName: 'Birch', amount: 10 }],
        rake: 0,
      },
    ],
    discarded: [],
  },
  {
    file: 'ipoker-nine-max.xml',
    format: 'ipoker',
    hands: [{ siteHandId: '6100000701', tableSize: 9, buttonSeat: 10 }],
    discarded: [],
  },
  {
    // Ten seats are more than a Hand is replayed with, on any Poker Site.
    file: 'ipoker-ten-max.xml',
    format: 'ipoker',
    hands: [],
    discarded: ['too-many-seats'],
  },
  {
    // Money that doesn't add up, never given a Rake to make it: a win bigger
    // than the pot, a `rakeamount` other than what is left in the pot, and a
    // `bet` other than what the player's Actions put in.
    file: 'ipoker-unbalanced.xml',
    format: 'ipoker',
    hands: [],
    discarded: ['unbalanced', 'unbalanced', 'unbalanced'],
  },
  {
    // Fast-fold (Zone, Speed): a new table of opponents every Hand, read as
    // ordinary cash Hands.
    file: 'ipoker-fast-fold.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6100001201',
        tableName: 'Speed - Zone Poker - Texans',
        tableSize: 6,
        stake: USD_05_10,
        hero: { screenName: 'Maplewood', cards: ['7c', '2h'] },
      },
      {
        siteHandId: '6100001247',
        tableName: 'Speed - Zone Poker - Texans',
        buttonSeat: 3,
        hero: { screenName: 'Maplewood', cards: ['As', '3d'] },
        returned: [{ screenName: 'Maplewood', amount: 5 }],
        collected: [{ screenName: 'Maplewood', amount: 10 }],
      },
    ],
    discarded: [],
  },
  {
    // A session per game: pot-limit and fixed-limit hold'em are read, as on
    // the other Poker Sites; Omaha (`Omaha PL`, and five-card Omaha written
    // just `PL`), Six Plus hold'em and tournaments are not.
    file: 'ipoker-other-games.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6100001101',
        stake: { ...USD_05_10, limit: 'pot-limit' },
      },
      {
        siteHandId: '6100001102',
        stake: { ...USD_05_10, limit: 'fixed-limit' },
      },
    ],
    discarded: [
      'not-cash-holdem',
      'not-cash-holdem',
      'not-cash-holdem',
      'not-cash-holdem',
    ],
  },
  {
    // Written by hand: no real iPoker Hand run twice has turned up, so its
    // Runs (`board1win`, `board2win`) aren't read yet.
    file: 'ipoker-run-it-twice.xml',
    format: 'ipoker',
    hands: [],
    discarded: ['run-it-twice'],
  },
  {
    // PokerTracker 4's export of the Hand in ipoker-showdown.xml.
    file: 'ipoker-pt4-showdown.txt',
    format: 'ipoker-pt4',
    hands: [
      {
        site: 'ipoker',
        siteHandId: '6100000201',
        sourceFormat: 'ipoker-pt4',
        // PT4 writes GMT, as its header says.
        playedAt: '2026-01-15T21:14:03.000Z',
        tableName: 'Alcalá, 912000201',
        tableSize: 6,
        buttonSeat: 6,
        stake: EUR_05_10,
        hero: { screenName: 'Maplewood', cards: ['Ah', 'Ks'] },
        board: ['10d', '7s', '2h', 'Kc', '4d'],
        returned: [],
        showdown: true,
        shown: [
          { screenName: 'Birch', cards: ['10c', '9c'] },
          { screenName: 'Maplewood', cards: ['Ah', 'Ks'] },
        ],
        collected: [{ screenName: 'Maplewood', amount: 755 }],
        rake: 40,
        fees: 0,
      },
    ],
    discarded: [],
  },
  {
    // A PT4 session on iPoker's ten-seat numbering: an uncalled bet, a
    // walk, then all-ins on the flop, a muck and a single card shown.
    file: 'ipoker-pt4-session.txt',
    format: 'ipoker-pt4',
    hands: [
      {
        site: 'ipoker',
        siteHandId: '6100000301',
        playedAt: '2026-03-02T18:20:11.000Z',
        tableName: 'Toledo, 912000301',
        tableSize: 6,
        buttonSeat: 3,
        hero: { screenName: 'Maplewood', cards: ['8c', '8d'] },
        actions: expect.arrayContaining([
          {
            street: 'preflop',
            screenName: 'Alder',
            type: 'raise',
            amount: 20,
            to: 30,
            allIn: false,
          },
          {
            street: 'preflop',
            screenName: 'Maplewood',
            type: 'call',
            amount: 20,
            allIn: false,
          },
        ]) as Hand['actions'],
        board: ['5s', 'Jh', '2c', 'Kd'],
        // PT4 writes no line for it: the turn bet nobody called.
        returned: [{ screenName: 'Alder', amount: 110 }],
        showdown: false,
        shown: [],
        collected: [{ screenName: 'Alder', amount: 140 }],
        rake: 5,
      },
      {
        siteHandId: '6100000302',
        buttonSeat: 5,
        returned: [{ screenName: 'Elm', amount: 5 }],
        collected: [{ screenName: 'Elm', amount: 10 }],
        rake: 0,
      },
      {
        siteHandId: '6100000303',
        buttonSeat: 6,
        actions: expect.arrayContaining([
          {
            street: 'flop',
            screenName: 'Maplewood',
            type: 'raise',
            amount: 845,
            to: 895,
            allIn: true,
          },
          {
            street: 'flop',
            screenName: 'Birch',
            type: 'call',
            amount: 760,
            allIn: true,
          },
        ]) as Hand['actions'],
        board: ['10d', '7c', '3s', '2h', '8s'],
        returned: [{ screenName: 'Maplewood', amount: 85 }],
        showdown: true,
        // The Hero's muck counts as shown; Elm folded and showed one card.
        shown: [
          { screenName: 'Birch', cards: ['Ac', 'Ad'] },
          { screenName: 'Maplewood', cards: ['Qh', 'Qs'] },
        ],
        collected: [{ screenName: 'Birch', amount: 1645 }],
        rake: 50,
      },
    ],
    discarded: [],
  },
  {
    // A fast-fold (Speed) Hand reads as any cash Hand: a big blind posted
    // all-in, called, and the board run out.
    file: 'ipoker-pt4-fast-fold.txt',
    format: 'ipoker-pt4',
    hands: [
      {
        site: 'ipoker',
        siteHandId: '6100000401',
        tableName: 'Speed Poker - Guadiana',
        stake: USD_05_10,
        posts: [
          { screenName: 'Maplewood', kind: 'small-blind', amount: 5 },
          { screenName: 'Alder', kind: 'big-blind', amount: 10 },
        ],
        board: ['Ah', '9c', '2d', 'Js', '5h'],
        showdown: true,
        collected: [{ screenName: 'Alder', amount: 19 }],
        rake: 1,
      },
    ],
    discarded: [],
  },
  {
    // PT4 writes no table size: it is worked out from the table positions
    // taken, as for a session that doesn't write one. Two at 3 and 8 are
    // heads-up; 4 and 7 fit only the ten-seat table, which isn't replayed.
    file: 'ipoker-pt4-table-sizes.txt',
    format: 'ipoker-pt4',
    hands: [{ siteHandId: '6100001601', tableSize: 2, buttonSeat: 3 }],
    discarded: ['too-many-seats'],
  },
  {
    // A Hand that doesn't balance, an export from before PT4 wrote the
    // client version and GMT, a Hand run twice (how PT4 writes one is a
    // guess until a real one turns up) and Omaha.
    file: 'ipoker-pt4-discarded.txt',
    format: 'ipoker-pt4',
    hands: [],
    discarded: ['unbalanced', 'old-export', 'run-it-twice', 'not-cash-holdem'],
  },
  {
    // Saved in cp1252 by an older client, the € as the byte 0x80, though
    // its XML declaration says utf-8.
    file: 'ipoker-cp1252.xml',
    format: 'ipoker',
    hands: [
      {
        site: 'ipoker',
        siteHandId: '6300000301',
        playedAt: '2016-03-11T22:40:12.000Z',
        tableName: 'Málaga, 913000301',
        stake: EUR_05_10,
        hero: { screenName: 'Maplewood', cards: ['Js', '4c'] },
        returned: [{ screenName: 'Maplewood', amount: 5 }],
        collected: [{ screenName: 'Maplewood', amount: 10 }],
        rake: 0,
      },
    ],
    discarded: [],
  },
  {
    // Dates written year first with slashes, as clients wrote them in 2017.
    file: 'ipoker-date-slashes.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6300000401',
        // Spanish winter time, one hour ahead of UTC.
        playedAt: '2017-01-23T21:27:48.000Z',
        stake: { ...EUR_05_10, smallBlind: 1, bigBlind: 2 },
        hero: { screenName: 'Maplewood', cards: ['8h', 'Kh'] },
        showdown: true,
        collected: [{ screenName: 'Cedar', amount: 15 }],
        rake: 1,
      },
    ],
    discarded: [],
  },
  {
    // Dates written day first with dots, as clients wrote them in 2021.
    file: 'ipoker-date-dots.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6300000501',
        // Spanish summer time, two hours ahead of UTC.
        playedAt: '2021-05-18T16:26:13.000Z',
        stake: EUR_05_10,
        returned: [{ screenName: 'Maplewood', amount: 25 }],
        collected: [{ screenName: 'Maplewood', amount: 25 }],
        rake: 0,
      },
    ],
    discarded: [],
  },
  {
    // Dates with the month's name, as clients wrote them in 2012, in a
    // session too old to name its currency other than by its sign.
    file: 'ipoker-date-month.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6300000601',
        playedAt: '2012-04-20T18:11:15.000Z',
        stake: USD_10_25,
        hero: { screenName: 'Maplewood', cards: ['7s', '2d'] },
        returned: [{ screenName: 'Alder', amount: 50 }],
        collected: [{ screenName: 'Alder', amount: 50 }],
        rake: 0,
      },
    ],
    discarded: [],
  },
  {
    // Amounts with the decimal comma and the sign after them, as French
    // skins write them.
    file: 'ipoker-decimal-comma.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6300000701',
        stake: { ...EUR_05_10, smallBlind: 1, bigBlind: 2 },
        seats: [
          {
            seat: 1,
            screenName: 'Alder',
            startingStack: 196,
            sittingOut: false,
          },
          {
            seat: 2,
            screenName: 'Birch',
            startingStack: 237,
            sittingOut: false,
          },
          {
            seat: 4,
            screenName: 'Maplewood',
            startingStack: 200,
            sittingOut: false,
          },
          {
            seat: 5,
            screenName: 'Cedar',
            startingStack: 150,
            sittingOut: false,
          },
        ],
        hero: { screenName: 'Maplewood', cards: ['Jh', 'Js'] },
        showdown: true,
        collected: [{ screenName: 'Maplewood', amount: 27 }],
        rake: 3,
      },
    ],
    discarded: [],
  },
  {
    // Amounts with thousands separators, at high Stakes.
    file: 'ipoker-thousands.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6300000801',
        stake: { ...USD_05_10, smallBlind: 1000, bigBlind: 2000 },
        seats: [
          {
            seat: 2,
            screenName: 'Alder',
            startingStack: 200000,
            sittingOut: false,
          },
          {
            seat: 3,
            screenName: 'Maplewood',
            startingStack: 129500,
            sittingOut: false,
          },
          {
            seat: 5,
            screenName: 'Birch',
            startingStack: 1969550,
            sittingOut: false,
          },
        ],
        hero: { screenName: 'Maplewood', cards: ['As', 'Ah'] },
        showdown: true,
        collected: [{ screenName: 'Maplewood', amount: 255000 }],
        rake: 4000,
      },
    ],
    discarded: [],
  },
  {
    // A client set to Spanish: no limit is `SL`, sin límite.
    file: 'ipoker-spanish.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6300000901',
        stake: { ...USD_05_10, smallBlind: 1, bigBlind: 2 },
        hero: { screenName: 'Maplewood', cards: ['3h', 'Jc'] },
        returned: [{ screenName: 'Birch', amount: 6 }],
        collected: [{ screenName: 'Birch', amount: 12 }],
        rake: 0,
      },
    ],
    discarded: [],
  },
  {
    // A client set to Russian: no limit is `БЛ`, без лимита.
    file: 'ipoker-russian.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6300001001',
        stake: { ...EUR_05_10, smallBlind: 25, bigBlind: 50 },
        hero: { screenName: 'Maplewood', cards: ['10d', '4d'] },
        collected: [{ screenName: 'Maplewood', amount: 50 }],
        rake: 0,
      },
    ],
    discarded: [],
  },
  {
    // A session per variant no client is known to write, each left out
    // rather than read wrongly: a date with the month first, a month named
    // in Spanish, a limit in an unknown language, an unknown currency sign,
    // a table currency that is none, one the blinds' sign contradicts, and
    // an Amount no client writes. The first session, written as clients do,
    // is read.
    file: 'ipoker-unrecognised.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6300001101',
        playedAt: '2024-02-10T11:00:00.000Z',
        stake: EUR_05_10,
        returned: [{ screenName: 'Maplewood', amount: 5 }],
        collected: [{ screenName: 'Maplewood', amount: 10 }],
        rake: 0,
      },
    ],
    discarded: [
      'malformed',
      'malformed',
      'malformed',
      'malformed',
      'malformed',
      'malformed',
      'malformed',
    ],
  },
  {
    // The limit written out in full and an ante of nothing after the
    // blinds, as Hold'em Manager's archive writes `<gametype>`, and the
    // cards nobody saw written `x x`.
    file: 'ipoker-archive-names.xml',
    format: 'ipoker',
    hands: [
      {
        siteHandId: '6300001201',
        stake: USD_05_10,
        hero: { screenName: 'Maplewood', cards: ['5d', '5c'] },
        posts: [
          { screenName: 'Alder', kind: 'small-blind', amount: 5 },
          { screenName: 'Maplewood', kind: 'big-blind', amount: 10 },
        ],
        collected: [{ screenName: 'Maplewood', amount: 10 }],
        rake: 0,
      },
      {
        siteHandId: '6300001202',
        stake: { ...USD_05_10, limit: 'pot-limit' },
        collected: [{ screenName: 'Alder', amount: 10 }],
        rake: 0,
      },
    ],
    discarded: [],
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

/** A fixture's text, decoded as an upload of it would be. */
function fixture(name: string): string {
  return readUpload(
    name,
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url)),
  );
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
    '$file #$id pays out exactly what was in the pot',
    ({ hand }) => {
      // A Splash goes to the winner, but no Hand History counts it as collected.
      const paid =
        hand.collected.reduce((sum, { amount }) => sum + amount, 0) +
        hand.rake +
        hand.fees +
        (hand.splash ?? 0);

      expect(paid).toBe(overview(hand).finalPot);
    },
  );

  it.each(everyHand)(
    '$file #$id has Run 1 as its board, if it was run more than once',
    ({ hand }) => {
      if (hand.runs) {
        expect(hand.runs.length).toBeGreaterThanOrEqual(2);
        expect(hand.runs[0]).toEqual(hand.board);
      }
      // Only a Hand run more than once says which Run paid each winner.
      for (const { run } of hand.collected) {
        expect(run === undefined).toBe(hand.runs === undefined);
      }
    },
  );

  it('reads one iPoker Hand alike from the client XML and from PT4, so it is one Hand', () => {
    const [xml] = importHandHistory(fixture('ipoker-showdown.xml')).hands;
    const [pt4] = importHandHistory(fixture('ipoker-pt4-showdown.txt')).hands;

    // The uniqueness a Library keeps: Poker Site and hand ID.
    expect(pt4.site).toBe(xml.site);
    expect(pt4.siteHandId).toBe(xml.siteHandId);
    // And the same Hand in every other respect but its layout.
    const { sourceFormat, ...rest } = xml;
    expect(sourceFormat).toBe('ipoker');
    expect(pt4).toMatchObject(rest);
  });

  it.each(everyHand)('$file #$id replays to the end', ({ hand }) => {
    expect(() => timeline(hand)).not.toThrow();
  });

  it.each(everyHand.filter(({ hand }) => !hand.runs))(
    '$file #$id, run once, replays without Runs',
    ({ hand }) => {
      const { states } = timeline(hand);
      expect(states.every((s) => s.run === null && s.runs === null)).toBe(true);
    },
  );

  it.each(everyHand)('$file #$id writes tens as "10"', ({ hand }) => {
    const cards = [
      ...hand.hero.cards,
      ...hand.board,
      ...hand.shown.flatMap((shown) => shown.cards),
    ];

    expect(cards.filter((card) => card.startsWith('T'))).toEqual([]);
  });
});
