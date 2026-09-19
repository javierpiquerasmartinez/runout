/**
 * Where the domain reads time. Time-based rules (Master failover, empty-Room
 * closure, undo windows) read and schedule through it so tests can drive time.
 */
export interface Clock {
  now(): Date;
  /** Runs `callback` once after `delayMs`. Returns a function that cancels it. */
  schedule(delayMs: number, callback: () => unknown): () => void;
}

export const CLOCK = Symbol('CLOCK');

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  schedule(delayMs: number, callback: () => unknown): () => void {
    const timer = setTimeout(() => void callback(), delayMs);
    return () => clearTimeout(timer);
  }
}
