import type { invitations } from '../database/schema.js';
import { Rejected } from '../rejection/rejection.js';

/** How long an Invitation's link works after it was (last) sent. */
export const INVITATION_LIFETIME_MS = 7 * 24 * 3_600_000;

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

type InvitationRow = typeof invitations.$inferSelect;

/** An Invitation's status, derived from what happened to it and the time now. */
export function invitationStatus(
  row: Pick<InvitationRow, 'acceptedAt' | 'cancelledAt' | 'expiresAt'>,
  now: Date,
): InvitationStatus {
  if (row.acceptedAt) return 'accepted';
  if (row.cancelledAt) return 'cancelled';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'pending';
}

/** Refuses an Invitation that can no longer be accepted, saying why. */
export function requirePending(
  row: InvitationRow | undefined,
  now: Date,
): InvitationRow {
  if (!row) throw new Rejected('invitation-not-found');
  const status = invitationStatus(row, now);
  if (status === 'accepted') throw new Rejected('invitation-used');
  if (status === 'cancelled') throw new Rejected('invitation-cancelled');
  if (status === 'expired') throw new Rejected('invitation-expired');
  return row;
}
