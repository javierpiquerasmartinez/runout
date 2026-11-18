import type { Database } from '../database/database.js';
import { rederiveFacts } from '../hands/facts-rederive.js';
import { FACTS_VERSION } from '../hands/replay/hero-facts.js';

/**
 * Work on stored data that a deploy may leave behind, run after the
 * migrations by `db:backfill` (Render's pre-deploy command). Each one finds
 * for itself what is behind, works in batches it commits as it goes, and
 * does nothing when nothing is, so running every one on every deploy is
 * safe and costs almost nothing when there is no work.
 */
export interface Backfill {
  name: string;
  /** Brings the data up to date; says what it did, in one line. */
  run(db: Database): Promise<string>;
}

/** Every backfill, in the order they run. */
export const BACKFILLS: readonly Backfill[] = [
  {
    // Rows missing, or worked out by rules older than FACTS_VERSION.
    name: 'hand-facts',
    run: async (db) =>
      `${await rederiveFacts(db)} Hands brought up to rules version ${FACTS_VERSION}`,
  },
];

/** Runs each backfill in turn, reporting each one as it finishes. */
export async function runBackfills(
  db: Database,
  report: (line: string) => void,
  backfills: readonly Backfill[] = BACKFILLS,
): Promise<void> {
  for (const backfill of backfills) {
    const started = Date.now();
    const done = await backfill.run(db);
    report(`${backfill.name}: ${done} (${Date.now() - started} ms)`);
  }
}
