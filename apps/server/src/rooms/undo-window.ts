import type { Clock } from '../clock/clock.js';
import { Rejected } from '../rejection/rejection.js';

/**
 * How long the Master has to take back something they removed. The same
 * window for every soft removal in a Room: Queue Entries and Notes alike.
 */
export const UNDO_WINDOW_MS = 10_000;

/**
 * Reads a soft-removed row's `removedAt` as the undo it allows: `nothing-to-undo`
 * when it was never removed, `undo-expired` once its window has run out.
 */
export function requireUndoable(
  clock: Clock,
  removedAt: Date | null | undefined,
): void {
  if (!removedAt) throw new Rejected('nothing-to-undo');
  if (clock.now().getTime() - removedAt.getTime() > UNDO_WINDOW_MS) {
    throw new Rejected('undo-expired');
  }
}
