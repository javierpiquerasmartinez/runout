import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { bulkImports, identities, preferences } from '../database/schema.js';
import {
  ADMINISTRATOR_EMAILS,
  type AdministratorEmails,
} from '../identity/administrators.js';
import { DEFAULT_PREFERENCES } from '../identity/identity.service.js';
import { EmailWriter, type Language } from '../mail/emails.js';
import { MAILER, type Mailer } from '../mail/mailer.js';

/**
 * Tells every Administrator that a Bulk Import failed: the Account, the
 * Hands imported and the technical reason, never a Hand's text. Each in
 * their Account's language, or the default one before they have an Account.
 */
@Injectable()
export class AdministratorsEmail {
  private readonly logger = new Logger(AdministratorsEmail.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ADMINISTRATOR_EMAILS)
    private readonly administrators: AdministratorEmails,
    private readonly emails: EmailWriter,
  ) {}

  /**
   * Tells every Administrator that Bulk Imports paused, the database having
   * reached its threshold. A failed send is logged, never thrown.
   */
  async storageReached(storage: {
    paused: number;
    used: number;
    threshold: number;
  }): Promise<void> {
    try {
      for (const { email, language } of await this.recipients()) {
        await this.mailer
          .send(this.emails.bulkImportsPaused({ to: email, language, storage }))
          .catch((error: unknown) =>
            this.logger.error(
              `Could not email ${email} that Bulk Imports paused: ${messageOf(error)}`,
            ),
          );
      }
    } catch (error) {
      this.logger.error(
        `Could not email the Administrators that Bulk Imports paused: ${messageOf(error)}`,
      );
    }
  }

  /** Every Administrator, with their Account's language or the default one. */
  private async recipients(): Promise<{ email: string; language: Language }[]> {
    const to = this.administrators.list();
    if (to.length === 0) return [];
    const languages = new Map(
      (
        await this.db
          .select({ email: identities.email, language: preferences.language })
          .from(identities)
          .innerJoin(preferences, eq(preferences.identityId, identities.id))
          .where(inArray(identities.email, to))
      ).map(({ email, language }) => [email, language]),
    );
    return to.map((email) => ({
      email,
      language: languages.get(email) ?? DEFAULT_PREFERENCES.language,
    }));
  }

  /** Sends it for failed import `id`, as it now stands. A failed send is logged, never thrown. */
  async importFailed(id: string): Promise<void> {
    const to = this.administrators.list();
    if (to.length === 0) return;
    try {
      const [failed] = await this.db
        .select({
          bulkImport: bulkImports,
          email: identities.email,
          displayName: identities.displayName,
        })
        .from(bulkImports)
        .innerJoin(identities, eq(identities.id, bulkImports.identityId))
        .where(eq(bulkImports.id, id));
      if (failed?.bulkImport.status !== 'failed') return;
      const { bulkImport } = failed;
      const languages = new Map(
        (
          await this.db
            .select({ email: identities.email, language: preferences.language })
            .from(identities)
            .innerJoin(preferences, eq(preferences.identityId, identities.id))
            .where(inArray(identities.email, to))
        ).map(({ email, language }) => [email, language]),
      );
      for (const email of to) {
        await this.mailer
          .send(
            this.emails.bulkImportFailed({
              to: email,
              language: languages.get(email) ?? DEFAULT_PREFERENCES.language,
              bulkImport: {
                account: failed.email ?? failed.displayName ?? '—',
                fileNames: bulkImport.files.map((file) => file.name),
                total: bulkImport.total,
                processed: bulkImport.processed,
                imported: bulkImport.imported,
                failureCode: bulkImport.failureCode ?? 'unknown',
              },
            }),
          )
          .catch((error: unknown) =>
            this.logger.error(
              `Could not email ${email} of failed Bulk Import ${id}: ${messageOf(error)}`,
            ),
          );
      }
    } catch (error) {
      this.logger.error(
        `Could not email the Administrators of failed Bulk Import ${id}: ${messageOf(error)}`,
      );
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
