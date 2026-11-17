import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './database/schema.js';
import { rederiveFacts } from './hands/facts-rederive.js';
import { FACTS_VERSION } from './hands/replay/hero-facts.js';

// Brings every Hand's facts up to the current rules version, after a deploy
// that raised it, against the database at DATABASE_URL. See the README.
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
    `Worked out the facts of ${await rederiveFacts(db)} Hands by rules version ${FACTS_VERSION}.`,
  );
} finally {
  await db.$client.end();
}
