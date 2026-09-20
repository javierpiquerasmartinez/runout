/**
 * Where each open Room is in its own history. Every change to a Room's shared
 * state takes the next revision, and the change is sent carrying it, so a
 * Participant can tell a change they missed from one they already have.
 *
 * Revisions are per Room and live only as long as the Room does: they are a
 * sequence number for one session, never an identifier of anything.
 */
export class RoomRevisions {
  private readonly revisions = new Map<string, number>();

  /** The revision the Room is at right now. A Room nothing has happened in is at 0. */
  current(roomId: string): number {
    return this.revisions.get(roomId) ?? 0;
  }

  /** Records one change and returns the revision it produced. */
  next(roomId: string): number {
    const revision = this.current(roomId) + 1;
    this.revisions.set(roomId, revision);
    return revision;
  }

  /** Forgets a Room that has closed; a closed Room never reopens. */
  forget(roomId: string): void {
    this.revisions.delete(roomId);
  }
}
