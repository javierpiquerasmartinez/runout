import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { bulkImports, identities, preferences } from '../database/schema.js';
import { DEFAULT_PREFERENCES } from '../identity/identity.service.js';
import { EmailWriter } from '../mail/emails.js';
import { MAILER, type Mailer } from '../mail/mailer.js';

/**
 * Tells an Importer that their Bulk Import ended, completed or failed. Not a
 * Suspended Account, whose import still finishes; never a cancelled import,
 * which its Importer ended themselves.
 */
@Injectable()
export class ImporterEmail {
  private readonly logger = new Logger(ImporterEmail.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly emails: EmailWriter,
  ) {}

  /** Sends it for import `id`, as it now stands. A failed send is logged, never thrown. */
  async send(id: string): Promise<void> {
    try {
      const [ended] = await this.db
        .select({
          bulkImport: bulkImports,
          email: identities.email,
          suspendedAt: identities.suspendedAt,
          language: preferences.language,
        })
        .from(bulkImports)
        .innerJoin(identities, eq(identities.id, bulkImports.identityId))
        .leftJoin(preferences, eq(preferences.identityId, identities.id))
        .where(eq(bulkImports.id, id));
      if (!ended?.email || ended.suspendedAt) return;
      const { bulkImport } = ended;
      if (bulkImport.status !== 'completed' && bulkImport.status !== 'failed')
        return;
      await this.mailer.send(
        this.emails.bulkImportEnded({
          to: ended.email,
          language: ended.language ?? DEFAULT_PREFERENCES.language,
          bulkImport: {
            status: bulkImport.status,
            reason: bulkImport.reason,
            fileNames: bulkImport.files.map((file) => file.name),
            total: bulkImport.total,
            processed: bulkImport.processed,
            imported: bulkImport.imported,
            duplicates: bulkImport.duplicates,
            notImported: bulkImport.notImported,
          },
        }),
      );
    } catch (error) {
      this.logger.error(
        `Could not email the Importer of Bulk Import ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
