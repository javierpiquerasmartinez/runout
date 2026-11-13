import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import {
  bulkImports,
  identities,
  preferences,
  type BulkImportStatus,
} from '../database/schema.js';
import {
  ADMINISTRATOR_EMAILS,
  type AdministratorEmails,
} from '../identity/administrators.js';
import { DEFAULT_PREFERENCES } from '../identity/identity.service.js';
import { ImportServiceWaker } from '../import-service/import-service-waker.js';
import { EmailWriter } from '../mail/emails.js';
import { MAILER, type Mailer } from '../mail/mailer.js';

/** How long an import may go without advance before it is stalled. */
export const STALLED_AFTER_MS = 30 * 60_000;

/** The imports the import service is to advance. Not a paused one, which waits on purpose. */
const ADVANCING: BulkImportStatus[] = ['waiting', 'counting', 'running'];

/**
 * A stopped import service cannot say so itself. At each of the API's hourly
 * checks, this wakes it when an import waits or has not advanced for 30
 * minutes, and flags each without advance stalled, telling the
 * Administrators once. The import service's next advance clears the flag.
 */
@Injectable()
export class StallCheck {
  private readonly logger = new Logger(StallCheck.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ADMINISTRATOR_EMAILS)
    private readonly administrators: AdministratorEmails,
    private readonly emails: EmailWriter,
    private readonly waker: ImportServiceWaker,
  ) {}

  async run(): Promise<void> {
    const cutoff = new Date(this.clock.now().getTime() - STALLED_AFTER_MS);
    // Since it last advanced, or began waiting if that was later.
    const withoutAdvance = and(
      inArray(bulkImports.status, ADVANCING),
      lt(
        sql`greatest(${bulkImports.lastAdvancedAt}, ${bulkImports.waitingSince})`,
        cutoff,
      ),
    );
    const [due] = await this.db
      .select({ id: bulkImports.id })
      .from(bulkImports)
      .where(or(eq(bulkImports.status, 'waiting'), withoutAdvance))
      .limit(1);
    if (!due) return;
    await this.waker.wake();
    // Only those not flagged yet: each is told once per stall.
    const stalled = await this.db
      .update(bulkImports)
      .set({ stalled: true })
      .where(and(withoutAdvance, eq(bulkImports.stalled, false)))
      .returning();
    for (const bulkImport of stalled) await this.tell(bulkImport);
  }

  /** Emails every Administrator about this import. A failed send is logged, never thrown. */
  private async tell(bulkImport: typeof bulkImports.$inferSelect) {
    try {
      const [importer] = await this.db
        .select({ email: identities.email })
        .from(identities)
        .where(eq(identities.id, bulkImport.identityId));
      const administrators = this.administrators.all();
      if (administrators.length === 0) return;
      const languages = new Map(
        (
          await this.db
            .select({
              email: sql<string>`lower(${identities.email})`,
              language: preferences.language,
            })
            .from(identities)
            .innerJoin(preferences, eq(preferences.identityId, identities.id))
            .where(inArray(sql`lower(${identities.email})`, administrators))
        ).map(({ email, language }) => [email, language]),
      );
      for (const to of administrators) {
        await this.mailer.send(
          this.emails.bulkImportStalled({
            to,
            language: languages.get(to) ?? DEFAULT_PREFERENCES.language,
            bulkImport: {
              account: importer?.email ?? bulkImport.identityId,
              fileNames: bulkImport.files.map((file) => file.name),
              total: bulkImport.total,
              processed: bulkImport.processed,
            },
          }),
        );
      }
    } catch (error) {
      this.logger.error(
        `Could not tell the Administrators that Bulk Import ${bulkImport.id} stalled: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
