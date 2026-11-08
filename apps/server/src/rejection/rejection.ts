/**
 * Why the server refused a command. Every refusal carries one of these, over
 * HTTP (in the body) and over the WebSocket (as a `rejected` event).
 */
export type RejectionReason =
  | 'unauthenticated'
  | 'invalid-google-token'
  | 'account-required'
  | 'invalid-display-name'
  | 'invalid-screen-names'
  | 'invalid-preferences'
  | 'invalid-room-name'
  | 'room-not-found'
  | 'not-in-room'
  | 'not-master'
  | 'not-your-note'
  | 'not-a-participant'
  | 'already-master'
  | 'master-must-choose'
  | 'cannot-kick-yourself'
  | 'kicked-from-room'
  | 'identity-of-another-room'
  | 'hand-not-found'
  | 'invalid-hand-copy'
  | 'no-history'
  | 'hand-not-in-queue'
  | 'no-hand-loaded'
  | 'not-live'
  | 'already-live'
  | 'invalid-action-index'
  | 'invalid-hide-opponent-names'
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
  | 'note-not-found'
  | 'invalid-library-filter'
  | 'invalid-library-sort'
  | 'invalid-tag-name'
  | 'tag-name-taken'
  | 'tag-not-found'
  | 'invalid-tag-hands'
  | 'invalid-hand-selection'
  | 'invalid-range-name'
  | 'range-name-taken'
  | 'invalid-range-combos'
  | 'invalid-range-tags'
  | 'invalid-range-filter'
  | 'range-not-found'
  | 'invalid-milestone-title'
  | 'invalid-milestone-description'
  | 'invalid-milestone-date'
  | 'invalid-milestone-done'
  | 'invalid-calendar-span'
  | 'milestone-not-found'
  | 'not-found'
  | 'invalid-email'
  | 'invalid-language'
  | 'account-exists'
  | 'invitation-pending'
  | 'invitation-not-found'
  | 'invitation-expired'
  | 'invitation-cancelled'
  | 'invitation-used'
  | 'invitation-email-mismatch'
  | 'invitation-required'
  | 'email-taken'
  | 'password-too-weak'
  | 'invalid-credentials'
  | 'too-many-attempts'
  | 'account-suspended'
  | 'reset-not-found'
  | 'reset-expired'
  | 'reset-used'
  | 'password-exists'
  | 'cannot-suspend-administrator'
  | 'cannot-impersonate-administrator'
  | 'impersonation-not-allowed'
  | 'invalid-admin-query';

/** Thrown by the domain; each transport turns it into its own reply. */
export class Rejected extends Error {
  /**
   * `details` travel beside the reason, for a refusal the person can act on:
   * when to try again, which email was invited.
   */
  constructor(
    readonly reason: RejectionReason,
    readonly details: Record<string, unknown> = {},
  ) {
    super(reason);
    this.name = 'Rejected';
  }
}
