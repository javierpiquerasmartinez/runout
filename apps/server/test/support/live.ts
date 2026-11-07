import type { RoomClient } from './room-client.js';

/**
 * The Master starts Live with no Hand loaded, as a Room had it before Free
 * Review (ADR 0009), for tests about the shared Playback. Everyone else in
 * the Room is sent `live.started` too; they need not read it.
 */
export async function goLive(master: RoomClient): Promise<void> {
  master.send('live.start', {});
  await master.next('live.started');
}
