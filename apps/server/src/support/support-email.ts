import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { identities, preferences } from '../database/schema.js';
import { administratorLanguages } from '../identity/administrator-languages.js';
import {
  ADMINISTRATOR_EMAILS,
  type AdministratorEmails,
} from '../identity/administrators.js';
import { DEFAULT_PREFERENCES } from '../identity/identity.service.js';
import { EmailWriter, type SupportTicketMention } from '../mail/emails.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { messageOf } from '../import-service/message-of.js';

/**
 * Support's emails, so that each side hears about it outside Runout: to
 * every Administrator when an Account opens a Support Ticket or writes in
 * one, and to the Account when an Administrator writes in or closes one of
 * its Tickets. Never to a Suspended Account; there is no opting out. A
 * failed send is logged, never thrown: the Support Message stays written.
 */
@Injectable()
export class SupportEmail {
  private readonly logger = new Logger(SupportEmail.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ADMINISTRATOR_EMAILS)
    private readonly administrators: AdministratorEmails,
    private readonly emails: EmailWriter,
  ) {}

  /** Tells every Administrator that `accountId` opened a Ticket or wrote in one. */
  async toAdministrators(
    event: 'opened' | 'written',
    accountId: string,
    ticket: SupportTicketMention,
  ): Promise<void> {
    try {
      const to = await administratorLanguages(this.db, this.administrators);
      if (to.length === 0) return;
      const [writer] = await this.db
        .select({
          email: identities.email,
          displayName: identities.displayName,
        })
        .from(identities)
        .where(eq(identities.id, accountId));
      const account = writer?.email ?? writer?.displayName ?? '—';
      for (const { email, language } of to) {
        await this.mailer
          .send(
            this.emails.supportToAdministrator({
              to: email,
              language,
              event,
              account,
              ticket,
            }),
          )
          .catch((error: unknown) =>
            this.logger.error(
              `Could not email ${email} of Support Ticket ${ticket.id}: ${messageOf(error)}`,
            ),
          );
      }
    } catch (error) {
      this.logger.error(
        `Could not email the Administrators of Support Ticket ${ticket.id}: ${messageOf(error)}`,
      );
    }
  }

  /** Tells the Account `accountId` that an Administrator wrote in or closed its Ticket, unless it is Suspended. */
  async toAccount(
    event: 'written' | 'closed',
    accountId: string,
    ticket: SupportTicketMention,
  ): Promise<void> {
    try {
      const [account] = await this.db
        .select({
          email: identities.email,
          suspendedAt: identities.suspendedAt,
          language: preferences.language,
        })
        .from(identities)
        .leftJoin(preferences, eq(preferences.identityId, identities.id))
        .where(eq(identities.id, accountId));
      if (!account?.email || account.suspendedAt) return;
      await this.mailer.send(
        this.emails.supportToAccount({
          to: account.email,
          language: account.language ?? DEFAULT_PREFERENCES.language,
          event,
          ticket,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Could not email the Account of Support Ticket ${ticket.id}: ${messageOf(error)}`,
      );
    }
  }
}
