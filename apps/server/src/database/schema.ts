// Drizzle schema. Tables are added here as features need them; run
// `pnpm db:generate` after changing this file to write a migration.
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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

/**
 * The names a person plays under on Poker Sites. A Hand's Hero is matched
 * against them, ignoring case, to find its Author.
 */
export const screenNames = pgTable(
  'screen_names',
  {
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id),
    screenName: text('screen_name').notNull(),
    /** Where it was listed among the person's Screen Names, from 0. */
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.identityId, table.screenName] })],
);

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
export const hands = pgTable(
  'hands',
  {
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
  },
  (table) => [
    // The same Hand from the same Hero is only ever imported once (ADR 0002).
    uniqueIndex('hands_site_hand_hero_idx').on(
      table.site,
      table.siteHandId,
      table.heroScreenName,
    ),
  ],
);

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
    /** Set when the Master removes it; null while it's active. Undoable for 10 s. */
    removedAt: timestamp('removed_at', { withTimezone: true }),
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
  /** Seats that belong to no Participant are shown by Position. Off whenever a Hand is loaded. */
  hideOpponentNames: boolean('hide_opponent_names').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

/**
 * Hands read from one uploaded file or paste, waiting for their Importer to
 * confirm them into the Room's Queue. Deleted once confirmed; unconfirmed
 * ones are forgotten after a while.
 */
export const importPreviews = pgTable(
  'import_previews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    importerId: uuid('importer_id')
      .notNull()
      .references(() => identities.id),
    hands: jsonb('hands').$type<Hand[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('import_previews_created_at_idx').on(table.createdAt)],
);

/**
 * A written conclusion attached to a Hand. It outlives the Room it was
 * written in, and only the Master of a Room the Hand is in may edit or
 * delete it; deletion is soft, so it can be undone for 10 s.
 */
export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The order they were written in, which two Notes of the same instant still have. */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    handId: uuid('hand_id')
      .notNull()
      .references(() => hands.id),
    writerId: uuid('writer_id')
      .notNull()
      .references(() => identities.id),
    body: text('body').notNull(),
    writtenAt: timestamp('written_at', { withTimezone: true }).notNull(),
    /** Set the first time a Master rewrites it; null while it stands as written. */
    editedAt: timestamp('edited_at', { withTimezone: true }),
    /** Set when a Master deletes it; null while it is there. Undoable for 10 s. */
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (table) => [index('notes_hand_id_idx').on(table.handId)],
);

/** A private flag one person puts on a Hand to find it again. Only they see it. */
export const marks = pgTable(
  'marks',
  {
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id),
    handId: uuid('hand_id')
      .notNull()
      .references(() => hands.id),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identityId, table.handId] })],
);
