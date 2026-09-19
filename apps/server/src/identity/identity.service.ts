import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { identities } from '../database/schema.js';
import { Rejected } from '../rejection/rejection.js';

export interface Identity {
  id: string;
  displayName: string | null;
}

export const DISPLAY_NAME_MAX_LENGTH = 40;

/** Issues anonymous identities and recognises them by their bearer token (ADR 0003). */
@Injectable()
export class IdentityService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async issue(): Promise<{ token: string; identity: Identity }> {
    const token = randomBytes(32).toString('base64url');
    const [row] = await this.db
      .insert(identities)
      .values({ tokenHash: hashToken(token), createdAt: this.clock.now() })
      .returning();
    return { token, identity: toIdentity(row) };
  }

  /** The identity holding `token`, or `unauthenticated`. */
  async authenticate(token: string | undefined): Promise<Identity> {
    if (!token) throw new Rejected('unauthenticated');
    const [row] = await this.db
      .select()
      .from(identities)
      .where(eq(identities.tokenHash, hashToken(token)));
    if (!row) throw new Rejected('unauthenticated');
    return toIdentity(row);
  }

  /** Stores the Display Name last used, so it is prefilled next time. */
  async setDisplayName(id: string, displayName: unknown): Promise<Identity> {
    const [row] = await this.db
      .update(identities)
      .set({ displayName: validDisplayName(displayName) })
      .where(eq(identities.id, id))
      .returning();
    return toIdentity(row);
  }
}

export function validDisplayName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length === 0 || name.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new Rejected('invalid-display-name');
  }
  return name;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toIdentity(row: typeof identities.$inferSelect): Identity {
  return { id: row.id, displayName: row.displayName };
}
