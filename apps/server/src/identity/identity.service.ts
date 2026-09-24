import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { identities, screenNames } from '../database/schema.js';
import { Rejected } from '../rejection/rejection.js';

export interface Identity {
  id: string;
  displayName: string | null;
}

/** An identity as its owner sees it: with the Screen Names they declared. */
export interface Profile extends Identity {
  screenNames: string[];
}

export const DISPLAY_NAME_MAX_LENGTH = 40;
export const SCREEN_NAME_MAX_LENGTH = 50;
export const SCREEN_NAMES_MAX_COUNT = 20;

/** Issues anonymous identities and recognises them by their bearer token (ADR 0003). */
@Injectable()
export class IdentityService {
  private readonly screenNamesListeners: ((
    identityId: string,
    screenNames: string[],
  ) => void)[] = [];

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async issue(): Promise<{ token: string; identity: Profile }> {
    const token = randomBytes(32).toString('base64url');
    const [row] = await this.db
      .insert(identities)
      .values({ tokenHash: hashToken(token), createdAt: this.clock.now() })
      .returning();
    return { token, identity: { ...toIdentity(row), screenNames: [] } };
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

  async profile(identity: Identity): Promise<Profile> {
    const rows = await this.db
      .select({ screenName: screenNames.screenName })
      .from(screenNames)
      .where(eq(screenNames.identityId, identity.id))
      .orderBy(asc(screenNames.position));
    return { ...identity, screenNames: rows.map((row) => row.screenName) };
  }

  /** Calls `listener` with someone's Screen Names each time they are replaced. */
  onScreenNamesChanged(
    listener: (identityId: string, screenNames: string[]) => void,
  ): void {
    this.screenNamesListeners.push(listener);
  }

  /**
   * Replaces the identity's Screen Names. Hands already imported keep the
   * Author they were given.
   */
  async setScreenNames(identity: Identity, raw: unknown): Promise<Profile> {
    const names = validScreenNames(raw);
    await this.db.transaction(async (tx) => {
      await tx
        .delete(screenNames)
        .where(eq(screenNames.identityId, identity.id));
      if (names.length === 0) return;
      await tx.insert(screenNames).values(
        names.map((screenName, position) => ({
          identityId: identity.id,
          screenName,
          position,
        })),
      );
    });
    for (const listener of this.screenNamesListeners) {
      listener(identity.id, names);
    }
    return { ...identity, screenNames: names };
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

/**
 * A list of names, each trimmed, with blanks and repeats (ignoring case)
 * dropped, or `invalid-screen-names`.
 */
function validScreenNames(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.every((name) => typeof name === 'string')) {
    throw new Rejected('invalid-screen-names');
  }
  const names = new Map<string, string>();
  for (const name of (raw as string[]).map((each) => each.trim())) {
    if (name.length > SCREEN_NAME_MAX_LENGTH) {
      throw new Rejected('invalid-screen-names');
    }
    if (name.length > 0 && !names.has(name.toLowerCase())) {
      names.set(name.toLowerCase(), name);
    }
  }
  if (names.size > SCREEN_NAMES_MAX_COUNT) {
    throw new Rejected('invalid-screen-names');
  }
  return [...names.values()];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toIdentity(row: typeof identities.$inferSelect): Identity {
  return { id: row.id, displayName: row.displayName };
}
