import type { Clock } from '../clock/clock.js';

/** How long a Room may go without anyone entering it before it closes (ADR 0009). */
export const ABANDONED_ROOM_MS = 14 * 24 * 60 * 60_000;

/** How often open Rooms are checked, so a Room due closes within this much. */
export const SWEEP_EVERY_MS = 60 * 60_000;

/**
 * Looks over the open Rooms every so often for those nobody has entered for
 * the whole period. It keeps no Room in memory: what it closes is read from
 * the database each time, so a restart in between loses nothing.
 */
export class RoomSweep {
  private cancel: (() => void) | null = null;

  constructor(
    private readonly clock: Clock,
    /** Closes every open Room nobody has entered since `cutoff`. */
    private readonly sweep: (cutoff: Date) => unknown,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}

  /** Sweeps now, then once every period until stopped. */
  start(): void {
    this.next(0);
  }

  stop(): void {
    this.cancel?.();
    this.cancel = null;
  }

  private next(delayMs: number): void {
    this.cancel = this.clock.schedule(delayMs, async () => {
      try {
        await this.sweep(
          new Date(this.clock.now().getTime() - ABANDONED_ROOM_MS),
        );
      } catch (error) {
        this.onError(error);
      }
      if (this.cancel) this.next(SWEEP_EVERY_MS);
    });
  }
}
