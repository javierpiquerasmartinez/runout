import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { identities, invitations } from '../database/schema.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { EmailWriter } from '../mail/emails.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { Rejected } from '../rejection/rejection.js';
import type { Identity } from './identity.service.js';
import {
  INVITATION_LIFETIME_MS,
  invitationStatus,
  requirePending,
  type InvitationStatus,
} from './invitations.js';
import { hashToken, newToken, normalEmail } from './tokens.js';

/** Someone as the Administrator panel names them. */
export interface PersonView {
  id: string;
  displayName: string | null;
  email: string | null;
}

/** An Invitation as the Administrator panel lists it. */
export interface InvitationView {
  id: string;
  email: string;
  language: 'es' | 'en';
  status: InvitationStatus;
  sentBy: PersonView;
  sentAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  /** The Account it became, once accepted. */
  account: PersonView | null;
  cancelledAt: string | null;
}

/** An Invitation just sent: whether its email went, so a failure can be resent. */
export interface InvitationSent {
  invitation: InvitationView;
  emailSent: boolean;
}

/**
 * Invitations as Administrators send them (ADR 0008): one email address, a
 * single-use link that lasts 7 days, at most one live link per person.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly emails: EmailWriter,
  ) {}

  /** Every Invitation, the most recently sent first. */
  async list(): Promise<InvitationView[]> {
    const sender = alias(identities, 'sender');
    const account = alias(identities, 'account');
    const rows = await this.db
      .select({ invitation: invitations, sender, account })
      .from(invitations)
      .innerJoin(sender, eq(sender.id, invitations.sentBy))
      .leftJoin(account, eq(account.id, invitations.accountId))
      .orderBy(desc(invitations.sentAt));
    const now = this.clock.now();
    return rows.map((row) =>
      toView(row.invitation, row.sender, row.account, now),
    );
  }

  /**
   * Invites `email` in `language`. Refused with `account-exists` (saying
   * whether that Account is suspended) or `invitation-pending`; an expired
   * one for the same email is sent again instead.
   */
  async invite(
    administrator: Identity,
    rawEmail: unknown,
    rawLanguage: unknown = 'es',
  ): Promise<InvitationSent> {
    const email = normalEmail(rawEmail);
    if (!email) throw new Rejected('invalid-email');
    if (rawLanguage !== 'es' && rawLanguage !== 'en') {
      throw new Rejected('invalid-language');
    }
    const language = rawLanguage;
    const [existing] = await this.db
      .select({ id: identities.id, suspendedAt: identities.suspendedAt })
      .from(identities)
      .where(eq(identities.email, email));
    if (existing) {
      throw new Rejected('account-exists', {
        accountId: existing.id,
        suspended: existing.suspendedAt !== null,
      });
    }
    const [open] = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.cancelledAt),
        ),
      );
    if (open) {
      if (invitationStatus(open, this.clock.now()) === 'pending') {
        throw new Rejected('invitation-pending', { invitationId: open.id });
      }
      await this.db
        .update(invitations)
        .set({ language })
        .where(eq(invitations.id, open.id));
      return this.resend(administrator, open.id);
    }
    const token = newToken();
    const now = this.clock.now();
    let id: string;
    try {
      [{ id }] = await this.db
        .insert(invitations)
        .values({
          email,
          language,
          tokenHash: hashToken(token),
          sentBy: administrator.id,
          sentAt: now,
          expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
        })
        .returning({ id: invitations.id });
    } catch (error) {
      // Another Administrator invited the same email a moment before.
      if (isUniqueViolation(error)) throw new Rejected('invitation-pending');
      throw error;
    }
    return this.send(id, token);
  }

  /**
   * Sends a pending or expired Invitation again: a new link with a fresh 7
   * days, and the old link stops working.
   */
  async resend(administrator: Identity, id: unknown): Promise<InvitationSent> {
    const row = await this.find(id);
    const status = invitationStatus(row, this.clock.now());
    if (status === 'accepted') throw new Rejected('invitation-used');
    if (status === 'cancelled') throw new Rejected('invitation-cancelled');
    const token = newToken();
    const now = this.clock.now();
    await this.db
      .update(invitations)
      .set({
        tokenHash: hashToken(token),
        sentBy: administrator.id,
        sentAt: now,
        expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
      })
      .where(eq(invitations.id, row.id));
    return this.send(row.id, token);
  }

  /** Cancels a pending Invitation: its link stops working. */
  async cancel(id: unknown): Promise<InvitationView> {
    const row = requirePending(await this.find(id), this.clock.now());
    await this.db
      .update(invitations)
      .set({ cancelledAt: this.clock.now() })
      .where(eq(invitations.id, row.id));
    return this.view(row.id);
  }

  /**
   * What a link's page shows before anything is submitted: the invited email
   * and the Invitation's status. `invitation-not-found` for an unknown link.
   */
  async byToken(
    token: string,
  ): Promise<{ email: string; status: InvitationStatus }> {
    const [row] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashToken(token)));
    if (!row) throw new Rejected('invitation-not-found');
    return {
      email: row.email,
      status: invitationStatus(row, this.clock.now()),
    };
  }

  /** Emails the link, once the Invitation it is for has been written. */
  private async send(id: string, token: string): Promise<InvitationSent> {
    const sender = alias(identities, 'sender');
    const [row] = await this.db
      .select({ invitation: invitations, sender })
      .from(invitations)
      .innerJoin(sender, eq(sender.id, invitations.sentBy))
      .where(eq(invitations.id, id));
    let emailSent = true;
    try {
      await this.mailer.send(
        this.emails.invitation({
          to: row.invitation.email,
          language: row.invitation.language,
          from: row.sender.displayName ?? row.sender.email ?? 'Runout',
          token,
          expiresAt: row.invitation.expiresAt,
        }),
      );
    } catch (error) {
      // It stays pending, to be resent.
      this.logger.error(error);
      emailSent = false;
    }
    return { invitation: await this.view(id), emailSent };
  }

  private async find(id: unknown): Promise<typeof invitations.$inferSelect> {
    const [row] =
      typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)
        ? await this.db.select().from(invitations).where(eq(invitations.id, id))
        : [];
    if (!row) throw new Rejected('invitation-not-found');
    return row;
  }

  private async view(id: string): Promise<InvitationView> {
    const found = (await this.list()).find((each) => each.id === id);
    if (!found) throw new Rejected('invitation-not-found');
    return found;
  }
}

function person(row: typeof identities.$inferSelect): PersonView {
  return { id: row.id, displayName: row.displayName, email: row.email };
}

function toView(
  row: typeof invitations.$inferSelect,
  sender: typeof identities.$inferSelect,
  account: typeof identities.$inferSelect | null,
  now: Date,
): InvitationView {
  return {
    id: row.id,
    email: row.email,
    language: row.language,
    status: invitationStatus(row, now),
    sentBy: person(sender),
    sentAt: row.sentAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    account: account ? person(account) : null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}
