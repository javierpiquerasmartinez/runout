import { TestClock } from '../../test/support/test-clock.js';
import { LIVE_WITHOUT_MASTER_MS, LiveTimeout } from './live-timeout.js';

describe('LiveTimeout', () => {
  function watching() {
    const clock = new TestClock();
    const ended: string[] = [];
    const timeout = new LiveTimeout(clock, (roomId) => ended.push(roomId));
    return { clock, ended, timeout };
  }

  it('ends Live once the Room has gone 30 minutes without its Master', async () => {
    const { clock, ended, timeout } = watching();
    timeout.watch('room-1');

    await clock.advance(LIVE_WITHOUT_MASTER_MS - 1);
    expect(ended).toEqual([]);
    await clock.advance(1);
    expect(ended).toEqual(['room-1']);
    expect(LIVE_WITHOUT_MASTER_MS).toBe(30 * 60_000);
  });

  it('ends nothing once a Master is back', async () => {
    const { clock, ended, timeout } = watching();
    timeout.watch('room-1');
    await clock.advance(LIVE_WITHOUT_MASTER_MS / 2);
    timeout.stop('room-1');

    await clock.advance(LIVE_WITHOUT_MASTER_MS * 2);
    expect(ended).toEqual([]);
  });

  it('counts from the Master’s first absence when watched again meanwhile', async () => {
    const { clock, ended, timeout } = watching();
    timeout.watch('room-1');
    await clock.advance(LIVE_WITHOUT_MASTER_MS / 2);
    timeout.watch('room-1');

    await clock.advance(LIVE_WITHOUT_MASTER_MS / 2);
    expect(ended).toEqual(['room-1']);
  });

  it('carries on a period that began before, as after a restart', async () => {
    const { clock, ended, timeout } = watching();
    const since = new Date(clock.now().getTime() - LIVE_WITHOUT_MASTER_MS / 3);
    timeout.watch('room-1', since);

    await clock.advance((LIVE_WITHOUT_MASTER_MS * 2) / 3);
    expect(ended).toEqual(['room-1']);
  });

  it('watches each Room on its own', async () => {
    const { clock, ended, timeout } = watching();
    timeout.watch('room-1');
    await clock.advance(LIVE_WITHOUT_MASTER_MS / 2);
    timeout.watch('room-2');

    await clock.advance(LIVE_WITHOUT_MASTER_MS / 2);
    expect(ended).toEqual(['room-1']);
    await clock.advance(LIVE_WITHOUT_MASTER_MS / 2);
    expect(ended).toEqual(['room-1', 'room-2']);
  });
});
