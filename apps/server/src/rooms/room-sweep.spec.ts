import { TestClock } from '../../test/support/test-clock.js';
import { ABANDONED_ROOM_MS, RoomSweep, SWEEP_EVERY_MS } from './room-sweep.js';

describe('RoomSweep', () => {
  function sweeping() {
    const clock = new TestClock();
    const cutoffs: Date[] = [];
    const sweep = new RoomSweep(clock, (cutoff) => cutoffs.push(cutoff));
    return { clock, cutoffs, sweep };
  }

  it('sweeps at once when started, then once every period', async () => {
    const { clock, cutoffs, sweep } = sweeping();
    sweep.start();
    await clock.advance(0);
    expect(cutoffs).toHaveLength(1);

    await clock.advance(SWEEP_EVERY_MS * 3);
    expect(cutoffs).toHaveLength(4);
  });

  it('asks for the Rooms nobody has entered for 14 days', async () => {
    const { clock, cutoffs, sweep } = sweeping();
    sweep.start();
    await clock.advance(SWEEP_EVERY_MS);

    expect(cutoffs.at(-1)).toEqual(
      new Date(clock.now().getTime() - ABANDONED_ROOM_MS),
    );
    expect(ABANDONED_ROOM_MS).toBe(14 * 24 * 60 * 60_000);
  });

  it('stops sweeping once stopped', async () => {
    const { clock, cutoffs, sweep } = sweeping();
    sweep.start();
    await clock.advance(0);
    sweep.stop();

    await clock.advance(SWEEP_EVERY_MS * 5);
    expect(cutoffs).toHaveLength(1);
  });

  it('keeps sweeping after a sweep fails', async () => {
    const clock = new TestClock();
    let calls = 0;
    const sweep = new RoomSweep(clock, () => {
      calls++;
      throw new Error('database away');
    });
    sweep.start();

    await clock.advance(SWEEP_EVERY_MS * 2);
    expect(calls).toBe(3);
  });
});
