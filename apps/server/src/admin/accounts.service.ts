import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import {
  hands,
  identities,
  impersonations,
  invitations,
  labTags,
  libraryEntries,
  notes,
  ranges,
  roomMemberships,
  rooms,
  tags,
} from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import {
  IdentityService,
  IMPERSONATION_LIFETIME_MS,
  type Identity,
  type SignedIn,
  type SignInMethod,
} from '../identity/identity.service.js';
import type { PersonView } from '../identity/invitations.service.js';
import { invitationStatus } from '../identity/invitations.js';
import { Rejected } from '../rejection/rejection.js';
import { RoomGateway } from '../rooms/room.gateway.js';
import { RoomsService } from '../rooms/rooms.service.js';
import { adminPage, oneOf } from './admin-query.js';

/** What an Account has and has done, counted now. */
export interface AccountCounts {
  libraryHands: number;
  /** How many times it brought Hands in: each import stores its Hands at one instant. */
  imports: number;
  ranges: number;
  libraryTags: number;
  labTags: number;
  notes: number;
  roomsCreated: number;
  roomsJoined: number;
}

export interface AccountView {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  /** The Invitation it came from; null for Accounts from before them. */
  invitation: { id: string; sentAt: string; sentBy: PersonView } | null;
  signInMethods: SignInMethod[];
  lastSignedInAt: string | null;
  lastActiveAt: string | null;
  administrator: boolean;
  suspension: { at: string; by: PersonView | null } | null;
  counts: AccountCounts;
  /** Every Impersonation of it, the latest first. */
  impersonations: {
    administrator: PersonView;
    startedAt: string;
    /** When it ended, or will end on its own; null never. */
    endedAt: string;
  }[];
}

export interface AccountsPage {
  total: number;
  page: number;
  pageSize: number;
  accounts: AccountView[];
}

export interface Totals {
  accounts: number;
  activeLast7Days: number;
  activeLast30Days: number;
  suspended: number;
  pendingInvitations: number;
  hands: number;
  ranges: number;
  openRooms: number;
  closedRooms: number;
}

export const ACCOUNT_SORTS = [
  'lastActiveAt',
  'email',
  'displayName',
  'createdAt',
  'libraryHands',
  'imports',
  'ranges',
  'libraryTags',
  'labTags',
  'notes',
  'roomsCreated',
  'roomsJoined',
] as const;
export type AccountSort = (typeof ACCOUNT_SORTS)[number];

const DAY = 24 * 3_600_000;

/** An Account, as opposed to an anonymous identity. */
const isAccount = or(
  isNotNull(identities.googleSubject),
  isNotNull(identities.passwordHash),
);

/** Each count, as a subquery on the Account of the outer row: plain aggregates, nothing cached. */
const COUNTS: Record<keyof AccountCounts, SQL<number>> = {
  libraryHands: sql<number>`(select count(*)::int from ${libraryEntries} where ${libraryEntries.identityId} = ${identities.id})`,
  imports: sql<number>`(select count(distinct ${hands.importedAt})::int from ${hands} where ${hands.importerId} = ${identities.id})`,
  ranges: sql<number>`(select count(*)::int from ${ranges} where ${ranges.identityId} = ${identities.id})`,
  libraryTags: sql<number>`(select count(*)::int from ${tags} where ${tags.identityId} = ${identities.id})`,
  labTags: sql<number>`(select count(*)::int from ${labTags} where ${labTags.identityId} = ${identities.id})`,
  notes: sql<number>`(select count(*)::int from ${notes} where ${notes.writerId} = ${identities.id})`,
  roomsCreated: sql<number>`(select count(*)::int from ${rooms} where ${rooms.creatorId} = ${identities.id})`,
  roomsJoined: sql<number>`(select count(*)::int from ${roomMemberships} where ${roomMemberships.identityId} = ${identities.id})`,
};

