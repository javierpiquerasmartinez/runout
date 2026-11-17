import { describe, expect, it } from 'vitest';
import {
  classifyCombo,
  COMBINATION_DRAWS,
  DRAWS,
  MADE_HANDS,
  type DrawOptions,
} from './index.js';

/** A Combo written as the Lab writes it, as `AhKd`, on a Board written as `Ks Kd 7c`. */
function classify(combo: string, board: string, options?: DrawOptions) {
  return classifyCombo([combo.slice(0, 2), combo.slice(2)], board.split(' '), options);
}

const madeHandOf = (combo: string, board: string) => classify(combo, board).madeHand;
const drawsOf = (combo: string, board: string, options?: DrawOptions) =>
  classify(combo, board, options).draws;
const combinationDrawsOf = (combo: string, board: string) =>
  classify(combo, board).combinationDraws;

describe('the Categories', () => {
  it('list the Made Hands best first, then the Draws and the combination Draws in the tables\' order', () => {
    expect(MADE_HANDS[0]).toBe('straight-flush');
    expect(MADE_HANDS.at(-1)).toBe('nothing');
    expect(MADE_HANDS).toHaveLength(17);
    expect(DRAWS).toEqual([
      'flush-draw',
      'open-ended-two-cards',
      'open-ended-one-card',
      'gutshot-two-cards',
      'gutshot-one-card',
      'overcards',
      'backdoor-two-cards',
      'backdoor-one-card',
    ]);
    expect(COMBINATION_DRAWS).toEqual([
      'flush-draw-pair',
      'flush-draw-open-ended',
      'flush-draw-gutshot',
      'flush-draw-overcards',
      'open-ended-pair',
      'gutshot-pair',
    ]);
  });
});

describe('a Combo\'s Made Hand', () => {
  it('is its best, from straight flush down to no made hand', () => {
    expect(madeHandOf('9h8h', 'Th Jh Qh')).toBe('straight-flush');
    expect(madeHandOf('7s7h', '7d 7c 2h')).toBe('quads');
    expect(madeHandOf('KsKh', 'Kd 7c 7h')).toBe('full-house');
    expect(madeHandOf('As2s', 'Ks 7s 9s')).toBe('flush');
    expect(madeHandOf('9d8c', 'Th Jh Qs')).toBe('straight');
    expect(madeHandOf('7s7h', 'Kd 7c 2h')).toBe('set');
    expect(madeHandOf('Kh7s', 'Kd 7c 2h')).toBe('two-pair');
    expect(madeHandOf('AsAh', 'Kd 7c 2h')).toBe('overpair');
    expect(madeHandOf('KhQs', 'Kd 7c 2h')).toBe('top-pair');
    expect(madeHandOf('9s9h', 'Kd 7c 2h')).toBe('below-top-card');
    expect(madeHandOf('Ah7s', 'Kd 7c 2h')).toBe('middle-pair');
    expect(madeHandOf('5s5h', 'Kd 7c 2h')).toBe('below-second-card');
    expect(madeHandOf('Qs2s', 'Kd 7c 2h')).toBe('bottom-pair');
    expect(madeHandOf('Qs3d', 'Kd 7c 4h')).toBe('nothing');
    expect(madeHandOf('As3d', 'Kd 7c 4h')).toBe('ace-high');
  });

  it('counts a straight or a flush however it is made, though the Board makes it alone', () => {
    expect(madeHandOf('3d2c', 'Ah Kd Qs Jc Ts')).toBe('straight');
    expect(madeHandOf('3d2c', 'Ah Kh 9h 5h 4h')).toBe('flush');
  });

  it('puts a pocket pair under the lowest card below the Board', () => {
    expect(madeHandOf('3s3h', 'Kd 7c 4h')).toBe('below-board');
  });

  it('counts neither a pair nor two pair the Board makes alone, as on Ks Kd 7c', () => {
    const board = 'Ks Kd 7c';
    expect(madeHandOf('AhQh', board)).toBe('ace-high');
    expect(madeHandOf('Qh9h', board)).toBe('nothing');
    expect(madeHandOf('7h2d', board)).toBe('bottom-pair');
    expect(madeHandOf('8h8d', board)).toBe('below-top-card');
    expect(madeHandOf('5h5d', board)).toBe('below-board');
    expect(madeHandOf('KhQd', board)).toBe('trips');
    expect(madeHandOf('7h7d', board)).toBe('full-house');
    expect(madeHandOf('KhKc', board)).toBe('quads');
    expect(madeHandOf('Qh9h', 'Ks Kd 7c 7d')).toBe('nothing');
    expect(madeHandOf('AhQh', 'Ks Kd Kc')).toBe('ace-high');
  });

  it('counts the one-pair rungs over the Board\'s distinct ranks, on a turn too', () => {
    const turn = 'Kd 9c 6h 3s';
    expect(madeHandOf('KsQs', turn)).toBe('top-pair');
    expect(madeHandOf('As9s', turn)).toBe('middle-pair');
    expect(madeHandOf('As6s', turn)).toBe('middle-pair');
    expect(madeHandOf('As3h', turn)).toBe('bottom-pair');
    expect(madeHandOf('TsTh', turn)).toBe('below-top-card');
    expect(madeHandOf('8s8h', turn)).toBe('below-second-card');
    expect(madeHandOf('4s4h', turn)).toBe('below-second-card');
    expect(madeHandOf('2s2h', turn)).toBe('below-board');
    // A pair on the turn leaves three distinct ranks: K, 9, 6.
    expect(madeHandOf('As6s', 'Kd 9c 6h 9s')).toBe('bottom-pair');
    expect(madeHandOf('8s8h', 'Kd 9c 6h 9s')).toBe('below-second-card');
  });
});

