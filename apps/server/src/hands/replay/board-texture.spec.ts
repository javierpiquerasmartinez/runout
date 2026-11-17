import { boardTexture, cardChange } from './board-texture.js';

/** `'9h 8d 7c'` → the cards as a Hand writes them. */
const board = (cards: string) => cards.split(' ');

describe('Replay: a Board’s texture', () => {
  it('tells rainbow, two-tone and monotone flops apart', () => {
    expect(
      ['Kh 9d 4c', 'Kh 9h 4c', 'Kh 9h 4h'].map(
        (cards) => boardTexture(board(cards)).suits,
      ),
    ).toEqual(['rainbow', 'two-tone', 'monotone']);
  });

  it('says on the turn and the river how many cards of a suit are out', () => {
    expect(
      [
        'Kh 9h 4c 2c',
        'Kh 9h 4h 2c',
        'Kh 9h 4h 2h',
        'Kh 9d 4c 2s 7c',
        'Kh 9h 4c 2h 7c',
        'Kh 9h 4h 2h 7c',
        'Kh 9h 4h 2h 7h',
      ].map((cards) => boardTexture(board(cards)).suits),
    ).toEqual([
      'no-flush',
      'flush-possible',
      'four-of-a-suit',
      'no-flush',
      'flush-possible',
      'four-of-a-suit',
      'five-of-a-suit',
    ]);
  });

  it('names how the Board is paired', () => {
    expect(
      [
        'Kh 9d 4c',
        'Kh Kd 4c',
        'Kh Kd Kc',
        'Kh Kd 4c 4d',
        'Kh Kd Kc Ks',
        'Kh Kd 4c 4d 4s',
        'Kh Kd 4c 4d 7s',
        'Kh Kd Kc 4d 7s',
      ].map((cards) => boardTexture(board(cards)).pairing),
    ).toEqual([
      'unpaired',
      'paired',
      'trips',
      'two-pair',
      'quads',
      'full-house',
      'two-pair',
      'trips',
    ]);
  });

  it('counts the most distinct ranks within five consecutive ones, the ace also low', () => {
    expect(
      [
        '9h 8d 7c',
        'Kh 9d 4c',
        'Ah 2d 5c',
        'Kh 8d 3c',
        'Ah Kd Qc',
        'Ah Kd 2c',
        '9h 9d 7c',
        'Th 9d 8c 7s 6h',
        '10h 9d 8c',
      ].map((cards) => boardTexture(board(cards)).connectedness),
    ).toEqual([3, 2, 3, 1, 3, 2, 2, 5, 3]);
  });

  it('says a straight is possible when two cards make one on the Board', () => {
    expect(
      [
        '9h 8d 7c',
        'Ah 2d 5c',
        'Ah Kd Tc',
        'Kh 9d 4c',
        'Kh 8d 3c 2s',
        'Kh 8d 4c 2s 3d',
      ].map((cards) => boardTexture(board(cards)).straightPossible),
    ).toEqual([true, true, true, false, false, true]);
  });

  it('gives the Board’s highest rank', () => {
    expect(
      ['9h 8d 7c', '10h 9d 2c', 'Ah 2d 5c', '4h 2d 3c 2s'].map(
        (cards) => boardTexture(board(cards)).highCard,
      ),
    ).toEqual(['9', 'T', 'A', '4']);
  });
});

describe('Replay: what a turn or river card changed', () => {
  const none = {
    pairsBoard: false,
    bringsFlush: false,
    bringsStraight: false,
    overcard: false,
  };

  it('pairs the Board', () => {
    expect(cardChange(board('Kh 9d 4c'), '9s')).toEqual({
      ...none,
      pairsBoard: true,
    });
  });

  it('brings a third card of a suit, or a fourth', () => {
    expect(cardChange(board('Kh 9h 4c'), '2h')).toEqual({
      ...none,
      bringsFlush: true,
    });
    expect(cardChange(board('Kh 9h 4h 2c'), '3h')).toMatchObject({
      bringsFlush: true,
    });
    expect(cardChange(board('Kh 9d 4c'), '2h').bringsFlush).toBe(false);
  });

  it('is an overcard to the Board before it', () => {
    expect(cardChange(board('8h 5d 2c'), 'Ks')).toEqual({
      ...none,
      overcard: true,
    });
    expect(cardChange(board('Jh 9d 4c'), 'Js').overcard).toBe(false);
  });

  it('makes a straight possible that wasn’t', () => {
    expect(cardChange(board('Kh 9d 4c'), 'Qs')).toEqual({
      ...none,
      bringsStraight: true,
    });
    expect(cardChange(board('9h 8d 2c'), '7s').bringsStraight).toBe(true);
    expect(cardChange(board('9h 8d 7c'), '6s').bringsStraight).toBe(false);
  });
});
