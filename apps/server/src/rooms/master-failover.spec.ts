import { TestClock } from '../../test/support/test-clock.js';
import { MASTER_GRACE_MS, MasterFailover } from './master-failover.js';

describe('MasterFailover', () => {
  function watching() {
    const clock = new TestClock();
    const passedOn: string[] = [];
    const failover = new MasterFailover(clock, (roomId) =>
      passedOn.push(roomId),
    );
    return { clock, passedOn, failover };
  }

  it('passes the role on once the grace period runs out', async () => {
    const { clock, passedOn, failover } = watching();
    failover.watch('room-1');

    await clock.advance(MASTER_GRACE_MS - 1);
    expect(passedOn).toEqual([]);

    await clock.advance(1);
    expect(passedOn).toEqual(['room-1']);
  });

  it('keeps the grace period a Master left running when another tab drops', async () => {
    const { clock, passedOn, failover } = watching();
    failover.watch('room-1');
    await clock.advance(MASTER_GRACE_MS / 2);
    failover.watch('room-1');

    await clock.advance(MASTER_GRACE_MS / 2);
    expect(passedOn).toEqual(['room-1']);
  });

  it('passes nothing on once the Master is back', async () => {
    const { clock, passedOn, failover } = watching();
    failover.watch('room-1');
    failover.stop('room-1');

    await clock.advance(MASTER_GRACE_MS * 2);
    expect(passedOn).toEqual([]);
    expect(failover.expired('room-1')).toBe(false);
  });

  it('reports a Room whose Master is already out of grace, so an arrival takes over', async () => {
    const { clock, failover } = watching();
    failover.watch('room-1');

    await clock.advance(MASTER_GRACE_MS - 1);
    expect(failover.expired('room-1')).toBe(false);

    await clock.advance(1);
    expect(failover.expired('room-1')).toBe(true);
    expect(failover.expired('room-2')).toBe(false);
  });
});
