import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { CLOCK, type Clock } from '../clock/clock.js';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../database/database.js';
import {
  GRAPH_COLOURS,
  identities,
  impersonations,
  invitations,
  marks,
  passwordAttempts,
  passwordResets,
  preferences,
  rooms,
  screenNames,
  sessions,
} from '../database/schema.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { EmailWriter } from '../mail/emails.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { Rejected } from '../rejection/rejection.js';
import {
  ADMINISTRATOR_EMAILS,
  type AdministratorEmails,
} from './administrators.js';
import {
  GOOGLE_VERIFIER,
  type GoogleAccount,
  type GoogleVerifier,
} from './google-verifier.js';
import { requirePending } from './invitations.js';
import { waitAfterFailures } from './password-rules.js';
import {
  NO_PASSWORD_HASH,
  hashPassword,
  validPassword,
  verifyPassword,
} from './passwords.js';
import { hashToken, newToken, normalEmail } from './tokens.js';

export interface Identity {
  id: string;
  displayName: string | null;
  /**
   * Set when this identity is being used by an Administrator through an
   * Impersonation, not by its owner: some things are then refused.
   */
  impersonation?: Impersonating;
}

/** The Impersonation a Sign-in is for. */
export interface Impersonating {
  id: string;
  administratorId: string;
  endsAt: Date;
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
  /** Graph Colours: each Results Graph line's colour, two lines may share one. */
  resultColour: GraphColour;
  allInEvColour: GraphColour;
  showdownColour: GraphColour;
  nonShowdownColour: GraphColour;
}

export type GraphColour = (typeof GRAPH_COLOURS)[number];

export const DEFAULT_PREFERENCES: Preferences = {
  deckStyle: 'classic',
  fourColour: true,
  potPercentage: true,
  displayUnit: 'big-blinds',
  theme: 'dark',
  language: 'es',
  resultColour: 'teal',
  allInEvColour: 'amber',
  showdownColour: 'blue',
  nonShowdownColour: 'red',
};

export type SignInMethod = 'google' | 'password';

/**
 * An identity as its owner sees it: with the Screen Names they declared and
 * how they read the table.
 */
export interface Profile extends Omit<Identity, 'impersonation'> {
  screenNames: string[];
  preferences: Preferences;
  /** How the Account signs in; null for an anonymous identity. */
  account: { email: string | null; signInMethods: SignInMethod[] } | null;
  /** The one Room an anonymous identity exists for; null for an Account. */
  room: { code: string } | null;
  /** Whether the Account runs Runout itself (ADR 0008); from the server's configuration. */
  administrator: boolean;
  /** Who is using this Account through an Impersonation, and until when; null for its owner. */
  impersonation: {
    administrator: { displayName: string | null; email: string | null };
    endsAt: string;
  } | null;
}

/** A browser just given a token for an identity. */
export interface SignedIn {
  token: string;
  identity: Profile;
}

/** Told whenever someone's Display Name really changes. */
export type RenameListener = (identity: Identity) => void;

/**
 * Told when someone signs in from inside a Room as anonymous: the Account
 * takes the anonymous identity's place there, in the same transaction that
 * ends that identity. What it answers runs once that has committed.
 */
export type TakeOverListener = (
  tx: Transaction,
  anonymous: { id: string; roomId: string },
  account: Identity,
) => Promise<() => void>;

export const DISPLAY_NAME_MAX_LENGTH = 40;
export const SCREEN_NAME_MAX_LENGTH = 50;
export const SCREEN_NAMES_MAX_COUNT = 20;

/** How far apart an Account's last activity is written: close enough, nearly free. */
export const ACTIVITY_PRECISION_MS = 5 * 60_000;
/** How long a password reset link works. */
export const RESET_LIFETIME_MS = 3_600_000;
/** How long an Impersonation lasts before it ends on its own. */
export const IMPERSONATION_LIFETIME_MS = 3_600_000;

type IdentityRow = typeof identities.$inferSelect;

/** Whether a stored identity is an Account, rather than an anonymous one. */
function isAccount(
  row: Pick<IdentityRow, 'googleSubject' | 'passwordHash'>,
): boolean {
  return row.googleSubject !== null || row.passwordHash !== null;
}

