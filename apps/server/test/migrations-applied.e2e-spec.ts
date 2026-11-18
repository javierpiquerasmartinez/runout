import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { inject } from 'vitest';
import {
  migrationsApplied,
  newestMigration,
} from '../src/database/migrations-applied.js';
import { MIGRATIONS_FOLDER } from './support/migrations.js';

describe('Whether the import service may start (e2e)', () => {
  const admin = new pg.Client(inject('databaseUrl'));
  let name: string;
  let databaseUrl: string;
  let folder: string;

  beforeAll(async () => {
    await admin.connect();
  });

  afterAll(async () => {
    await admin.end();
  });

  beforeEach(async () => {
    name = `applied_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`create database ${name}`);
    const url = new URL(inject('databaseUrl'));
    url.pathname = `/${name}`;
    databaseUrl = url.toString();
    folder = await mkdtemp(join(tmpdir(), 'runout-migrations-'));
  });

  afterEach(async () => {
    await admin.query(`drop database if exists ${name} with (force)`);
    await rm(folder, { recursive: true, force: true });
  });

  async function migrateWith(migrationsFolder: string) {
    const db = drizzle(databaseUrl);
    try {
      await migrate(db, { migrationsFolder });
    } finally {
      await db.$client.end();
    }
  }

  /** Every migration but the newest, as before the API's pre-deploy. */
  async function migrateAllButNewest() {
    await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8'));
    journal.entries = journal.entries.slice(0, -1);
    await writeFile(journalPath, JSON.stringify(journal));
    await migrateWith(folder);
  }

  it('waits on a database no migration has run on', async () => {
    expect(await migrationsApplied(databaseUrl, newestMigration())).toBe(false);
  });

  it('waits while the newest migration of the build is not applied', async () => {
    await migrateAllButNewest();

    expect(await migrationsApplied(databaseUrl, newestMigration())).toBe(false);
  });

  it('starts once every migration of the build is applied', async () => {
    await migrateAllButNewest();
    await migrateWith(MIGRATIONS_FOLDER);

    expect(await migrationsApplied(databaseUrl, newestMigration())).toBe(true);
  });

  it('starts on a database ahead of the build, as an older one restarting finds it', async () => {
    await migrateWith(MIGRATIONS_FOLDER);
    await migrateAllButNewest();

    expect(await migrationsApplied(databaseUrl, newestMigration(folder))).toBe(
      true,
    );
  });
});