describe('a Combo\'s Draws', () => {
  it('count four to a flush with one or both of the Combo\'s cards as a flush draw', () => {
    expect(drawsOf('AhKh', 'Qh 7h 2c')).toContain('flush-draw');
    expect(drawsOf('AhKd', 'Qh 7h 2h')).toContain('flush-draw');
    expect(drawsOf('AsKd', 'Qh 7h 2h 3h')).not.toContain('flush-draw');
  });

  it('never count a draw to what the Combo already makes, though a made straight can be a flush draw', () => {
    expect(drawsOf('AhKh', 'Qh 7h 2h 3c')).not.toContain('flush-draw');
    expect(drawsOf('Jh9h', 'Th 8h 7c')).toContain('flush-draw');
  });

  it('tell an open-ended straight draw from a gutshot, by how many of the Combo\'s cards it needs', () => {
    expect(drawsOf('9s8d', 'Th 7c 2d')).toEqual(['open-ended-two-cards']);
    expect(drawsOf('As8d', 'Th 9c 7d')).toEqual(['open-ended-one-card']);
    expect(drawsOf('9s7d', 'Jh 8c 2d')).toEqual(['gutshot-two-cards']);
    expect(drawsOf('As7d', 'Jh 9c 8d')).toEqual(['gutshot-one-card']);
    // A wheel draw counts the ace low.
    expect(drawsOf('As3d', 'Kh 5c 4d')).toEqual(['gutshot-two-cards']);
    // A double gutshot has eight outs too.
    expect(drawsOf('Js8d', '9h 7c 5d')).toEqual(['open-ended-two-cards']);
  });

  it('always use one of the Combo\'s cards: A2 on 9-8-7 draws to no straight', () => {
    expect(drawsOf('As2d', '9h 8c 7d')).toEqual([]);
    expect(drawsOf('Ks2d', '9h 8c 7d 6s')).toEqual([]);
    expect(drawsOf('Ts2d', '9h 8c 7d 3s')).toEqual(['open-ended-one-card']);
    expect(drawsOf('4c2d', '6h 7s 8d 9c')).toEqual([]);
    expect(drawsOf('3c2d', '5h 6s 7d 8c')).toEqual([]);
    expect(drawsOf('Tc2d', '5h 6s 7d 8c')).toEqual(['gutshot-one-card']);
  });

  it('draw to no straight with one made, though a better one could come', () => {
    expect(drawsOf('9s8d', 'Th 7c 6d')).toEqual([]);
  });

  it('count overcards: both of the Combo\'s cards above the Board\'s highest, with no pair', () => {
    expect(drawsOf('AsKd', 'Qh 7c 2d')).toEqual(['overcards']);
    expect(drawsOf('AsQd', 'Qh 7c 2d')).toEqual([]);
    expect(drawsOf('AsAd', 'Qh 7c 2d')).toEqual([]);
    expect(drawsOf('AsJd', 'Qh 7c 2d')).toEqual([]);
  });

  it('count a two-card backdoor flush draw on the flop, and the one-card one only when switched on', () => {
    expect(drawsOf('As5s', 'Kh 7s 2d')).toEqual(['backdoor-two-cards']);
    expect(drawsOf('As5d', 'Kh 7s 2s')).toEqual([]);
    expect(drawsOf('As5d', 'Kh 7s 2s', { oneCardBackdoors: true })).toEqual(['backdoor-one-card']);
    // A flush draw is past a backdoor one.
    expect(drawsOf('As5s', 'Ks 7s 2d', { oneCardBackdoors: true })).toEqual(['flush-draw']);
  });

  it('are none on the river, and no backdoors on the turn', () => {
    expect(drawsOf('AhKh', 'Qh 7h 2c 3d 9s')).toEqual([]);
    expect(drawsOf('As5s', 'Kh 7s 2d 9c', { oneCardBackdoors: true })).toEqual([]);
  });
});

