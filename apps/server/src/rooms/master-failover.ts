import type { Clock } from '../clock/clock.js';

/** How long a Room waits for its Master before the role passes on. */
export const MASTER_GRACE_MS = 120_000;

/**
 * The Rooms whose Master is not connected. Each one is given the grace period
 * to come back; once it runs out the role passes on. While nobody is there to
 * take it the watch stays armed, so the next Participant to arrive takes it.
 */
export class MasterFailover {
  private readonly watching = new Map<
    string,
    { since: number; cancel: () => void }
  >();

  constructor(
    private readonly clock: Clock,
    /** Passes the role on, when there is someone present to take it. */
    private readonly passOn: (roomId: string) => unknown,
  ) {}

  /** Starts the grace period of a Room whose Master has just dropped. */
  watch(roomId: string): void {
    if (this.watching.has(roomId)) return;
    this.watching.set(roomId, {
      since: this.clock.now().getTime(),
      cancel: this.clock.schedule(MASTER_GRACE_MS, () => this.passOn(roomId)),
    });
  }

  /** Stops watching: the Master is back, or the role has already moved. */
  stop(roomId: string): void {
    this.watching.get(roomId)?.cancel();
    this.watching.delete(roomId);
  }

  /** Whether the Master of this Room has now been away longer than the grace period. */
  expired(roomId: string): boolean {
    const watch = this.watching.get(roomId);
    return (
      watch !== undefined &&
      this.clock.now().getTime() - watch.since >= MASTER_GRACE_MS
    );
  }
}
