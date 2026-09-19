/**
 * Why the server refused a command. Every refusal carries one of these, over
 * HTTP (in the body) and over the WebSocket (as a `rejected` event).
 */
export type RejectionReason =
  | 'unauthenticated'
  | 'invalid-display-name'
  | 'invalid-room-name'
  | 'room-not-found'
  | 'not-in-room'
  | 'not-master'
  | 'hand-not-found'
  | 'hand-not-in-queue'
  | 'no-hand-loaded'
  | 'invalid-action-index';

/** Thrown by the domain; each transport turns it into its own reply. */
export class Rejected extends Error {
  constructor(readonly reason: RejectionReason) {
    super(reason);
    this.name = 'Rejected';
  }
}
