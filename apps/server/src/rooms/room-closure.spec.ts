import { TestClock } from '../../test/support/test-clock.js';
import { ABANDONED_ROOM_MS, RoomClosure } from './room-closure.js';

describe('RoomClosure', () => {
  function watching() {
    const clock = new TestClock();
    const closed: string[] = [];
    const closure = new RoomClosure(clock, (roomId) => closed.push(roomId));
    return { clock, closed, closure };
  }

  it('closes a Room left empty for the whole period', async () => {
    const { clock, closed, closure } = watching();
    closure.watch('room-1');

    await clock.advance(ABANDONED_ROOM_MS - 1);
    expect(closed).toEqual([]);

    await clock.advance(1);
    expect(closed).toEqual(['room-1']);
  });

  it('leaves a Room open when someone comes back in time', async () => {
    const { clock, closed, closure } = watching();
    closure.watch('room-1');
    await clock.advance(ABANDONED_ROOM_MS / 2);
    closure.stop('room-1');

    await clock.advance(ABANDONED_ROOM_MS * 2);
    expect(closed).toEqual([]);
  });

  it('counts from the moment the Room emptied, not from the last arrival', async () => {
    const { clock, closed, closure } = watching();
    closure.watch('room-1');
    await clock.advance(ABANDONED_ROOM_MS / 2);
    // A second tab dropping must not give the Room another full period.
    closure.watch('room-1');

    await clock.advance(ABANDONED_ROOM_MS / 2);
    expect(closed).toEqual(['room-1']);
  });

  it('watches each Room on its own', async () => {
    const { clock, closed, closure } = watching();
    closure.watch('room-1');
    await clock.advance(ABANDONED_ROOM_MS / 2);
    closure.watch('room-2');

    await clock.advance(ABANDONED_ROOM_MS / 2);
    expect(closed).toEqual(['room-1']);

    await clock.advance(ABANDONED_ROOM_MS / 2);
    expect(closed).toEqual(['room-1', 'room-2']);
  });

  it('starts a fresh period when a Room is watched again after firing', async () => {
    const { clock, closed, closure } = watching();
    closure.watch('room-1');
    await clock.advance(ABANDONED_ROOM_MS);
    closure.watch('room-1');
    await clock.advance(ABANDONED_ROOM_MS);

    expect(closed).toEqual(['room-1', 'room-1']);
  });
});
