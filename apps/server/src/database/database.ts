import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };

export const DATABASE = Symbol('DATABASE');
export const DATABASE_URL = Symbol('DATABASE_URL');
