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

describe('Migrating a database with Hands already imported (e2e)', () => {
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

  // Each test migrates a database of its own, from a point of its choosing.
  beforeEach(async () => {
    name = `migrations_${randomUUID().replaceAll('-', '')}`;
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
      // As much of a Hand as later migrations read from it.
      const stored = {
        seats: [{ seat: 5, screenName: 'iMapleAA' }],
        hero: { screenName: 'iMapleAA', cards: ['Js', '8s'] },
      };
      const insertHand = async (importedAt: string) =>
        (
          await client.query<{ id: string }>(
            `insert into hands (site, site_hand_id, hero_screen_name, author_id, importer_id,
               source_format, played_at, small_blind, big_blind, currency, content, imported_at)
             values ('pokerstars', '262120750636', 'iMapleAA', $1, $1, 'pokerstars', now(),
               5, 10, 'EUR', $3, $2) returning id`,
            [identity.id, importedAt, JSON.stringify(stored)],
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

  it('keys each stored Hand on its Hero’s seat, read from the Hand itself', async () => {
    await migrateUpTo('0009_preferences');
    const client = new pg.Client(databaseUrl);
    await client.connect();
    try {
      const {
        rows: [identity],
      } = await client.query<{ id: string }>(
        `insert into identities (token_hash, created_at) values ('seat', now()) returning id`,
      );
      const insertHand = (hero: string) =>
        client.query(
          `insert into hands (site, site_hand_id, hero_screen_name, author_id, importer_id,
             source_format, played_at, small_blind, big_blind, currency, content, imported_at)
           values ('pokerstars', '262120799999', $2, $1, $1, 'pokerstars', now(),
             5, 10, 'EUR', $3, now())`,
          [
            identity.id,
            hero,
            JSON.stringify({
              seats: [
                { seat: 2, screenName: 'Alder239' },
                { seat: 5, screenName: hero },
              ],
              hero: { screenName: hero, cards: ['Js', '8s'] },
            }),
          ],
        );
      await insertHand('iMapleAA');
      // The same Hand imported again with its Hero renamed: kept as it was.
      await insertHand('iPholdeAA');

      await migrateWith(MIGRATIONS_FOLDER);

      const { rows } = await client.query<{
        hero_screen_name: string;
        hero_seat: number;
      }>(
        `select hero_screen_name, hero_seat from hands
         where site_hand_id = '262120799999' order by hero_screen_name`,
      );
      expect(rows).toEqual([
        { hero_screen_name: 'iMapleAA', hero_seat: 5 },
        { hero_screen_name: 'iPholdeAA', hero_seat: 5 },
      ]);
    } finally {
      await client.end();
    }
  });
});
