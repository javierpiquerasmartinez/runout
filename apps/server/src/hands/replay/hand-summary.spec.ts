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
