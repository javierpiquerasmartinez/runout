import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './database/schema.js';
import { backfillFinalPots } from './hands/final-pot-backfill.js';

// Fills in the final pot of the Hands stored before migration 0018, once,
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
  console.log(
    `Filled in the final pot of ${await backfillFinalPots(db)} Hands.`,
  );
} finally {
  await db.$client.end();
}
