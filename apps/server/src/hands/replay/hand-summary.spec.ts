import { readFileSync } from 'node:fs';
import { importHandHistory } from '../import/import.js';
import { handSummary } from './hand-summary.js';

function hands(name: string) {
  const text = readFileSync(
    new URL(`../import/fixtures/${name}`, import.meta.url),
    'utf8',
  );
  return importHandHistory(text).hands;
}

function hand(name: string, siteHandId: string) {
  return hands(name).find((each) => each.siteHandId === siteHandId)!;
}

const madrid = 'Europe/Madrid';

describe('Replay: a Hand Summary', () => {
  it('writes a Hand that went to Showdown, in Spanish', () => {
    const [showdown] = hands('pokerstars-showdown.txt');

    expect(handSummary(showdown, { language: 'es', timeZone: madrid })).toBe(
      [
        'PokerStars · NL10 (0,05 €/0,10 €) · 6-max · 18/09/2026',
        'Hero BTN 100bb · J♠ 8♠',
        '',
        'Preflop: CO fold, Hero raise 3bb, SB fold, BB call',
        'Flop (6,5bb) 2♣ T♥ 4♣: BB check, Hero check',
        'Turn (6,5bb) Q♠: BB bet 2bb, Hero call',
        'River (10,5bb) 8♣: BB check, Hero check',
        'Showdown: BB muestra A♠ 7♦ · Hero gana 9,9bb (rake 0,6bb)',
        'Resultado Hero: +4,9bb',
      ].join('\n'),
    );
  });

  it('writes the same Hand in English', () => {
    const [showdown] = hands('pokerstars-showdown.txt');

    expect(handSummary(showdown, { language: 'en', timeZone: madrid })).toBe(
      [
        'PokerStars · NL10 (€0.05/€0.10) · 6-max · 09/18/2026',
        'Hero BTN 100bb · J♠ 8♠',
        '',
        'Preflop: CO fold, Hero raise 3bb, SB fold, BB call',
        'Flop (6.5bb) 2♣ T♥ 4♣: BB check, Hero check',
        'Turn (6.5bb) Q♠: BB bet 2bb, Hero call',
        'River (10.5bb) 8♣: BB check, Hero check',
        'Showdown: BB shows A♠ 7♦ · Hero wins 9.9bb (rake 0.6bb)',
        'Hero result: +4.9bb',
      ].join('\n'),
    );
  });

  it('writes a Hand that ends preflop, with nothing to rake', () => {
    expect(
      handSummary(hand('pokerstars-session.txt', '262120715506'), {
        language: 'es',
        timeZone: madrid,
      }),
    ).toBe(
      [
        'PokerStars · NL10 (0,05 €/0,10 €) · 6-max · 18/09/2026',
        'Hero BB 100bb · 4♣ J♣',
        '',
        'Preflop: CO fold, BTN raise 2,5bb, SB fold, Hero fold',
        'BTN gana 2,5bb',
        'Resultado Hero: -1bb',
      ].join('\n'),
    );
  });

  it('writes a Hand the Hero folds, leaving out the bet handed back', () => {
    expect(
      handSummary(hand('pokerstars-session.txt', '262120715010'), {
        language: 'en',
        timeZone: 'UTC',
      }),
    ).toBe(
      [
        'PokerStars · NL10 (€0.05/€0.10) · 6-max · 09/18/2026',
        'Hero CO 113.7bb · 4♠ T♣',
        '',
        'Preflop: HJ fold, Hero fold, BTN raise 2.5bb, SB fold, BB call',
        'Flop (5.5bb) Q♠ Q♦ T♠: BB check, BTN bet 1.7bb, BB fold',
        'BTN wins 5.2bb (rake 0.3bb)',
        'Hero result: 0bb',
      ].join('\n'),
    );
  });

  it('writes a Hand the Hero wins without Showdown', () => {
    expect(
      handSummary(hand('pokerstars-session.txt', '262120710959'), {
        language: 'es',
        timeZone: madrid,
      }),
    ).toBe(
      [
        'PokerStars · NL10 (0,05 €/0,10 €) · 6-max · 18/09/2026',
        'Hero BTN 110,6bb · A♣ K♥',
        '',
        'Preflop: HJ fold, CO fold, Hero raise 3bb, SB fold, BB call',
        'Flop (6,5bb) T♠ 4♠ T♣: BB check, Hero bet 2bb, BB fold',
        'Hero gana 6,1bb (rake 0,4bb)',
        'Resultado Hero: +3,1bb',
      ].join('\n'),
    );
  });

  it('writes a 3bet pot to Showdown, with the all-in and the board run out', () => {
    expect(
      handSummary(hand('coinpoker-session.txt', '160054200061'), {
        language: 'es',
        timeZone: madrid,
      }),
    ).toBe(
      [
        'CoinPoker · NL10 (0,05 ₮/0,10 ₮) · 6-max · 19/10/2026',
        'Hero BTN 101,7bb · A♥ T♠',
        '',
        'Preflop: UTG fold, HJ fold, CO fold, Hero raise 2,5bb, SB 3bet 10bb, BB fold, Hero call',
        'Flop (21bb) 5♦ 4♦ 2♣: SB bet 5,9bb, Hero call',
        'Turn (32,8bb) T♣: SB check, Hero bet 9bb, SB all-in 24,1bb, Hero call',
        'River (81bb) A♣',
        'Showdown: SB muestra K♦ T♥ · Hero gana 76,9bb (rake 4,1bb)',
        'Resultado Hero: +36,9bb',
      ].join('\n'),
    );
  });

  it('writes the date as the day it was in the time zone asked for', () => {
    // Played at 00:30 in Madrid, still the day before in New York.
    const [showdown] = hands('pokerstars-showdown.txt');
    const late = { ...showdown, playedAt: '2026-09-17T22:30:00.000Z' };

    expect(
      handSummary(late, { language: 'es', timeZone: madrid }).split('\n')[0],
    ).toBe('PokerStars · NL10 (0,05 €/0,10 €) · 6-max · 18/09/2026');
    expect(
      handSummary(late, { language: 'es', timeZone: 'America/New_York' }).split(
        '\n',
      )[0],
    ).toBe('PokerStars · NL10 (0,05 €/0,10 €) · 6-max · 17/09/2026');
  });
});

