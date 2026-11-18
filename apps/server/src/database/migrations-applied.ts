import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import pg from 'pg';

/**
 * The migrations this build was made with: `apps/server/drizzle`, the same
 * folder from `src/database` and, built, from `dist/database`.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
);

/**
 * When the newest migration in `folder` was generated, as Drizzle stamps it
 * on the row it writes in `drizzle.__drizzle_migrations` on applying it.
 */
export function newestMigration(folder: string = MIGRATIONS_FOLDER): number {
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  return Math.max(0, ...migrations.map((m) => m.folderMillis));
}

/**
 * Whether the database at `url` has every migration up to `newest` applied,
 * by the rule Drizzle's migrator applies them: one is pending while it is
 * newer than the newest one the database records. A database that records
 * none, or newer ones than this build knows, is told apart only by that.
 */
export async function migrationsApplied(
  url: string,
  newest: number,
): Promise<boolean> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ created_at: string | null }>(
      'select max(created_at) as created_at from drizzle.__drizzle_migrations',
    );
    return Number(rows[0]?.created_at ?? 0) >= newest;
  } catch (error) {
    // No migration has ever run here: neither schema nor table exists yet.
    if ((error as { code?: string }).code === '42P01') return false;
    throw error;
  } finally {
    await client.end();
  }
}

export interface WaitForMigrations {
  /** Whether the migrations are applied yet. */
  applied: () => Promise<boolean>;
  report: (line: string) => void;
  /** How long between checks. */
  everyMs?: number;
  /** How long to wait in all before giving up. */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Waits until `applied` says the migrations are in, checking every `everyMs`,
 * and throws once `timeoutMs` has gone by without them. The import service
 * does this before it starts: on Render the API alone migrates, in its
 * pre-deploy, and both services deploy from the same commit at once, so the
 * new import code would otherwise run against the old schema. See the
 * README's "Deploying".
 */
export async function waitForMigrations({
  applied,
  report,
  everyMs = 5_000,
  timeoutMs = 20 * 60_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}: WaitForMigrations): Promise<void> {
  if (await applied()) return;
  const started = now();
  report(
    'Waiting for the database to have every migration of this build applied (the API applies them before it deploys; locally, run db:migrate).',
  );
  for (;;) {
    if (now() - started >= timeoutMs) {
      throw new Error(
        `The database still lacks migrations of this build after ${Math.round(timeoutMs / 60_000)} minutes; not starting.`,
      );
    }
    await sleep(everyMs);
    if (await applied()) {
      report(`Migrations applied after ${now() - started} ms; starting.`);
      return;
    }
  }
}