/** The Accounts tab: who uses Runout and how, Suspension and Impersonation. */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly identityService: IdentityService,
    private readonly rooms: RoomsService,
    private readonly gateway: RoomGateway,
  ) {}

  /** Every Account with its statistics, sorted, searched and a page at a time. */
  async list(query: {
    search?: unknown;
    sort?: unknown;
    direction?: unknown;
    page?: unknown;
    pageSize?: unknown;
  }): Promise<AccountsPage> {
    const sort = oneOf(query.sort, ACCOUNT_SORTS);
    const direction = oneOf(query.direction, ['desc', 'asc'] as const);
    const { page, pageSize } = adminPage(query);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const where = search
      ? and(
          isAccount,
          or(
            sql`${identities.email} ilike ${pattern}`,
            sql`${identities.displayName} ilike ${pattern}`,
          ),
        )
      : isAccount;
    const sortBy: SQL =
      sort in COUNTS
        ? COUNTS[sort as keyof AccountCounts]
        : sql`${identities[sort as 'email' | 'displayName' | 'createdAt' | 'lastActiveAt']}`;
    const order =
      direction === 'asc'
        ? sql`${sortBy} asc nulls last, ${identities.id}`
        : sql`${sortBy} desc nulls last, ${identities.id}`;

    const sender = alias(identities, 'sender');
    const suspender = alias(identities, 'suspender');
    const [[{ total }], rows] = await Promise.all([
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(identities)
        .where(where),
      this.db
        .select({
          account: identities,
          invitation: invitations,
          sender,
          suspender,
          ...COUNTS,
        })
        .from(identities)
        .leftJoin(invitations, eq(invitations.id, identities.invitationId))
        .leftJoin(sender, eq(sender.id, invitations.sentBy))
        .leftJoin(suspender, eq(suspender.id, identities.suspendedBy))
        .where(where)
        .orderBy(order)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const administrator = alias(identities, 'administrator');
    const impersonated =
      rows.length === 0
        ? []
        : await this.db
            .select({ impersonation: impersonations, administrator })
            .from(impersonations)
            .innerJoin(
              administrator,
              eq(administrator.id, impersonations.administratorId),
            )
            .where(
              inArray(
                impersonations.accountId,
                rows.map((row) => row.account.id),
              ),
            )
            .orderBy(sql`${impersonations.startedAt} desc`);
    return {
      total,
      page,
      pageSize,
      accounts: rows.map((row) => {
        const { account, invitation, sender: sentBy, suspender: by } = row;
        const methods: SignInMethod[] = [];
        if (account.googleSubject !== null) methods.push('google');
        if (account.passwordHash !== null) methods.push('password');
        return {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          createdAt: account.createdAt.toISOString(),
          invitation:
            invitation && sentBy
              ? {
                  id: invitation.id,
                  sentAt: invitation.sentAt.toISOString(),
                  sentBy: person(sentBy),
                }
              : null,
          signInMethods: methods,
          lastSignedInAt: account.lastSignedInAt?.toISOString() ?? null,
          lastActiveAt: account.lastActiveAt?.toISOString() ?? null,
          administrator: this.identityService.isAdministrator(account.email),
          suspension: account.suspendedAt
            ? {
                at: account.suspendedAt.toISOString(),
                by: by ? person(by) : null,
              }
            : null,
          counts: Object.fromEntries(
            Object.keys(COUNTS).map((key) => [
              key,
              row[key as keyof AccountCounts],
            ]),
          ) as unknown as AccountCounts,
          impersonations: impersonated
            .filter((each) => each.impersonation.accountId === account.id)
            .map(({ impersonation, administrator: who }) => ({
              administrator: person(who),
              startedAt: impersonation.startedAt.toISOString(),
              endedAt: (
                impersonation.endedAt ?? impersonation.endsAt
              ).toISOString(),
            })),
        };
      }),
    };
  }

  /** Runout at a glance. */
  async totals(): Promise<Totals> {
    const now = this.clock.now().getTime();
    const since = (days: number) => new Date(now - days * DAY);
    const [
      [counts],
      pending,
      [{ hands: handCount }],
      [{ ranges: rangeCount }],
      [roomCounts],
    ] = await Promise.all([
      this.db
        .select({
          accounts: sql<number>`count(*)::int`,
          activeLast7Days: sql<number>`count(*) filter (where ${identities.lastActiveAt} >= ${since(7)})::int`,
          activeLast30Days: sql<number>`count(*) filter (where ${identities.lastActiveAt} >= ${since(30)})::int`,
          suspended: sql<number>`count(*) filter (where ${identities.suspendedAt} is not null)::int`,
        })
        .from(identities)
        .where(isAccount),
      this.db
        .select({
          acceptedAt: invitations.acceptedAt,
          cancelledAt: invitations.cancelledAt,
          expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .where(
          and(isNull(invitations.acceptedAt), isNull(invitations.cancelledAt)),
        ),
      this.db.select({ hands: sql<number>`count(*)::int` }).from(hands),
      this.db.select({ ranges: sql<number>`count(*)::int` }).from(ranges),
      this.db
        .select({
          open: sql<number>`count(*) filter (where ${rooms.status} = 'open')::int`,
          closed: sql<number>`count(*) filter (where ${rooms.status} = 'closed')::int`,
        })
        .from(rooms),
    ]);
    const at = this.clock.now();
    return {
      ...counts,
      pendingInvitations: pending.filter(
        (row) => invitationStatus(row, at) === 'pending',
      ).length,
      hands: handCount,
      ranges: rangeCount,
      openRooms: roomCounts.open,
      closedRooms: roomCounts.closed,
    };
  }

  /**
   * Suspends an Account: every Sign-in it holds ends at once and it leaves
   * every open Room it is in as if Kicked. Nothing it owns is touched. Not for
   * an Administrator, oneself included: `cannot-suspend-administrator`.
   */
  async suspend(administrator: Identity, accountId: unknown): Promise<void> {
    const account = await this.account(accountId);
    if (this.identityService.isAdministrator(account.email)) {
      throw new Rejected('cannot-suspend-administrator');
    }
    if (account.suspendedAt !== null) return;
    // All in one go: suspended, signed out everywhere and out of its Rooms.
    const expelled = await this.db.transaction(async (tx) => {
      await tx
        .update(identities)
        .set({ suspendedAt: this.clock.now(), suspendedBy: administrator.id })
        .where(eq(identities.id, account.id));
      await this.identityService.endSignInsOf(tx, account.id);
      return this.rooms.expel(tx, account.id);
    });
    this.gateway.expelled(account.id, expelled);
  }

  /** Lifts a Suspension: the Account can sign in again, and finds everything as it was. */
  async lift(accountId: unknown): Promise<void> {
    const account = await this.account(accountId);
    await this.db
      .update(identities)
      .set({ suspendedAt: null, suspendedBy: null })
      .where(eq(identities.id, account.id));
  }

  /**
   * Starts an Impersonation of an Account: a Sign-in of its own for the
   * Administrator, which lasts an hour. Never of an Administrator
   * (`cannot-impersonate-administrator`) or a suspended Account.
   */
  async impersonate(
    administrator: Identity,
    accountId: unknown,
  ): Promise<SignedIn> {
    const account = await this.account(accountId);
    if (this.identityService.isAdministrator(account.email)) {
      throw new Rejected('cannot-impersonate-administrator');
    }
    if (account.suspendedAt !== null) throw new Rejected('account-suspended');
    const now = this.clock.now();
    const endsAt = new Date(now.getTime() + IMPERSONATION_LIFETIME_MS);
    const { token, impersonationId } = await this.db.transaction(async (tx) => {
      const [{ id }] = await tx
        .insert(impersonations)
        .values({
          administratorId: administrator.id,
          accountId: account.id,
          startedAt: now,
          endsAt,
        })
        .returning({ id: impersonations.id });
      return {
        impersonationId: id,
        token: await this.identityService.startImpersonationSession(
          tx,
          account.id,
          id,
        ),
      };
    });
    return {
      token,
      identity: await this.identityService.profile({
        id: account.id,
        displayName: account.displayName,
        impersonation: {
          id: impersonationId,
          administratorId: administrator.id,
          endsAt,
        },
      }),
    };
  }

  private async account(id: unknown): Promise<typeof identities.$inferSelect> {
    const [row] = isUuid(id)
      ? await this.db
          .select()
          .from(identities)
          .where(and(eq(identities.id, id), isAccount))
      : [];
    if (!row) throw new Rejected('not-found');
    return row;
  }
}

export function person(row: typeof identities.$inferSelect): PersonView {
  return { id: row.id, displayName: row.displayName, email: row.email };
}
