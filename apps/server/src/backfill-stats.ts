import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './database/schema.js';
import { backfillStats } from './hands/stats-backfill.js';

// Works out the Stat rows of the Hands stored before migration 0027, once,
// against the database at DATABASE_URL. See the README.
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
  console.log(`Worked out the Stats of ${await backfillStats(db)} Hands.`);
} finally {
  await db.$client.end();
}
