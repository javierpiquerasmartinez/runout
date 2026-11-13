import { Inject, Injectable, Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';

/** The database's size, in bytes, at which Bulk Imports pause. */
export const STORAGE_THRESHOLD = Symbol('STORAGE_THRESHOLD');

/** The threshold while on Neon's Free plan, with room left below its storage limit. */
export const DEFAULT_STORAGE_THRESHOLD_MB = 800;

const MB = 1024 * 1024;

/** `STORAGE_THRESHOLD_MB`, in bytes; 800 MB when unset. */
export function storageThresholdFromEnv(env: NodeJS.ProcessEnv): number {
  const value = env.STORAGE_THRESHOLD_MB?.trim();
  if (!value) return DEFAULT_STORAGE_THRESHOLD_MB * MB;
  const mb = Number(value);
  if (!Number.isFinite(mb) || mb <= 0) {
    throw new Error(
      `STORAGE_THRESHOLD_MB must be a positive number of megabytes, not "${value}". See the README.`,
    );
  }
  return Math.round(mb * MB);
}

/**
 * The storage guard's measure: how much the database takes against the
 * configured threshold. Past it, a large import could make every write in
 * Runout fail, so Bulk Imports pause; small imports are unaffected.
 */
@Injectable()
export class Storage {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE_THRESHOLD) readonly threshold: number,
  ) {}

  /** The database's size now, in bytes. */
  async used(): Promise<number> {
    const {
      rows: [{ size }],
    } = await this.db.execute<{ size: string }>(
      sql`select pg_database_size(current_database())::text as size`,
    );
    return Number(size);
  }

  /** Whether Bulk Imports are to pause. */
  async reached(): Promise<boolean> {
    return (await this.used()) >= this.threshold;
  }
}

@Module({
  providers: [
    {
      provide: STORAGE_THRESHOLD,
      useFactory: () => storageThresholdFromEnv(process.env),
    },
    Storage,
  ],
  exports: [Storage],
})
export class StorageModule {}
