import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { inject } from 'vitest';
import { MIGRATIONS_FOLDER } from './migrations.js';

/**
 * A migrated database nobody else writes to, for a test that reads totals
 * over all of Runout: the shared one moves under it as other files run.
 */
export async function freshDatabase(): Promise<{
  url: string;
  drop(): Promise<void>;
}> {
  const name = `fresh_${randomUUID().replaceAll('-', '')}`;
  const shared = inject('databaseUrl');
  const admin = new pg.Client(shared);
  await admin.connect();
  await admin.query(`create database ${name}`);
  const url = new URL(shared);
  url.pathname = `/${name}`;
  const db = drizzle(url.toString());
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.$client.end();
  }
  return {
    url: url.toString(),
    drop: async () => {
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
