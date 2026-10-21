import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, ne, or } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import {
  identities,
  preferences,
  screenNames,
  sessions,
} from '../database/schema.js';
import { Rejected } from '../rejection/rejection.js';
import { GOOGLE_VERIFIER, type GoogleVerifier } from './google-verifier.js';

export interface Identity {
  id: string;
  displayName: string | null;
}

/** How one person reads the table. Personal: the Room never sees it. */
export interface Preferences {
  deckStyle: 'classic' | 'full-suit';
  /** The classic deck in four colours; the full-suit deck always has them. */
  fourColour: boolean;
  /** A bet's share of the pot, next to the bet. */
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
  /** The Google account behind it; null for an anonymous identity. */
  account: { email: string | null } | null;
}

/** A browser just given a token for an identity. */
export interface SignedIn {
  token: string;
  identity: Profile;
}

/** Told whenever someone's Display Name really changes. */
export type RenameListener = (identity: Identity) => void;

export const DISPLAY_NAME_MAX_LENGTH = 40;
export const SCREEN_NAME_MAX_LENGTH = 50;
export const SCREEN_NAMES_MAX_COUNT = 20;

/**
 * Issues identities, Accounts through Google and anonymous ones, and
 * recognises them by their bearer token (ADR 0005).
 */
@Injectable()
export class IdentityService {
  private readonly renameListeners: RenameListener[] = [];
  private readonly screenNamesListeners: ((
    identityId: string,
    screenNames: string[],
  ) => void)[] = [];

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GOOGLE_VERIFIER) private readonly google: GoogleVerifier,
  ) {}

  /** A new anonymous identity and the token its browser keeps. */
  async issue(): Promise<SignedIn> {
    const [row] = await this.db
      .insert(identities)
      .values({ createdAt: this.clock.now() })
      .returning();
    return {
      token: await this.startSession(row.id),
      identity: await this.profile(toIdentity(row)),
    };
  }

  /**
   * Signs in with a Google ID token: the Account of that Google account,
   * created the first time, and a new token for this browser. A token Google
   * didn't issue for this app is refused with `invalid-google-token`.
   */
  async signInWithGoogle(idToken: unknown): Promise<SignedIn> {
    const google =
      typeof idToken === 'string' && idToken.length > 0
        ? await this.google.verify(idToken)
        : null;
    if (!google) throw new Rejected('invalid-google-token');
    const [row] = await this.db
      .insert(identities)
      .values({
        googleSubject: google.subject,
        email: google.email,
        createdAt: this.clock.now(),
      })
      .onConflictDoUpdate({
        target: identities.googleSubject,
        // The email may have changed on Google's side since last time.
        set: { email: google.email },
      })
      .returning();
    return {
      token: await this.startSession(row.id),
      identity: await this.profile(toIdentity(row)),
    };
  }

  /** Ends the session holding `token`; the token stops authenticating at once. */
  async signOut(token: string | undefined): Promise<void> {
    if (!token) throw new Rejected('unauthenticated');
    const ended = await this.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)))
      .returning();
    if (ended.length === 0) throw new Rejected('unauthenticated');
  }

  /** The identity holding `token`, or `unauthenticated`. */
  async authenticate(token: string | undefined): Promise<Identity> {
    return toIdentity(await this.holder(token));
  }

  /**
   * The Account holding `token`: `unauthenticated` without a valid token,
   * `account-required` when it belongs to an anonymous identity.
   */
  async authenticateAccount(token: string | undefined): Promise<Identity> {
    const row = await this.holder(token);
    if (row.googleSubject === null) throw new Rejected('account-required');
    return toIdentity(row);
  }

  /** The stored identity holding `token`, or `unauthenticated`. */
  private async holder(
    token: string | undefined,
  ): Promise<typeof identities.$inferSelect> {
    if (!token) throw new Rejected('unauthenticated');
    const [row] = await this.db
      .select({ identity: identities })
      .from(sessions)
      .innerJoin(identities, eq(identities.id, sessions.identityId))
      .where(eq(sessions.tokenHash, hashToken(token)));
    if (!row) throw new Rejected('unauthenticated');
    return row.identity;
  }

  async profile(identity: Identity): Promise<Profile> {
    const [rows, preferences, [stored]] = await Promise.all([
      this.db
        .select({ screenName: screenNames.screenName })
        .from(screenNames)
        .where(eq(screenNames.identityId, identity.id))
        .orderBy(asc(screenNames.position)),
      this.preferences(identity.id),
      this.db
        .select({
          googleSubject: identities.googleSubject,
          email: identities.email,
        })
        .from(identities)
        .where(eq(identities.id, identity.id)),
    ]);
    return {
      ...identity,
      screenNames: rows.map((row) => row.screenName),
      preferences,
      account:
        stored?.googleSubject == null ? null : { email: stored.email ?? null },
    };
  }

  private async startSession(identityId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.insert(sessions).values({
      tokenHash: hashToken(token),
      identityId,
      createdAt: this.clock.now(),
    });
    return token;
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

  /** Calls `listener` with someone's Screen Names each time they are replaced. */
  onScreenNamesChanged(
    listener: (identityId: string, screenNames: string[]) => void,
  ): void {
    this.screenNamesListeners.push(listener);
  }

  /**
   * Replaces the identity's Screen Names. Hands already queued keep the
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
    return { ...(await this.profile(identity)), screenNames: names };
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
    const known = Object.hasOwn(PREFERENCE_VALUES, key);
    const allowed: readonly unknown[] = known
      ? PREFERENCE_VALUES[key as keyof Preferences]
      : [];
    if (!allowed.includes(value)) {
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
