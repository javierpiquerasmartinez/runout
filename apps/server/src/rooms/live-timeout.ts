import type { Clock } from '../clock/clock.js';

/** How long a Room stays Live with no Master connected (ADR 0009). */
export const LIVE_WITHOUT_MASTER_MS = 30 * 60_000;

/**
 * The Live Rooms whose Master is not connected. Once one has gone the whole
 * period without one, Live ends on its own, so a Master who forgot to end it
 * never leaves the Room stuck. The period counts from the Master's first
 * absence; a Master coming back, or the role passing to someone connected,
 * stops it.
 */
export class LiveTimeout {
  private readonly watching = new Map<string, () => void>();

  constructor(
    private readonly clock: Clock,
    /** Ends Live in the Room. */
    private readonly end: (roomId: string) => unknown,
  ) {}

  /**
   * Starts the period, or carries on one that began `since` (as read back
   * after a restart). Whether it started now: false when already running.
   */
  watch(roomId: string, since: Date = this.clock.now()): boolean {
    if (this.watching.has(roomId)) return false;
    const left =
      LIVE_WITHOUT_MASTER_MS - (this.clock.now().getTime() - since.getTime());
    this.watching.set(
      roomId,
      this.clock.schedule(Math.max(0, left), () => {
        this.watching.delete(roomId);
        return this.end(roomId);
      }),
    );
    return true;
  }

  /** Stops the period: a Master is connected again. Whether one was running. */
  stop(roomId: string): boolean {
    const cancel = this.watching.get(roomId);
    cancel?.();
    this.watching.delete(roomId);
    return cancel !== undefined;
  }
}
