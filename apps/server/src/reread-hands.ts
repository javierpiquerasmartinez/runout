import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './database/schema.js';
import { rereadHands } from './hands/reread-backfill.js';

// Reads every stored Hand again from its Hand History, once a parser fix
// has to reach the Hands already imported, against the database at
// DATABASE_URL. See the README.
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
  const { read, rewritten, unread } = await rereadHands(db);
  console.log(
    `Read ${read} Hands again: ${rewritten} rewritten, ${unread} no longer read as the same Hand and left as they were.`,
  );
} finally {
  await db.$client.end();
}
