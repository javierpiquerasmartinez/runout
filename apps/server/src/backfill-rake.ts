import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './database/schema.js';
import { backfillRake } from './hands/rake-backfill.js';

// Fills in the Rake and Rake Generated of the Hands stored before migration
// 0025, once, against the database at DATABASE_URL. See the README.
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
  console.log(
    `Filled in the Rake and Rake Generated of ${await backfillRake(db)} Hands.`,
  );
} finally {
  await db.$client.end();
}