describe('Replay: a Hand Summary of an unusual Hand', () => {
  it('writes antes on the header and each winner’s total across side pots, at nine-max', () => {
    // The Hero's $20 handed back uncalled is never shown, nor collected.
    expect(
      handSummary(hand('pokerstars-edge-cases.txt', '262130000102'), {
        language: 'en',
        timeZone: madrid,
      }),
    ).toBe(
      [
        'PokerStars · NL50 ($0.25/$0.50) · ante 0.1bb · 9-max · 09/10/2026',
        'Hero HJ 160bb · A♥ A♦',
        '',
        'Preflop: UTG all-in 19.9bb, UTG+1 fold, MP fold, LJ fold, Hero call, CO fold, BTN call, SB fold, BB all-in 49.9bb, Hero all-in 159.9bb, BTN all-in 119.9bb',
        'Flop (311bb) K♥ 9♣ 4♦',
        'Turn (311bb) 2♠',
        'River (311bb) 7♥',
        'Showdown: BB shows Q♠ Q♣, UTG shows K♠ K♦, BTN shows A♣ Q♦ · UTG wins 79bb, Hero wins 226bb (rake 6bb)',
        'Hero result: +106bb',
      ].join('\n'),
    );
  });

  it('writes a straddle first, and the first raise over it as a raise', () => {
    expect(
      handSummary(hand('pokerstars-edge-cases.txt', '262130000103'), {
        language: 'es',
        timeZone: madrid,
      }),
    ).toBe(
      [
        'PokerStars · NL50 (0,25 US$/0,50 US$) · 6-max · 10/09/2026',
        'Hero BTN 100bb · 9♠ 9♥',
        '',
        'Preflop: UTG straddle 2bb, HJ fold, CO call, Hero raise 8bb, SB fold, BB fold, UTG call, CO fold',
        'Flop (19,5bb) 9♦ 5♣ 2♥: UTG check, Hero bet 9bb, UTG raise 30bb, Hero call',
        'Turn (79,5bb) J♣: UTG all-in 62bb, Hero all-in 62bb',
        'River (203,5bb) 5♥',
        'Showdown: UTG muestra J♥ J♠ · UTG gana 197,5bb (rake 6bb)',
        'Resultado Hero: -100bb',
      ].join('\n'),
    );
  });

  it('writes a GGPoker Hand with the Hero’s straddle, re-raised as a 3bet', () => {
    expect(
      handSummary(hand('ggpoker-session.txt', 'HD1180452290'), {
        language: 'en',
        timeZone: madrid,
      }),
    ).toBe(
      [
        'GGPoker · NL25 ($0.10/$0.25) · 6-max · 09/12/2026',
        'Hero HJ 100bb · K♥ K♦',
        '',
        'Preflop: Hero straddle 2bb, CO raise 6bb, BTN fold, SB fold, BB fold, Hero 3bet 20bb, CO fold',
        'Hero wins 13.4bb',
        'Hero result: +7.4bb',
      ].join('\n'),
    );
  });

  it('writes a CoinPoker Hand with a Splash in the pot and never named', () => {
    // The ₮0.40 Splash is 4bb of the flop's pot and of what CO wins.
    expect(
      handSummary(hand('coinpoker-session.txt', '159855200581'), {
        language: 'es',
        timeZone: madrid,
      }),
    ).toBe(
      [
        'CoinPoker · NL10 (0,05 ₮/0,10 ₮) · 6-max · 19/10/2026',
        'Hero SB 102,6bb · A♠ 3♦',
        '',
        'Preflop: HJ fold, CO raise 2,5bb, BTN fold, Hero fold, BB call',
        'Flop (9,5bb) 6♣ 5♣ T♥: BB check, CO bet 4,1bb, BB call',
        'Turn (17,7bb) 2♥: BB check, CO bet 10,3bb, BB call',
        'River (38,3bb) Q♦: BB check, CO check',
        'Showdown: BB muestra 5♠ 7♥, CO muestra K♠ T♠ · CO gana 36,5bb (rake 1,8bb)',
        'Resultado Hero: -0,5bb',
      ].join('\n'),
    );
  });

  it('writes a heads-up Hand all-in preflop, with the whole board run out', () => {
    expect(
      handSummary(hand('pokerstars-all-ins.txt', '262140000101'), {
        language: 'en',
        timeZone: madrid,
      }),
    ).toBe(
      [
        'PokerStars · NL50 ($0.25/$0.50) · HU · 09/14/2026',
        'Hero BTN 100bb · K♦ K♣',
        '',
        'Preflop: Hero raise 3bb, BB all-in 100bb, Hero all-in 100bb',
        'Flop (200bb) K♠ 7♦ 4♥',
        'Turn (200bb) 9♣',
        'River (200bb) 2♠',
        'Showdown: BB shows A♥ A♠ · Hero wins 195bb (rake 5bb)',
        'Hero result: +95bb',
      ].join('\n'),
    );
  });

  it('writes a Winamax Hand where the Hero wins only a side pot', () => {
    expect(
      handSummary(hand('winamax-session.txt', '20954312-7733-1757700200'), {
        language: 'en',
        timeZone: madrid,
      }),
    ).toBe(
      [
        'Winamax · NL10 (€0.05/€0.10) · 6-max · 09/12/2026',
        'Hero CO 113.4bb · Q♥ Q♣',
        '',
        'Preflop: Hero raise 3bb, BTN all-in 86bb, SB fold, BB call, Hero all-in 113.4bb, BB all-in 112.5bb',
        'Flop (311.5bb) 8♦ 4♣ 2♥',
        'Turn (311.5bb) 9♣',
        'River (311.5bb) 3♠',
        'Showdown: BB shows J♠ J♦, BTN shows A♥ A♦ · BTN wins 252.4bb, Hero wins 53bb (rake 6.1bb)',
        'Hero result: -59.5bb',
      ].join('\n'),
    );
  });

  it('writes a pot-limit Hand where only the Hero shows', () => {
    expect(
      handSummary(hand('pokerstars-pot-limit.txt', '262150000101'), {
        language: 'es',
        timeZone: madrid,
      }),
    ).toBe(
      [
        'PokerStars · PL50 (0,25 US$/0,50 US$) · 6-max · 15/09/2026',
        'Hero BTN 100bb · Q♠ Q♥',
        '',
        'Preflop: Hero raise 3,5bb, SB fold, BB call',
        'Flop (7,5bb) Q♦ 7♣ 2♠: BB check, Hero bet 5bb, BB call',
        'Turn (17,5bb) 9♥: BB check, Hero check',
        'River (17,5bb) 3♦: BB check, Hero bet 8bb, BB call',
        'Showdown: Hero gana 32bb (rake 1,5bb)',
        'Resultado Hero: +15,5bb',
      ].join('\n'),
    );
  });

  it('names a fixed-limit Stake FL', () => {
    // No fixture has a fixed-limit Hand yet.
    const potLimit = hand('pokerstars-pot-limit.txt', '262150000101');
    const fixedLimit = {
      ...potLimit,
      stake: { ...potLimit.stake, limit: 'fixed-limit' as const },
    };

    expect(
      handSummary(fixedLimit, { language: 'en', timeZone: madrid }).split(
        '\n',
      )[0],
    ).toBe('PokerStars · FL50 ($0.25/$0.50) · 6-max · 09/15/2026');
  });

  it('writes big amounts in big blinds without grouping thousands, in both languages', () => {
    // No fixture has a stack this deep.
    const [showdown] = hands('pokerstars-showdown.txt');
    const deep = {
      ...showdown,
      seats: showdown.seats.map((seat) => ({
        ...seat,
        startingStack: seat.startingStack * 1000,
      })),
    };

    for (const language of ['es', 'en'] as const) {
      expect(
        handSummary(deep, { language, timeZone: madrid }).split('\n')[1],
      ).toBe('Hero BTN 100000bb · J♠ 8♠');
    }
  });
});
