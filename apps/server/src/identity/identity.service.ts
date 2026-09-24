import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, ne, or } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { identities, preferences, screenNames } from '../database/schema.js';
import { Rejected } from '../rejection/rejection.js';

export interface Identity {
  id: string;
  displayName: string | null;
}

/** How one person reads the table. Personal: the Room never sees it. */
export interface Preferences {
  deckStyle: 'classic' | 'full-suit';
  /** The classic deck in four colours; the full-suit deck always has them. */
  fourColour: boolean;
  /** A bet's share of the pot, next to its chips. */
  potPercentage: boolean;
  displayUnit: 'big-blinds' | 'amount' | 'both';
  theme: 'dark' | 'light' | 'system';
  language: 'es' | 'en';
}

export const DEFAULT_PREFERENCES: Preferences = {
  deckStyle: 'classic',
  fourColour: true,
  potPercentage: true,
  displayUnit: 'big-blinds',
  theme: 'dark',
  language: 'es',
};

/**
 * An identity as its owner sees it: with the Screen Names they declared and
 * how they read the table.
 */
export interface Profile extends Identity {
  screenNames: string[];
  preferences: Preferences;
}

/** Told whenever someone's Display Name really changes. */
export type RenameListener = (identity: Identity) => void;

export const DISPLAY_NAME_MAX_LENGTH = 40;
export const SCREEN_NAME_MAX_LENGTH = 50;
export const SCREEN_NAMES_MAX_COUNT = 20;

/** Issues anonymous identities and recognises them by their bearer token (ADR 0003). */
@Injectable()
export class IdentityService {
  private readonly renameListeners: RenameListener[] = [];

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
    return {
      token,
      identity: {
        ...toIdentity(row),
        screenNames: [],
        preferences: DEFAULT_PREFERENCES,
      },
    };
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
    const [rows, preferences] = await Promise.all([
      this.db
        .select({ screenName: screenNames.screenName })
        .from(screenNames)
        .where(eq(screenNames.identityId, identity.id))
        .orderBy(asc(screenNames.position)),
      this.preferences(identity.id),
    ]);
    return {
      ...identity,
      screenNames: rows.map((row) => row.screenName),
      preferences,
    };
  }

  async preferences(identityId: string): Promise<Preferences> {
    const [row] = await this.db
      .select()
      .from(preferences)
      .where(eq(preferences.identityId, identityId));
    if (!row) return DEFAULT_PREFERENCES;
    const { identityId: _owner, ...stored } = row;
    return stored;
  }

  /**
   * Changes some of the identity's preferences, keeping the rest. Anything
   * that isn't a known preference with an allowed value refuses the whole
   * change with `invalid-preferences`.
   */
  async changePreferences(
    identity: Identity,
    raw: unknown,
  ): Promise<Preferences> {
    const changes = validPreferenceChanges(raw);
    const next = { ...(await this.preferences(identity.id)), ...changes };
    await this.db
      .insert(preferences)
      .values({ identityId: identity.id, ...next })
      .onConflictDoUpdate({ target: preferences.identityId, set: next });
    return next;
  }

  /** Hears every real change of a Display Name, wherever it was made. */
  onRenamed(listener: RenameListener): void {
    this.renameListeners.push(listener);
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
    return {
      ...identity,
      screenNames: names,
      preferences: await this.preferences(identity.id),
    };
  }

  /**
   * Stores the Display Name last used, so it is prefilled next time, and
   * tells whoever listens when it is a new one.
   */
  async setDisplayName(id: string, displayName: unknown): Promise<Identity> {
    const name = validDisplayName(displayName);
    const [changed] = await this.db
      .update(identities)
      .set({ displayName: name })
      .where(
        and(
          eq(identities.id, id),
          or(isNull(identities.displayName), ne(identities.displayName, name)),
        ),
      )
      .returning();
    if (!changed) return { id, displayName: name };
    const renamed = toIdentity(changed);
    for (const listener of this.renameListeners) listener(renamed);
    return renamed;
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

const PREFERENCE_VALUES: {
  [K in keyof Preferences]: readonly Preferences[K][];
} = {
  deckStyle: ['classic', 'full-suit'],
  fourColour: [true, false],
  potPercentage: [true, false],
  displayUnit: ['big-blinds', 'amount', 'both'],
  theme: ['dark', 'light', 'system'],
  language: ['es', 'en'],
};

/** Some preferences, each a known one with an allowed value, or `invalid-preferences`. */
function validPreferenceChanges(raw: unknown): Partial<Preferences> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Rejected('invalid-preferences');
  }
  for (const [key, value] of Object.entries(raw)) {
    const allowed: readonly unknown[] | undefined =
      PREFERENCE_VALUES[key as keyof Preferences];
    if (!Object.hasOwn(PREFERENCE_VALUES, key) || !allowed?.includes(value)) {
      throw new Rejected('invalid-preferences');
    }
  }
  return raw as Partial<Preferences>;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toIdentity(row: typeof identities.$inferSelect): Identity {
  return { id: row.id, displayName: row.displayName };
}
