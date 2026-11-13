import { Injectable } from '@nestjs/common';

/**
 * Adds the Hands of every waiting Bulk Import to its Library, batch by batch.
 * Its one operation runs until nothing is left, and queries nothing once
 * there is nothing to do, so that the database can suspend.
 */
@Injectable()
export class ImportEngine {
  /** Works until no Bulk Import is left to advance. Nothing yet. */
  async workUntilNothingLeft(): Promise<void> {}
}
