import { describe, expect, it } from 'vitest';
import { bestHand, cardCode, categoryOf, strength } from './index.js';

describe('bestHand', () => {
  it('names a full house by its trips, then its pair', () => {
    expect(bestHand(['Kh', 'Kd', 'Ks', '7c', '7d', '2h', '9s'])).toEqual({
      category: 'full-house',
      ranks: ['K', '7'],
      cards: ['Kh', 'Kd', 'Ks', '7c', '7d'],
    });
  });

  it('leaves the kickers out of a pair', () => {
    expect(bestHand(['Ah', 'Qd', 'Qs', '9c', '4d', '3h', '2s'])).toEqual({
      category: 'pair',
      ranks: ['Q'],
      cards: ['Qd', 'Qs'],
    });
  });

  it('lays out a wheel with the ace at the bottom, named by its five', () => {
    expect(bestHand(['Ah', '2d', '3s', '4c', '5d', 'Kh', '9s'])).toEqual({
      category: 'straight',
      ranks: ['5'],
      cards: ['5d', '4c', '3s', '2d', 'Ah'],
    });
  });

  it('names a flush by its highest card and keeps the five best of the suit', () => {
    expect(bestHand(['Ah', '9h', '7h', '4h', '3h', '2h', 'Ks'])).toEqual({
      category: 'flush',
      ranks: ['A'],
      cards: ['Ah', '9h', '7h', '4h', '3h'],
    });
  });

  it('calls an ace-high straight flush a straight flush to the ace', () => {
    expect(bestHand(['10s', 'Js', 'Qs', 'Ks', 'As', '2d', '2c'])).toEqual({
      category: 'straight-flush',
      ranks: ['A'],
      cards: ['As', 'Ks', 'Qs', 'Js', '10s'],
    });
  });

  it('keeps the hole card first when a board card has the same rank', () => {
    expect(bestHand(['Kh', '8c', 'Kd', '5s', '3h']).cards).toEqual([
      'Kh',
      'Kd',
    ]);
  });

  it('evaluates a flop: five cards', () => {
    expect(bestHand(['9c', '9d', '9h', '2s', '2c']).category).toBe(
      'full-house',
    );
  });
});

describe('strength', () => {
  const of = (cards: string[]) => strength(cards.map(cardCode));

  // Five- to seven-card hands, each beating the one before it.
  const ladder: [string, string[]][] = [
    ['high-card', ['Kh', '9d', '7s', '5c', '3d']],
    ['high-card', ['Ah', '9d', '7s', '5c', '3d', 'Jh', '2s']],
    ['pair', ['2h', '2d', '7s', '5c', '3d', 'Jh', '9s']],
    ['pair', ['Ah', 'Ad', '7s', '5c', '3d', 'Jh', '9s']],
    ['pair', ['Ah', 'Ad', '7s', '5c', '3d', 'Kh', '9s']],
    ['two-pair', ['3h', '3d', '2s', '2c', '7d', 'Jh', '9s']],
    ['two-pair', ['Ah', 'Ad', 'Ks', 'Kc', '3d', '4h', '2s']],
    ['two-pair', ['Ah', 'Ad', 'Ks', 'Kc', 'Qd', '4h', '2s']],
    ['three-of-a-kind', ['2h', '2d', '2s', '9c', '7d', 'Jh', '4s']],
    ['straight', ['Ah', '2d', '3s', '4c', '5d', 'Jh', '9s']],
    ['straight', ['6h', '2d', '3s', '4c', '5d', 'Jh', '9s']],
    ['straight', ['Ah', 'Kd', 'Qs', 'Jc', '10d', '2h', '3s']],
    ['flush', ['Kh', '9h', '7h', '5h', '3h', '2d', '4s']],
    ['flush', ['Ah', '9h', '7h', '5h', '3h', '2d', '4s']],
    ['full-house', ['2h', '2d', '2s', '3c', '3d', 'Jh', '9s']],
    ['full-house', ['Kh', 'Kd', 'Ks', '7c', '7d', '7h', '2s']],
    ['full-house', ['Ah', 'Ad', 'As', '2c', '2d', 'Jh', '9s']],
    ['four-of-a-kind', ['2h', '2d', '2s', '2c', '3d', '4h', '5s']],
    ['four-of-a-kind', ['2h', '2d', '2s', '2c', 'Ad', '4h', '5s']],
    ['straight-flush', ['Ah', '2h', '3h', '4h', '5h', 'Kd', 'Ks']],
    ['straight-flush', ['10s', 'Js', 'Qs', 'Ks', 'As', '2d', '2c']],
  ];

  it('ranks every hand above the one before it in the ladder', () => {
    for (let i = 1; i < ladder.length; i++) {
      expect(
        of(ladder[i][1]),
        `${ladder[i][1].join(' ')} beats ${ladder[i - 1][1].join(' ')}`,
      ).toBeGreaterThan(of(ladder[i - 1][1]));
    }
  });

  it('agrees with bestHand on the category of every hand in the ladder', () => {
    for (const [category, cards] of ladder) {
      expect(bestHand(cards).category, cards.join(' ')).toBe(category);
    }
  });

  it('names the category of every hand in the ladder', () => {
    for (const [category, cards] of ladder) {
      expect(categoryOf(of(cards)), cards.join(' ')).toBe(category);
    }
  });

  it('ties hands that differ only in suits', () => {
    expect(of(['Ah', 'Kd', '9s', '7c', '3d', '2h', '4s'])).toBe(
      of(['As', 'Kc', '9h', '7d', '3c', '2s', '4h']),
    );
  });

  it('ties two players when the board plays', () => {
    const board = ['Ah', 'Kh', 'Qd', 'Jc', '10s'];
    expect(of(['2c', '3d', ...board])).toBe(of(['4s', '5h', ...board]));
  });

  it('ignores a kicker beyond the best five cards', () => {
    expect(of(['Ah', 'Ad', 'Ks', 'Qc', 'Jd', '3h', '2s'])).toBe(
      of(['Ac', 'As', 'Kd', 'Qh', 'Js', '5h', '4d']),
    );
  });
});
