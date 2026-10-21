import { and, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { hands, libraryEntries, marks } from '../database/schema.js';
import type { PokerSite, Stake } from '../hands/hand.js';
import { Rejected } from '../rejection/rejection.js';

/**
 * Which Hands of a Library to look at. The list and the Results Graph read
 * the same one from the same query, so both describe the same Hands. Every
 * part left out matches every Hand; the parts combine.
 *
 * Query: `from` and `to` as ISO 8601 instants (the web turns the viewer's
 * local days into them; `to` is exclusive), `site`, `hero` and `stake`
 * repeated for each value allowed, `stake` written `limit:small:big:currency`,
 * and `marked=true`.
 */
export interface LibraryFilter {
  from: Date | null;
  to: Date | null;
  sites: string[];
  heroes: string[];
  stakes: Stake[];
  markedOnly: boolean;
}

/** What a Library holds to filter by, whatever the filter. */
export interface LibraryFilterOptions {
  sites: PokerSite[];
  heroes: string[];
  stakes: Stake[];
}

const LIMITS: ReadonlySet<string> = new Set([
  'no-limit',
  'pot-limit',
  'fixed-limit',
] satisfies Stake['limit'][]);

/** Reads a Library filter from a request's query; `invalid-library-filter` if it can't. */
export function parseLibraryFilter(
  query: Record<string, unknown>,
): LibraryFilter {
  const marked = single(query.marked);
  if (marked !== undefined && marked !== 'true' && marked !== 'false') {
    throw new Rejected('invalid-library-filter');
  }
  return {
    from: instant(query.from),
    to: instant(query.to),
    sites: list(query.site),
    heroes: list(query.hero),
    stakes: list(query.stake).map(stakeOf),
    markedOnly: marked === 'true',
  };
}

/** The Hands of `identityId`'s Library that the filter keeps, over `library_entries` joined to `hands`. */
export function libraryFilterWhere(
  identityId: string,
  filter: LibraryFilter,
): SQL {
  const conditions: (SQL | undefined)[] = [
    eq(libraryEntries.identityId, identityId),
  ];
  if (filter.from) conditions.push(gte(hands.playedAt, filter.from));
  if (filter.to) conditions.push(lt(hands.playedAt, filter.to));
  if (filter.sites.length > 0) {
    conditions.push(inArray(hands.site, filter.sites));
  }
  if (filter.heroes.length > 0) {
    conditions.push(inArray(hands.heroScreenName, filter.heroes));
  }
  if (filter.stakes.length > 0) {
    conditions.push(
      or(
        ...filter.stakes.map((stake) =>
          and(
            eq(stakeLimit, stake.limit),
            eq(hands.smallBlind, stake.smallBlind),
            eq(hands.bigBlind, stake.bigBlind),
            eq(hands.currency, stake.currency),
          ),
        ),
      ),
    );
  }
  if (filter.markedOnly) conditions.push(markedBy(identityId));
  return and(...conditions)!;
}

/** Whether `identityId` has Marked the row's Hand. */
export function markedBy(identityId: string): SQL {
  return sql`exists (select 1 from ${marks} where ${marks.identityId} = ${identityId} and ${marks.handId} = ${hands.id})`;
}

/** The Hand's limit, which only its content records. */
export const stakeLimit = sql<
  Stake['limit']
>`${hands.content} -> 'stake' ->> 'limit'`;

/** A Stake as the query writes it: `no-limit:5:10:EUR`. */
export function stakeKey(stake: Stake): string {
  return [stake.limit, stake.smallBlind, stake.bigBlind, stake.currency].join(
    ':',
  );
}

/** A query value given once or repeated, as a list. */
function list(raw: unknown): string[] {
  if (raw === undefined) return [];
  const values = Array.isArray(raw) ? (raw as unknown[]) : [raw];
  if (!values.every((value) => typeof value === 'string' && value !== '')) {
    throw new Rejected('invalid-library-filter');
  }
  return values as string[];
}

function single(raw: unknown): string | undefined {
  const values = list(raw);
  if (values.length > 1) throw new Rejected('invalid-library-filter');
  return values[0];
}

function instant(raw: unknown): Date | null {
  const value = single(raw);
  if (value === undefined) return null;
  // Only full ISO 8601 instants: a bare date would leave its time zone to the server.
  const date = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(value)
    ? new Date(value)
    : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Rejected('invalid-library-filter');
  }
  return date;
}

/** `no-limit:5:10:EUR` as a Stake. */
function stakeOf(value: string): Stake {
  const [limit, small, big, currency, ...rest] = value.split(':');
  const smallBlind = Number(small);
  const bigBlind = Number(big);
  if (
    rest.length > 0 ||
    !LIMITS.has(limit) ||
    !Number.isInteger(smallBlind) ||
    !Number.isInteger(bigBlind) ||
    !currency
  ) {
    throw new Rejected('invalid-library-filter');
  }
  return {
    limit: limit as Stake['limit'],
    smallBlind,
    bigBlind,
    currency,
  };
}
