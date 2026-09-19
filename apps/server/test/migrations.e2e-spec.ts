import { readMigrationFiles } from 'drizzle-orm/migrator';
import pg from 'pg';
import { inject } from 'vitest';
import { MIGRATIONS_FOLDER } from './support/migrations.js';

describe('Test database (e2e)', () => {
  it('has every migration applied', async () => {
    const client = new pg.Client(inject('databaseUrl'));
    await client.connect();
    try {
      const { rows } = await client.query<{ hash: string }>(
        'select hash from drizzle.__drizzle_migrations order by created_at',
      );
      const expected = readMigrationFiles({
        migrationsFolder: MIGRATIONS_FOLDER,
      });

      expect(rows.map((row) => row.hash)).toEqual(expected.map((m) => m.hash));
    } finally {
      await client.end();
    }
  });
});
