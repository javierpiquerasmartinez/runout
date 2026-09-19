// Drizzle schema. Tables are added here as features need them; run
// `pnpm db:generate` after changing this file to write a migration.
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Hand } from '../hands/hand.js';

/** An anonymous identity bound to one browser by an opaque token (ADR 0003). */
export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** SHA-256 of the bearer token; the token itself is never stored. */
  tokenHash: text('token_hash').notNull().unique(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 8 characters, stored without the dash and upper-case. Never reused. */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { enum: ['open', 'closed'] })
    .notNull()
    .default('open'),
  masterId: uuid('master_id')
    .notNull()
    .references(() => identities.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

export const roomMemberships = pgTable(
  'room_memberships',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
    kicked: boolean('kicked').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.identityId] })],
);

/** One Hand from one Hero's seat (ADR 0002), stored as the import module read it. */
export const hands = pgTable('hands', {
  id: uuid('id').primaryKey().defaultRandom(),
  site: text('site').notNull(),
  siteHandId: text('site_hand_id').notNull(),
  heroScreenName: text('hero_screen_name').notNull(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => identities.id),
  /** Who brought the Hand in. Audit only; carries no meaning for attribution. */
  importerId: uuid('importer_id')
    .notNull()
    .references(() => identities.id),
  sourceFormat: text('source_format').notNull(),
  playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
  /** The Stake, as Amounts in hundredths of `currency`. */
  smallBlind: integer('small_blind').notNull(),
  bigBlind: integer('big_blind').notNull(),
  currency: text('currency').notNull(),
  content: jsonb('content').$type<Hand>().notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull(),
});

/** A Hand placed in a Room's Queue. Removing it never deletes the Hand (ADR 0002). */
export const queueEntries = pgTable(
  'queue_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    handId: uuid('hand_id')
      .notNull()
      .references(() => hands.id),
    /** 1 for the first Hand; new entries go after the last one. */
    position: integer('position').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('queue_entries_room_id_idx').on(table.roomId)],
);

/**
 * A Room's Playback: the loaded Hand and the Action it is on. One row per
 * Room, written the first time its Master loads a Hand.
 */
export const playbacks = pgTable('playbacks', {
  roomId: uuid('room_id')
    .primaryKey()
    .references(() => rooms.id),
  handId: uuid('hand_id')
    .notNull()
    .references(() => hands.id),
  /** 0 is the Initial State; n is the table after the Hand's Action n. */
  actionIndex: integer('action_index').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
