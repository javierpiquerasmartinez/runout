import { desc, sql, type SQL } from 'drizzle-orm';
import { hands } from '../database/schema.js';
import { Rejected } from '../rejection/rejection.js';

/**
 * The order of a Library's list: by one column, either way. Result and the
 * final pot go by big blinds, so Hands at different Stakes and currencies compare;
 * Stake goes by its big blind, whatever the currency. Hands that tie go
 * newest first, whichever the direction.
 *
 * Query: `sort` (`date`, `result`, `pot` or `stake`; `date` if left out)
 * and `dir` (`desc` or `asc`; `desc` if left out).
 */
export interface LibrarySort {
  by: LibrarySortColumn;
  dir: 'desc' | 'asc';
}

export type LibrarySortColumn = 'date' | 'result' | 'pot' | 'stake';

const COLUMNS: ReadonlySet<string> = new Set([
  'date',
  'result',
  'pot',
  'stake',
] satisfies LibrarySortColumn[]);

/** Reads a Library sort from a request's query; `invalid-library-sort` if it can't. */
export function parseLibrarySort(query: Record<string, unknown>): LibrarySort {
  const by = single(query.sort) ?? 'date';
  const dir = single(query.dir) ?? 'desc';
  if (!COLUMNS.has(by) || (dir !== 'desc' && dir !== 'asc')) {
    throw new Rejected('invalid-library-sort');
  }
  return { by: by as LibrarySortColumn, dir };
}

/** The `order by` of the sort, over `hands`, ties broken newest first. */
export function librarySortOrder(sort: LibrarySort): SQL[] {
  const direction = sort.dir === 'desc' ? sql`desc` : sql`asc`;
  return [
    sql`${KEYS[sort.by]} ${direction}`,
    desc(hands.playedAt),
    desc(hands.id),
  ];
}

const KEYS: Record<LibrarySortColumn, SQL> = {
  date: sql`${hands.playedAt}`,
  result: sql`${hands.heroResult}::numeric / ${hands.bigBlind}`,
  pot: sql`${hands.finalPot}::numeric / ${hands.bigBlind}`,
  stake: sql`${hands.bigBlind}`,
};

function single(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') throw new Rejected('invalid-library-sort');
  return raw;
}
