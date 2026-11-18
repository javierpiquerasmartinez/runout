import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { runBackfills } from './backfills/backfills.js';
import * as schema from './database/schema.js';

// Runs every backfill against the database at DATABASE_URL, after the
// migrations: Render's pre-deploy command, or by hand. See the README.
try {
  process.loadEnvFile();
} catch (error) {
  // A missing .env is fine; the environment may be set directly.
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set.');
const db = drizzle({ client: new pg.Pool({ connectionString: url }), schema });
try {
  await runBackfills(db, (line) => console.log(line));
} finally {
  await db.$client.end();
}