describe('a Combo\'s combination Draws', () => {
  it('count a pair with a flush draw in its pair, in flush draw and in flush draw + pair', () => {
    expect(classify('Ah2h', 'Kh 7h 2c')).toEqual({
      madeHand: 'bottom-pair',
      draws: ['flush-draw'],
      combinationDraws: ['flush-draw-pair'],
    });
  });

  it('combine a flush draw with a straight draw or overcards, and a straight draw with a pair', () => {
    expect(combinationDrawsOf('Jh8h', 'Th 9h 2c')).toEqual(['flush-draw-open-ended']);
    expect(combinationDrawsOf('Th7h', 'Jh 9h 2c')).toEqual(['flush-draw-gutshot']);
    expect(combinationDrawsOf('AhKh', 'Th 7h 2c')).toEqual(['flush-draw-overcards']);
    expect(combinationDrawsOf('Ts9s', '9h 8c 7d')).toEqual(['open-ended-pair']);
    expect(combinationDrawsOf('9s8s', 'Jh 8c 7d')).toEqual(['gutshot-pair']);
  });

  it('take "+ pair" as a one-pair Made Hand, not two pair or a set', () => {
    expect(combinationDrawsOf('7h2h', 'Kh 7c 2d 5h')).toEqual([]);
    expect(combinationDrawsOf('7s7h', 'Kh 7c 2h 5h')).toEqual([]);
    expect(combinationDrawsOf('AsAh', 'Kh 7c 2h 5h')).toEqual(['flush-draw-pair']);
  });

  it('never take a one-card backdoor, though it is switched on', () => {
    expect(classify('As5d', 'Ks 7s 2d', { oneCardBackdoors: true }).combinationDraws).toEqual([]);
  });

  it('are none on the river', () => {
    expect(combinationDrawsOf('Ah2h', 'Kh 7h 2c 9s 3d')).toEqual([]);
  });
});

describe('cards as a Hand History writes them', () => {
  it('read tens written as 10, as the server writes them, the same as T', () => {
    expect(classifyCombo(['10s', '9s'], ['9h', '8c', '7d'])).toEqual(classify('Ts9s', '9h 8c 7d'));
    expect(classifyCombo(['Jh', '8h'], ['10h', '9h', '2c'])).toEqual({
      madeHand: 'nothing',
      draws: ['flush-draw', 'open-ended-two-cards'],
      combinationDraws: ['flush-draw-open-ended'],
    });
  });
});
