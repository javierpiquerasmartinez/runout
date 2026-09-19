import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
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

describe('Migrating a database with Hands imported more than once (e2e)', () => {
  const name = `migrations_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client(inject('databaseUrl'));
  let databaseUrl: string;
  let folder: string;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`create database ${name}`);
    const url = new URL(inject('databaseUrl'));
    url.pathname = `/${name}`;
    databaseUrl = url.toString();
    folder = await mkdtemp(join(tmpdir(), 'runout-migrations-'));
  });

  afterAll(async () => {
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
    await rm(folder, { recursive: true, force: true });
  });

  /** Applies the migrations up to and including `lastTag`. */
  async function migrateUpTo(lastTag: string) {
    await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8'));
    const last = journal.entries.findIndex(
      (entry: { tag: string }) => entry.tag === lastTag,
    );
    journal.entries = journal.entries.slice(0, last + 1);
    await writeFile(journalPath, JSON.stringify(journal));
    await migrateWith(folder);
  }

  async function migrateWith(migrationsFolder: string) {
    const db = drizzle(databaseUrl);
    try {
      await migrate(db, { migrationsFolder });
    } finally {
      await db.$client.end();
    }
  }

  it('keeps the first import of each Hand and points the Queue and Playback at it', async () => {
    await migrateUpTo('0004_import_previews');
    const client = new pg.Client(databaseUrl);
    await client.connect();
    try {
      const {
        rows: [identity],
      } = await client.query<{ id: string }>(
        `insert into identities (token_hash, created_at) values ('hash', now()) returning id`,
      );
      const {
        rows: [room],
      } = await client.query<{ id: string }>(
        `insert into rooms (code, name, master_id, created_at)
         values ('ABCD2345', 'Martes', $1, now()) returning id`,
        [identity.id],
      );
      const insertHand = async (importedAt: string) =>
        (
          await client.query<{ id: string }>(
            `insert into hands (site, site_hand_id, hero_screen_name, author_id, importer_id,
               source_format, played_at, small_blind, big_blind, currency, content, imported_at)
             values ('pokerstars', '262120750636', 'iMapleAA', $1, $1, 'pokerstars', now(),
               5, 10, 'EUR', '{}', $2) returning id`,
            [identity.id, importedAt],
          )
        ).rows[0].id;
      const first = await insertHand('2026-09-18T10:00:00Z');
      const again = await insertHand('2026-09-18T11:00:00Z');
      for (const [handId, position] of [
        [first, 1],
        [again, 2],
      ] as const) {
        await client.query(
          `insert into queue_entries (room_id, hand_id, position, added_at)
           values ($1, $2, $3, now())`,
          [room.id, handId, position],
        );
      }
      await client.query(
        `insert into playbacks (room_id, hand_id, action_index, updated_at)
         values ($1, $2, 0, now())`,
        [room.id, again],
      );

      await migrateWith(MIGRATIONS_FOLDER);

      const hands = await client.query<{ id: string }>('select id from hands');
      const queue = await client.query<{ hand_id: string }>(
        'select hand_id from queue_entries order by position',
      );
      const playback = await client.query<{ hand_id: string }>(
        'select hand_id from playbacks',
      );
      expect(hands.rows.map((row) => row.id)).toEqual([first]);
      expect(queue.rows.map((row) => row.hand_id)).toEqual([first, first]);
      expect(playback.rows.map((row) => row.hand_id)).toEqual([first]);
    } finally {
      await client.end();
    }
  });
});
