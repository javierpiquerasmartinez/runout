import type { Clock } from '../clock/clock.js';

/** How long a Room may sit with nobody connected before it closes itself. */
export const ABANDONED_ROOM_MS = 30 * 60_000;

/**
 * The Rooms nobody is connected to. Each one is given the abandonment period
 * to get someone back; once it runs out the Room closes on its own. The
 * period counts from the moment the Room emptied, so a Room that empties,
 * fills and empties again is only ever waiting on its latest emptying.
 */
export class RoomClosure {
  private readonly watching = new Map<string, () => void>();

  constructor(
    private readonly clock: Clock,
    /** Closes the Room, once it has been empty for the whole period. */
    private readonly close: (roomId: string) => unknown,
  ) {}

  /** Starts the abandonment period of a Room that has just emptied. */
  watch(roomId: string): void {
    if (this.watching.has(roomId)) return;
    this.watching.set(
      roomId,
      this.clock.schedule(ABANDONED_ROOM_MS, () => {
        this.watching.delete(roomId);
        return this.close(roomId);
      }),
    );
  }

  /** Stops watching: someone is back, or the Room has closed already. */
  stop(roomId: string): void {
    this.watching.get(roomId)?.();
    this.watching.delete(roomId);
  }
}
