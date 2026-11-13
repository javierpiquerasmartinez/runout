import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, lt, or, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { advancing } from '../database/bulk-import-status.js';
import { bulkImports, identities } from '../database/schema.js';
import {
  ADMINISTRATOR_EMAILS,
  type AdministratorEmails,
} from '../identity/administrators.js';
import { administratorLanguages } from '../identity/administrator-languages.js';
import { ImportServiceWaker } from '../import-service/import-service-waker.js';
import { EmailWriter } from '../mail/emails.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { Storage } from '../storage/storage.js';
import { messageOf } from '../import-service/message-of.js';

/** How long an import may go without advance before it is stalled. */
export const STALLED_AFTER_MS = 30 * 60_000;

/**
 * A stopped import service cannot say so itself. At each of the API's hourly
 * checks, this wakes it when an import waits or has not advanced for 30
 * minutes, and flags each without advance stalled, telling the
 * Administrators once. The import service's next advance clears the flag.
 * It also resumes the imports the storage guard paused, once the database
 * is below its threshold again.
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
    private readonly storage: Storage,
  ) {}

  async run(): Promise<void> {
    const resumed = await this.resumePaused();
    const cutoff = new Date(this.clock.now().getTime() - STALLED_AFTER_MS);
    // Since it last advanced, or began waiting if that was later.
    const withoutAdvance = and(
      advancing,
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
    if (!due && !resumed) return;
    await this.waker.wake();
    // Only those not flagged yet: each is told once per stall.
    const stalled = await this.db
      .update(bulkImports)
      .set({ stalled: true })
      .where(and(withoutAdvance, eq(bulkImports.stalled, false)))
      .returning();
    for (const bulkImport of stalled) await this.tell(bulkImport);
  }

  /**
   * The storage guard paused imports at the threshold. Below it again, as
   * after space is freed or the threshold raised, they go on where they
   * were: counted ones from their cursor, the others counted first. Waiting
   * from now, so none is taken as stalled. True when any resumed.
   */
  private async resumePaused(): Promise<boolean> {
    const [paused] = await this.db
      .select({ id: bulkImports.id })
      .from(bulkImports)
      .where(eq(bulkImports.status, 'paused'))
      .limit(1);
    if (!paused || (await this.storage.reached())) return false;
    const resumed = await this.db
      .update(bulkImports)
      .set({
        status: sql`case when ${bulkImports.total} is null then 'waiting' else 'running' end`,
        waitingSince: this.clock.now(),
      })
      .where(eq(bulkImports.status, 'paused'))
      .returning({ id: bulkImports.id });
    return resumed.length > 0;
  }

  /** Emails every Administrator about this import. A failed send is logged, never thrown. */
  private async tell(bulkImport: typeof bulkImports.$inferSelect) {
    try {
      const [importer] = await this.db
        .select({ email: identities.email })
        .from(identities)
        .where(eq(identities.id, bulkImport.identityId));
      const administrators = await administratorLanguages(
        this.db,
        this.administrators,
      );
      for (const { email: to, language } of administrators) {
        await this.mailer.send(
          this.emails.bulkImportStalled({
            to,
            language,
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
        `Could not tell the Administrators that Bulk Import ${bulkImport.id} stalled: ${messageOf(error)}`,
      );
    }
  }
}
