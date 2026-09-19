// Drizzle schema. Tables are added here as features need them; run
// `pnpm db:generate` after changing this file to write a migration.
import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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
