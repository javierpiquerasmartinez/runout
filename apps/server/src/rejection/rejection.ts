/**
 * Why the server refused a command. Every refusal carries one of these, over
 * HTTP (in the body) and over the WebSocket (as a `rejected` event).
 */
export type RejectionReason =
  | 'unauthenticated'
  | 'invalid-display-name'
  | 'invalid-screen-names'
  | 'invalid-preferences'
  | 'invalid-room-name'
  | 'room-not-found'
  | 'not-in-room'
  | 'not-master'
  | 'not-a-participant'
  | 'already-master'
  | 'master-must-choose'
  | 'cannot-kick-yourself'
  | 'kicked-from-room'
  | 'hand-not-found'
  | 'hand-not-in-queue'
  | 'no-hand-loaded'
  | 'invalid-action-index'
  | 'file-too-large'
  | 'unreadable-file'
  | 'invalid-format'
  | 'preview-not-found'
  | 'author-not-in-room'
  | 'invalid-queue-order'
  | 'entry-not-in-queue'
  | 'nothing-to-undo'
  | 'undo-expired'
  | 'invalid-note'
  | 'note-not-found';

/** Thrown by the domain; each transport turns it into its own reply. */
export class Rejected extends Error {
  constructor(readonly reason: RejectionReason) {
    super(reason);
    this.name = 'Rejected';
  }
}
