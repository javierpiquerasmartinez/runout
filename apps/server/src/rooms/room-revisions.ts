/**
 * Where each open Room is in its own history. Every change to a Room's shared
 * state takes the next revision, and the change is sent carrying it, so a
 * Participant can tell a change they missed from one they already have.
 *
 * A Revision belongs to one Room and lives only as long as that Room does:
 * it says where the Room stands, never which Room or which change it is.
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
