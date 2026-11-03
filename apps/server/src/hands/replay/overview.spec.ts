import { readFileSync } from 'node:fs';
import { importHandHistory } from '../import/import.js';
import { overview } from './overview.js';

function hands(name: string) {
  const text = readFileSync(
    new URL(`../import/fixtures/${name}`, import.meta.url),
    'utf8',
  );
  return importHandHistory(text).hands;
}

describe('Replay: a Hand’s overview', () => {
  // Final pots are the "Total pot" each Hand History states in its summary.
  it('gives the overview of a Hand that went to Showdown on the river', () => {
    const [hand] = hands('pokerstars-showdown.txt');

    expect(overview(hand)).toEqual({
      positions: ['BTN', 'BB'],
      finalPot: 105,
      finalStreet: 'river',
      showdown: true,
    });
  });

  it('gives the overview of each Hand of an export, net of uncalled bets handed back', () => {
    expect(hands('pokerstars-session.txt').map(overview)).toEqual([
      // Sitting-out seats aren't dealt in, so this 5-seat table plays 4-handed.
      {
        positions: ['BTN'],
        finalPot: 25,
        finalStreet: 'preflop',
        showdown: false,
      },
      // The Hero folded, so the Positions are in the order they acted.
      {
        positions: ['BTN', 'BB'],
        finalPot: 55,
        finalStreet: 'flop',
        showdown: false,
      },
      {
        positions: ['CO', 'BB'],
        finalPot: 65,
        finalStreet: 'turn',
        showdown: false,
      },
      {
        positions: ['BTN', 'BB'],
        finalPot: 65,
        finalStreet: 'flop',
        showdown: false,
      },
    ]);
  });
});