/**
 * Issues identities, Accounts (from an Invitation, through Google or a
 * password) and anonymous ones, and recognises them by their bearer token
 * (ADR 0005, ADR 0008).
 */
@Injectable()
export class IdentityService {
  private readonly renameListeners: RenameListener[] = [];
  private readonly takeOverListeners: TakeOverListener[] = [];
  private readonly screenNamesListeners: ((
    identityId: string,
    screenNames: string[],
  ) => void)[] = [];
  private readonly logger = new Logger(IdentityService.name);
  /** When each Account's last activity was last written, so it is written seldom. */
  private readonly activityWritten = new Map<string, number>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GOOGLE_VERIFIER) private readonly google: GoogleVerifier,
    @Inject(ADMINISTRATOR_EMAILS)
    private readonly administrators: AdministratorEmails,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly emails: EmailWriter,
  ) {}

  /**
   * A new anonymous identity for one Room, under the Display Name chosen to
   * join it, and the token its browser keeps. It ends when the Room closes.
   */
  async issueAnonymous(
    roomId: string,
    displayName: unknown,
  ): Promise<SignedIn> {
    const [row] = await this.db
      .insert(identities)
      .values({
        displayName: validDisplayName(displayName),
        roomId,
        createdAt: this.clock.now(),
      })
      .returning();
    return {
      token: await this.startSession(row.id),
      identity: await this.profile(toIdentity(row)),
    };
  }

  /** The Google account behind an ID token, or `invalid-google-token`. */
  private async verifyGoogle(idToken: unknown): Promise<GoogleAccount> {
    const google =
      typeof idToken === 'string' && idToken.length > 0
        ? await this.google.verify(idToken)
        : null;
    if (!google) throw new Rejected('invalid-google-token');
    return { ...google, email: google.email?.toLowerCase() ?? null };
  }

  /**
   * Signs in with a Google ID token: the Account with that Google account, or
   * else the one with its email, which gets Google linked to it. With neither,
   * `invitation-required`, and nothing is created: a new Account only comes
   * from an Invitation (ADR 0008). Test mode's personas are the exception.
   * A token Google didn't issue for this app is `invalid-google-token`.
   *
   * Signed in from inside a Room as anonymous (`fromToken` is that identity's),
   * the Account takes its place in the Room, keeps its Display Name if it has
   * none yet, and the anonymous identity ends.
   */
  async signInWithGoogle(
    idToken: unknown,
    fromToken?: string,
  ): Promise<SignedIn> {
    const google = await this.verifyGoogle(idToken);
    const found = await this.accountForGoogle(google);
    requireNotSuspended(found);
    const account = await this.takeOver(fromToken, toIdentity(found));
    return this.signedIn(account);
  }

  /** The Account a Google account signs in to, linked or created as needed. */
  private async accountForGoogle(google: GoogleAccount): Promise<IdentityRow> {
    const [bySubject] = await this.db
      .select()
      .from(identities)
      .where(eq(identities.googleSubject, google.subject));
    if (bySubject) {
      // The email may have changed on Google's side since last time.
      if (google.email === null || google.email === bySubject.email) {
        return bySubject;
      }
      return this.updateOrRefuse(bySubject.id, { email: google.email });
    }
    const [byEmail] =
      google.email === null
        ? []
        : await this.db
            .select()
            .from(identities)
            .where(eq(identities.email, google.email));
    if (byEmail) {
      // Another Google account already signs in to it: never two on one.
      if (byEmail.googleSubject !== null) throw new Rejected('email-taken');
      return this.updateOrRefuse(byEmail.id, { googleSubject: google.subject });
    }
    if (!google.persona) throw new Rejected('invitation-required');
    const [created] = await this.db
      .insert(identities)
      .values({
        googleSubject: google.subject,
        email: google.email,
        createdAt: this.clock.now(),
      })
      // The same persona signing in twice at once: one creates it, the
      // other finds it.
      .onConflictDoNothing()
      .returning();
    return created ?? this.accountForGoogle(google);
  }

  /** Writes to an Account, refusing with `email-taken` rather than merge two. */
  private async updateOrRefuse(
    id: string,
    changes: Partial<IdentityRow>,
  ): Promise<IdentityRow> {
    try {
      const [row] = await this.db
        .update(identities)
        .set(changes)
        .where(eq(identities.id, id))
        .returning();
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw new Rejected('email-taken');
      throw error;
    }
  }

  /**
   * Accepts an Invitation by choosing a password: a new Account with the
   * invited email, its Preferences in the Invitation's language, signed in.
   */
  async acceptWithPassword(
    token: unknown,
    password: unknown,
  ): Promise<SignedIn> {
    const chosen = validPassword(password);
    // A made-up link is refused before any hashing is paid for.
    requirePending(
      await this.invitationByToken(this.db, token),
      this.clock.now(),
    );
    const passwordHash = await hashPassword(chosen);
    return this.accept(token, () => ({ passwordHash }));
  }

  /**
   * Accepts an Invitation with Google, which must say the invited email:
   * `invitation-email-mismatch` otherwise, carrying the one invited.
   */
  async acceptWithGoogle(token: unknown, idToken: unknown): Promise<SignedIn> {
    const google = await this.verifyGoogle(idToken);
    return this.accept(token, (invited) => {
      if (google.email !== invited) {
        throw new Rejected('invitation-email-mismatch', { email: invited });
      }
      return { googleSubject: google.subject };
    });
  }

  private async accept(
    token: unknown,
    signInWith: (invitedEmail: string) => Partial<IdentityRow>,
  ): Promise<SignedIn> {
    const now = this.clock.now();
    const account = await this.db
      .transaction(async (tx) => {
        const invitation = requirePending(
          await this.invitationByToken(tx, token, true),
          now,
        );
        const method = signInWith(invitation.email);
        const [taken] = await tx
          .select({ id: identities.id })
          .from(identities)
          .where(eq(identities.email, invitation.email));
        if (taken) throw new Rejected('account-exists');
        const [row] = await tx
          .insert(identities)
          .values({
            ...method,
            email: invitation.email,
            invitationId: invitation.id,
            createdAt: now,
          })
          .returning();
        await tx.insert(preferences).values({
          ...DEFAULT_PREFERENCES,
          identityId: row.id,
          language: invitation.language,
        });
        await tx
          .update(invitations)
          .set({ acceptedAt: now, accountId: row.id })
          .where(eq(invitations.id, invitation.id));
        return row;
      })
      .catch((error: unknown) => {
        // The same Google account or email got there first.
        if (isUniqueViolation(error)) throw new Rejected('account-exists');
        throw error;
      });
    return this.signedIn(toIdentity(account));
  }

  private async invitationByToken(
    db: Database | Transaction,
    token: unknown,
    lock = false,
  ): Promise<typeof invitations.$inferSelect | undefined> {
    if (typeof token !== 'string' || token.length === 0) return undefined;
    const query = db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashToken(token)));
    const [found] = lock ? await query.for('update') : await query;
    return found;
  }

  /**
   * Signs in with an email and its password. A wrong password and an email
   * with no Account get the same `invalid-credentials`; past five failures in
   * a row each one makes the next attempt wait, `too-many-attempts` carrying
   * until when. Emails without an Account are slowed the same way, so neither
   * the answer nor its timing tells which emails have one.
   */
  async signInWithPassword(
    email: unknown,
    password: unknown,
  ): Promise<SignedIn> {
    const address = normalEmail(email) ?? '';
    const typed = typeof password === 'string' ? password : '';
    // One attempt per email at a time: attempts made side by side can't all
    // slip past the wait before any of them has counted.
    const outcome = await this.db.transaction(async (tx) => {
      const now = this.clock.now();
      await tx
        .insert(passwordAttempts)
        .values({ email: address, failures: 0 })
        .onConflictDoNothing();
      const [attempts] = await tx
        .select()
        .from(passwordAttempts)
        .where(eq(passwordAttempts.email, address))
        .for('update');
      if (attempts.blockedUntil && attempts.blockedUntil > now) {
        return { refused: tooManyAttempts(attempts.blockedUntil) };
      }
      const [account] = address
        ? await tx
            .select()
            .from(identities)
            .where(eq(identities.email, address))
        : [];
      const matches = await verifyPassword(
        typed,
        account?.passwordHash ?? NO_PASSWORD_HASH,
      );
      if (account?.passwordHash && matches) {
        await tx
          .delete(passwordAttempts)
          .where(eq(passwordAttempts.email, address));
        return { account };
      }
      const failures = attempts.failures + 1;
      const wait = waitAfterFailures(failures);
      const blockedUntil = wait === 0 ? null : new Date(now.getTime() + wait);
      await tx
        .update(passwordAttempts)
        .set({ failures, blockedUntil })
        .where(eq(passwordAttempts.email, address));
      return {
        refused: blockedUntil
          ? tooManyAttempts(blockedUntil)
          : new Rejected('invalid-credentials'),
      };
    });
    if ('refused' in outcome) throw outcome.refused;
    requireNotSuspended(outcome.account);
    return this.signedIn(toIdentity(outcome.account));
  }

  /**
   * Sends a link to choose a new password to the Account with this email, if
   * there is one: the answer is the same whatever the email. Earlier links
   * stop working. A suspended Account is told so instead.
   */
  async requestPasswordReset(email: unknown): Promise<void> {
    const address = normalEmail(email);
    if (!address) return;
    const [account] = await this.db
      .select()
      .from(identities)
      .where(eq(identities.email, address));
    if (!account || !isAccount(account)) return;
    requireNotSuspended(account);
    const token = newToken();
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      await tx
        .delete(passwordResets)
        .where(
          and(
            eq(passwordResets.identityId, account.id),
            isNull(passwordResets.usedAt),
          ),
        );
      await tx.insert(passwordResets).values({
        tokenHash: hashToken(token),
        identityId: account.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + RESET_LIFETIME_MS),
      });
    });
    const { language } = await this.preferences(account.id);
    // Not waited for: neither how long it takes nor whether it fails may tell
    // this email from one without an Account.
    void this.mailer
      .send(this.emails.passwordReset({ to: address, language, token }))
      .catch((error: unknown) => this.logger.error(error));
  }

  /**
   * Chooses a new password from a reset link: every Sign-in of the Account
   * ends, its failed attempts are forgotten, and this browser is signed in.
   */
  async completePasswordReset(
    token: unknown,
    password: unknown,
  ): Promise<SignedIn> {
    const chosen = validPassword(password);
    const [known] =
      typeof token === 'string' && token.length > 0
        ? await this.db
            .select({ tokenHash: passwordResets.tokenHash })
            .from(passwordResets)
            .where(eq(passwordResets.tokenHash, hashToken(token)))
        : [];
    // A made-up link is refused before any hashing is paid for.
    if (!known) throw new Rejected('reset-not-found');
    const passwordHash = await hashPassword(chosen);
    const now = this.clock.now();
    const account = await this.db.transaction(async (tx) => {
      const [reset] =
        typeof token === 'string' && token.length > 0
          ? await tx
              .select()
              .from(passwordResets)
              .where(eq(passwordResets.tokenHash, hashToken(token)))
              .for('update')
          : [];
      if (!reset) throw new Rejected('reset-not-found');
      if (reset.usedAt) throw new Rejected('reset-used');
      if (reset.expiresAt <= now) throw new Rejected('reset-expired');
      const [row] = await tx
        .update(identities)
        .set({ passwordHash })
        .where(eq(identities.id, reset.identityId))
        .returning();
      requireNotSuspended(row);
      await tx
        .update(passwordResets)
        .set({ usedAt: now })
        .where(eq(passwordResets.tokenHash, reset.tokenHash));
      await this.endSignInsOf(tx, row.id);
      if (row.email) {
        await tx
          .delete(passwordAttempts)
          .where(eq(passwordAttempts.email, row.email));
      }
      return row;
    });
    return this.signedIn(toIdentity(account));
  }

  /** Gives an Account that signs in with Google only a password too. */
  async addPassword(identity: Identity, password: unknown): Promise<Profile> {
    refuseImpersonation(identity);
    const passwordHash = await hashPassword(validPassword(password));
    const added = await this.db
      .update(identities)
      .set({ passwordHash })
      .where(
        and(eq(identities.id, identity.id), isNull(identities.passwordHash)),
      )
      .returning({ id: identities.id });
    if (added.length === 0) throw new Rejected('password-exists');
    return this.profile(identity);
  }

  /**
   * Changes the Account's password, given the current one
   * (`invalid-credentials` otherwise). Every other browser it was signed in
   * on is signed out; this one stays.
   */
  async changePassword(
    identity: Identity,
    token: string | undefined,
    currentPassword: unknown,
    password: unknown,
  ): Promise<Profile> {
    refuseImpersonation(identity);
    const [row] = await this.db
      .select()
      .from(identities)
      .where(eq(identities.id, identity.id));
    const matches =
      row?.passwordHash != null &&
      typeof currentPassword === 'string' &&
      (await verifyPassword(currentPassword, row.passwordHash));
    if (!matches) throw new Rejected('invalid-credentials');
    const passwordHash = await hashPassword(validPassword(password));
    await this.db.transaction(async (tx) => {
      await tx
        .update(identities)
        .set({ passwordHash })
        .where(eq(identities.id, identity.id));
      await tx
        .delete(sessions)
        .where(
          and(
            eq(sessions.identityId, identity.id),
            ne(sessions.tokenHash, hashToken(token ?? '')),
          ),
        );
    });
    return this.profile(identity);
  }

  /** The Account in the place of the anonymous identity holding `token`, if one does. */
  private async takeOver(
    token: string | undefined,
    account: Identity,
  ): Promise<Identity> {
    const anonymous = token ? await this.anonymousHolder(token) : null;
    if (anonymous?.roomId == null) return account;
    const { roomId } = anonymous;
    const committed = await this.db.transaction(async (tx) => {
      const afterwards: (() => void)[] = [];
      for (const listener of this.takeOverListeners) {
        afterwards.push(
          await listener(tx, { id: anonymous.id, roomId }, account),
        );
      }
      await this.endAnonymous(tx, [anonymous.id]);
      return afterwards;
    });
    for (const then of committed) then();
    if (account.displayName !== null || anonymous.displayName === null) {
      return account;
    }
    return this.setDisplayName(account.id, anonymous.displayName);
  }

  /** A new Sign-in for an Account that has just signed in, by whichever way. */
  private async signedIn(account: Identity): Promise<SignedIn> {
    await this.db
      .update(identities)
      .set({ lastSignedInAt: this.clock.now() })
      .where(eq(identities.id, account.id));
    return {
      token: await this.startSession(account.id),
      identity: await this.profile(account),
    };
  }

  /**
   * Ends the anonymous identities of a Room that has just closed: they stop
   * authenticating and lose their Screen Names, Preferences and Marks. The
   * identities themselves stay, so Notes keep their writer's Display Name.
   */
  async endAnonymousOf(tx: Transaction, roomId: string): Promise<void> {
    const ending = await tx
      .select({ id: identities.id })
      .from(identities)
      .where(eq(identities.roomId, roomId));
    await this.endAnonymous(
      tx,
      ending.map((row) => row.id),
    );
  }

  private async endAnonymous(
    tx: Transaction,
    identityIds: string[],
  ): Promise<void> {
    if (identityIds.length === 0) return;
    await tx.delete(sessions).where(inArray(sessions.identityId, identityIds));
    await tx
      .delete(screenNames)
      .where(inArray(screenNames.identityId, identityIds));
    await tx
      .delete(preferences)
      .where(inArray(preferences.identityId, identityIds));
    await tx.delete(marks).where(inArray(marks.identityId, identityIds));
  }

  /**
   * Ends the session holding `token`; the token stops authenticating at once.
   * For an Impersonation's Sign-in, that ends the Impersonation.
   */
  async signOut(token: string | undefined): Promise<void> {
    if (!token) throw new Rejected('unauthenticated');
    const ended = await this.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)))
      .returning();
    if (ended.length === 0) throw new Rejected('unauthenticated');
    const impersonationId = ended[0].impersonationId;
    if (impersonationId) {
      await this.db
        .update(impersonations)
        .set({ endedAt: this.clock.now() })
        .where(
          and(
            eq(impersonations.id, impersonationId),
            isNull(impersonations.endedAt),
          ),
        );
    }
  }

  /**
   * Ends every Sign-in an Account holds, at once: on every browser it is out.
   * An Impersonation of it going on ends with them, and is recorded so.
   */
  async endSignInsOf(tx: Transaction, identityId: string): Promise<void> {
    await tx.delete(sessions).where(eq(sessions.identityId, identityId));
    const now = this.clock.now();
    await tx
      .update(impersonations)
      .set({ endedAt: now })
      .where(
        and(
          eq(impersonations.accountId, identityId),
          isNull(impersonations.endedAt),
          gt(impersonations.endsAt, now),
        ),
      );
  }

  /**
   * A Sign-in for `accountId` that an Administrator uses through the
   * Impersonation `impersonationId`. The Account's own Sign-ins are untouched.
   */
  async startImpersonationSession(
    tx: Transaction,
    accountId: string,
    impersonationId: string,
  ): Promise<string> {
    const token = newToken();
    await tx.insert(sessions).values({
      tokenHash: hashToken(token),
      identityId: accountId,
      impersonationId,
      createdAt: this.clock.now(),
    });
    return token;
  }

  /** The identity holding `token`, or `unauthenticated`. */
  async authenticate(token: string | undefined): Promise<Identity> {
    const { identity } = await this.holder(token);
    return identity;
  }

  /**
   * The Account holding `token`: `unauthenticated` without a valid token,
   * `account-required` when it belongs to an anonymous identity.
   */
  async authenticateAccount(token: string | undefined): Promise<Identity> {
    const { row, identity } = await this.holder(token);
    if (!isAccount(row)) throw new Rejected('account-required');
    return identity;
  }

  /**
   * The Administrator holding `token`. To anyone else, signed in or not, the
   * answer is `not-found`: the Administrator panel isn't there for them. While
   * impersonating, `impersonation-not-allowed`.
   */
  async authenticateAdministrator(
    token: string | undefined,
  ): Promise<Identity> {
    let held: { row: IdentityRow; identity: Identity };
    try {
      held = await this.holder(token);
    } catch (error) {
      if (error instanceof Rejected) throw new Rejected('not-found');
      throw error;
    }
    if (held.identity.impersonation) {
      throw new Rejected('impersonation-not-allowed');
    }
    if (!isAccount(held.row) || !this.administrators.includes(held.row.email)) {
      throw new Rejected('not-found');
    }
    return held.identity;
  }

  /** Whether the Account with this email is an Administrator. */
  isAdministrator(email: string | null): boolean {
    return this.administrators.includes(email);
  }

  /**
   * The stored identity holding `token`, when there is one: a token that no
   * longer works just means there is nothing to take over.
   */
  private async anonymousHolder(token: string): Promise<IdentityRow | null> {
    try {
      return (await this.holder(token)).row;
    } catch (error) {
      if (error instanceof Rejected && error.reason === 'unauthenticated') {
        return null;
      }
      throw error;
    }
  }

  /**
   * The one Room an anonymous identity exists for; null for an Account, which
   * may enter any. `unauthenticated` for an identity that isn't there.
   */
  async roomOf(identityId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ roomId: identities.roomId })
      .from(identities)
      .where(eq(identities.id, identityId));
    if (!row) throw new Rejected('unauthenticated');
    return row.roomId;
  }

  /**
   * The stored identity holding `token`, or `unauthenticated`: also for a
   * suspended Account, and for an Impersonation that has ended. The owner's
   * own requests keep their last activity up to date.
   */
  private async holder(
    token: string | undefined,
  ): Promise<{ row: IdentityRow; identity: Identity }> {
    if (!token) throw new Rejected('unauthenticated');
    const now = this.clock.now();
    const [held] = await this.db
      .select({ identity: identities, impersonation: impersonations })
      .from(sessions)
      .innerJoin(identities, eq(identities.id, sessions.identityId))
      .leftJoin(impersonations, eq(impersonations.id, sessions.impersonationId))
      .where(eq(sessions.tokenHash, hashToken(token)));
    if (!held || held.identity.suspendedAt !== null) {
      throw new Rejected('unauthenticated');
    }
    const impersonation = held.impersonation;
    if (impersonation) {
      if (impersonation.endedAt !== null || impersonation.endsAt <= now) {
        throw new Rejected('unauthenticated');
      }
      return {
        row: held.identity,
        identity: {
          ...toIdentity(held.identity),
          impersonation: {
            id: impersonation.id,
            administratorId: impersonation.administratorId,
            endsAt: impersonation.endsAt,
          },
        },
      };
    }
    if (isAccount(held.identity)) await this.active(held.identity.id, now);
    return { row: held.identity, identity: toIdentity(held.identity) };
  }

  /** Records an Account's activity, at most once every few minutes. */
  private async active(identityId: string, now: Date): Promise<void> {
    const last = this.activityWritten.get(identityId);
    if (last !== undefined && now.getTime() - last < ACTIVITY_PRECISION_MS) {
      return;
    }
    this.activityWritten.set(identityId, now.getTime());
    await this.db
      .update(identities)
      .set({ lastActiveAt: now })
      .where(eq(identities.id, identityId));
  }

  async profile(identity: Identity): Promise<Profile> {
    const administrator = alias(identities, 'administrator');
    const [rows, preferences, [stored], [impersonating]] = await Promise.all([
      this.db
        .select({ screenName: screenNames.screenName })
        .from(screenNames)
        .where(eq(screenNames.identityId, identity.id))
        .orderBy(asc(screenNames.position)),
      this.preferences(identity.id),
      this.db
        .select({
          googleSubject: identities.googleSubject,
          passwordHash: identities.passwordHash,
          email: identities.email,
          roomCode: rooms.code,
        })
        .from(identities)
        .leftJoin(rooms, eq(rooms.id, identities.roomId))
        .where(eq(identities.id, identity.id)),
      identity.impersonation
        ? this.db
            .select({
              displayName: administrator.displayName,
              email: administrator.email,
            })
            .from(administrator)
            .where(eq(administrator.id, identity.impersonation.administratorId))
        : Promise.resolve([]),
    ]);
    const account = stored !== undefined && isAccount(stored);
    const methods: SignInMethod[] = [];
    if (stored?.googleSubject != null) methods.push('google');
    if (stored?.passwordHash != null) methods.push('password');
    return {
      id: identity.id,
      displayName: identity.displayName,
      screenNames: rows.map((row) => row.screenName),
      preferences,
      account: account
        ? { email: stored.email ?? null, signInMethods: methods }
        : null,
      room: stored?.roomCode == null ? null : { code: stored.roomCode },
      administrator:
        account &&
        !identity.impersonation &&
        this.administrators.includes(stored.email),
      impersonation:
        identity.impersonation && impersonating
          ? {
              administrator: impersonating,
              endsAt: identity.impersonation.endsAt.toISOString(),
            }
          : null,
    };
  }

  private async startSession(identityId: string): Promise<string> {
    const token = newToken();
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

  /** Hears every Account taking an anonymous identity's place in its Room. */
  onTakeOver(listener: TakeOverListener): void {
    this.takeOverListeners.push(listener);
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
  resultColour: GRAPH_COLOURS,
  allInEvColour: GRAPH_COLOURS,
  showdownColour: GRAPH_COLOURS,
  nonShowdownColour: GRAPH_COLOURS,
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

function toIdentity(row: IdentityRow): Identity {
  return { id: row.id, displayName: row.displayName };
}

/** `account-suspended` for an Account an Administrator Suspended. */
function requireNotSuspended(row: IdentityRow): void {
  if (row.suspendedAt !== null) throw new Rejected('account-suspended');
}

/** What an Administrator using someone's Account through an Impersonation may not do. */
export function refuseImpersonation(identity: Identity): void {
  if (identity.impersonation) throw new Rejected('impersonation-not-allowed');
}

function tooManyAttempts(retryAt: Date): Rejected {
  return new Rejected('too-many-attempts', { retryAt: retryAt.toISOString() });
}
