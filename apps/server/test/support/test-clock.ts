import type { Clock } from '../../src/clock/clock.js';

interface Scheduled {
  dueAt: number;
  order: number;
  callback: () => void;
}

/** A Clock that only moves when a test calls `advance`. */
export class TestClock implements Clock {
  private current: number;
  private pending: Scheduled[] = [];
  private scheduledCount = 0;

  constructor(start: Date = new Date('2026-01-01T00:00:00Z')) {
    this.current = start.getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  schedule(delayMs: number, callback: () => void): () => void {
    const entry = {
      dueAt: this.current + delayMs,
      order: this.scheduledCount++,
      callback,
    };
    this.pending.push(entry);
    return () => {
      this.pending = this.pending.filter((other) => other !== entry);
    };
  }

  /** Moves time forward, running every callback that falls due on the way. */
  advance(ms: number): void {
    const target = this.current + ms;
    for (let next = this.nextDue(target); next; next = this.nextDue(target)) {
      this.pending = this.pending.filter((other) => other !== next);
      this.current = next.dueAt;
      next.callback();
    }
    this.current = target;
  }

  private nextDue(target: number): Scheduled | undefined {
    return this.pending
      .filter((entry) => entry.dueAt <= target)
      .sort((a, b) => a.dueAt - b.dueAt || a.order - b.order)[0];
  }
}
