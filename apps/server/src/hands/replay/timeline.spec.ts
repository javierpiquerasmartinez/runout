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

  it('starts at the Initial State, blinds posted, then has one state per Action', () => {
    const { states } = timeline(showdown);

    expect(states).toHaveLength(1 + 10);
    expect(states[0]).toEqual({
      street: 'preflop',
      board: [],
      pot: 15,
      toAct: 'Cedar31lse',
      action: null,
      players: [
        { screenName: 'Alder239', stack: 1131, bet: 5, folded: false },
        { screenName: 'BIRCHWOODS', stack: 1194, bet: 10, folded: false },
        { screenName: 'Cedar31lse', stack: 1110, bet: 0, folded: false },
        { screenName: 'iMapleAA', stack: 1000, bet: 0, folded: false },
      ],
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

  it('deals the next Street once the last one closes, sweeping the bets into the pot', () => {
    const { states } = timeline(showdown);

    // BIRCHWOODS calls, closing preflop: the flop is out and BIRCHWOODS acts first.
    expect(states[4]).toMatchObject({
      street: 'flop',
      board: ['2c', '10h', '4c'],
      pot: 65,
      toAct: 'BIRCHWOODS',
    });
    expect(players(states[4])).toEqual([
      ['Alder239', 1131, 0, true],
      ['BIRCHWOODS', 1174, 0, false],
      ['Cedar31lse', 1110, 0, true],
      ['iMapleAA', 970, 0, false],
    ]);

    // A turn bet is in play until it is called.
    expect(states[7]).toMatchObject({ street: 'turn', pot: 85 });
    expect(players(states[7])[1]).toEqual(['BIRCHWOODS', 1154, 20, false]);
  });

  it('ends with the whole board and nobody to act', () => {
    const { states } = timeline(showdown);

    expect(states[10]).toMatchObject({
      street: 'river',
      board: ['2c', '10h', '4c', 'Qs', '8c'],
      pot: 105,
      toAct: null,
    });
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

  it('leaves out players who sat out, and keeps the board of a Hand won by a fold', () => {
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
    // The flop bet stays in front of juniperpallo; nobody called it.
    expect(last.players.find((p) => p.screenName === 'juniperpallo')?.bet).toBe(
      17,
    );
  });
});
