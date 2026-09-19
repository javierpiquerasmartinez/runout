import { TestClock } from './test-clock.js';

describe('TestClock', () => {
  it('stands still until advanced', async () => {
    const clock = new TestClock(new Date('2026-09-19T20:00:00Z'));

    expect(clock.now().toISOString()).toBe('2026-09-19T20:00:00.000Z');
    await clock.advance(90_000);
    expect(clock.now().toISOString()).toBe('2026-09-19T20:01:30.000Z');
  });

  it('runs a scheduled callback once its delay has elapsed', async () => {
    const clock = new TestClock();
    const fired: string[] = [];
    clock.schedule(120_000, () => fired.push('failover'));

    await clock.advance(119_999);
    expect(fired).toEqual([]);

    await clock.advance(1);
    expect(fired).toEqual(['failover']);

    await clock.advance(120_000);
    expect(fired).toEqual(['failover']);
  });

  it('runs due callbacks in order, each seeing its own due time', async () => {
    const clock = new TestClock(new Date(0));
    const seen: [string, number][] = [];
    clock.schedule(30, () => seen.push(['b', clock.now().getTime()]));
    clock.schedule(10, () => seen.push(['a', clock.now().getTime()]));

    await clock.advance(60);

    expect(seen).toEqual([
      ['a', 10],
      ['b', 30],
    ]);
    expect(clock.now().getTime()).toBe(60);
  });

  it('runs callbacks scheduled by a callback when they fall in the same advance', async () => {
    const clock = new TestClock(new Date(0));
    const fired: number[] = [];
    clock.schedule(10, () => {
      fired.push(clock.now().getTime());
      clock.schedule(10, () => fired.push(clock.now().getTime()));
    });

    await clock.advance(25);

    expect(fired).toEqual([10, 20]);
  });

  it('does not run a cancelled callback', async () => {
    const clock = new TestClock();
    const fired: string[] = [];
    const cancel = clock.schedule(10, () => fired.push('undo window closed'));

    cancel();
    await clock.advance(10);

    expect(fired).toEqual([]);
  });
});

describe('TestClock with async callbacks', () => {
  it('waits for a callback to settle before advance resolves', async () => {
    const clock = new TestClock();
    const done: string[] = [];
    clock.schedule(10, async () => {
      await Promise.resolve();
      done.push('room closed');
    });

    await clock.advance(10);

    expect(done).toEqual(['room closed']);
  });
});
