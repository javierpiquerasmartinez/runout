// Drizzle schema. Tables are added here as features need them; run
// `pnpm db:generate` after changing this file to write a migration.
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
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
import { sql } from 'drizzle-orm';
import type { Hand } from '../hands/hand.js';

/**
 * A person as Runout knows them: an Account, signed in with Google and lasting
 * (ADR 0005), or an anonymous identity, bound to one Room and ended with it.
 * An ended one stays, without sessions, so Notes keep their writer's name.
 */
export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Google's id for the person; null for an anonymous identity. */
  googleSubject: text('google_subject').unique(),
  /** The Account's Google email, for display only. */
  email: text('email'),
  displayName: text('display_name'),
  /** The one Room an anonymous identity exists for; null for an Account. */
  roomId: uuid('room_id').references((): AnyPgColumn => rooms.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

/**
 * A browser holding a bearer token for an identity. An Account has one per
 * device it signed in on; signing out ends that one.
 */
export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the bearer token; the token itself is never stored. */
    tokenHash: text('token_hash').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_identity_id_idx').on(table.identityId)],
);

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

/**
 * How one person reads the table: personal, never shared with the Room. An
 * identity without a row reads it the default way.
 */
export const preferences = pgTable('preferences', {
  identityId: uuid('identity_id')
    .primaryKey()
    .references(() => identities.id),
  deckStyle: text('deck_style', { enum: ['classic', 'full-suit'] }).notNull(),
  /** The classic deck in four colours; the full-suit deck always has them. */
  fourColour: boolean('four_colour').notNull(),
  potPercentage: boolean('pot_percentage').notNull(),
  displayUnit: text('display_unit', {
    enum: ['big-blinds', 'amount', 'both'],
  }).notNull(),
  theme: text('theme', { enum: ['dark', 'light', 'system'] }).notNull(),
  language: text('language', { enum: ['es', 'en'] }).notNull(),
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
export const hands = pgTable(
  'hands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    site: text('site').notNull(),
    siteHandId: text('site_hand_id').notNull(),
    heroScreenName: text('hero_screen_name').notNull(),
    /** The Hero's seat: with their Screen Name, what tells two views of one hand apart (ADR 0002). */
    heroSeat: integer('hero_seat').notNull(),
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
    /** The Hero's Result as an Amount, worked out from `content` at import. */
    heroResult: integer('hero_result').notNull(),
    /** Whether the Hero reached Showdown, worked out from `content` at import. */
    heroReachedShowdown: boolean('hero_reached_showdown').notNull(),
    content: jsonb('content').$type<Hand>().notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // The same Hand from the same Hero is only ever imported once (ADR 0002).
    // The seat tells Heroes apart on Poker Sites that write each as `Hero`.
    uniqueIndex('hands_site_hand_hero_seat_idx').on(
      table.site,
      table.siteHandId,
      table.heroScreenName,
      table.heroSeat,
    ),
  ],
);

/**
 * A Hand placed in a Room's Queue, with its Author in that Room. Removing it
 * never deletes the Hand (ADR 0002).
 */
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
    /** Whose spot the Hand is in this Room; another Room may give it another. */
    authorId: uuid('author_id')
      .notNull()
      .references(() => identities.id),
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
 * A Hand in an Account's Library: theirs to keep, whoever else has it too
 * (ADR 0004). Removing it deletes only this row, never the Hand.
 */
export const libraryEntries = pgTable(
  'library_entries',
  {
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id),
    handId: uuid('hand_id')
      .notNull()
      .references(() => hands.id),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.identityId, table.handId] }),
    index('library_entries_hand_id_idx').on(table.handId),
  ],
);

/**
 * Hands read from one uploaded file or paste, waiting for their Importer to
 * confirm them into their destination: a Room's Queue or their own Library.
 * Deleted once confirmed; unconfirmed ones are forgotten after a while.
 */
export const importPreviews = pgTable(
  'import_previews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    destination: text('destination', { enum: ['room', 'library'] }).notNull(),
    /** The Room whose Queue it is for; null when it is for the Library. */
    roomId: uuid('room_id').references(() => rooms.id),
    importerId: uuid('importer_id')
      .notNull()
      .references(() => identities.id),
    hands: jsonb('hands').$type<Hand[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('import_previews_created_at_idx').on(table.createdAt),
    // A Room preview names its Room; a Library preview names none.
    check(
      'import_previews_destination_room_check',
      sql`(${table.destination} = 'room') = (${table.roomId} is not null)`,
    ),
  ],
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
