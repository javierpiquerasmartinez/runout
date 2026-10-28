import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { ranges, rangeTagLinks } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import { Rejected } from '../rejection/rejection.js';

/**
 * Which of an Account's Ranges the Lab's list shows. Every part left out
 * matches every Range; the parts combine.
 *
 * Query: `tag` repeated with the id of each Lab Tag allowed (a Range carrying
 * any of them is kept), and `search` once with text a Range's name must
 * hold, ignoring case.
 */
export interface RangeFilter {
  /** Lab Tag ids: a Range carrying any of them is kept. Only the Account's own Tags match. */
  tags: string[];
  /** Text the name must hold, ignoring case; trimmed, and null when blank. */
  search: string | null;
}

/** Reads a Range filter from a request's query; `invalid-range-filter` if it can't. */
export function parseRangeFilter(query: Record<string, unknown>): RangeFilter {
  return {
    tags: list(query.tag).map(tagId),
    search: searchOf(query.search),
  };
}

/** The Ranges of `identityId` that the filter keeps, over `ranges`. */
export function rangeFilterWhere(identityId: string, filter: RangeFilter): SQL {
  const conditions: SQL[] = [eq(ranges.identityId, identityId)];
  if (filter.tags.length > 0) {
    conditions.push(
      sql`exists (select 1 from ${rangeTagLinks} where ${rangeTagLinks.rangeId} = ${ranges}.id and ${inArray(rangeTagLinks.tagId, filter.tags)})`,
    );
  }
  if (filter.search !== null) {
    // Not `like`, whose `%` and `_` would match more than was typed.
    conditions.push(
      sql`strpos(lower(${ranges.name}), lower(${filter.search})) > 0`,
    );
  }
  return and(...conditions)!;
}

/** A query value given once or repeated, as a list. */
function list(raw: unknown): string[] {
  if (raw === undefined) return [];
  const values = Array.isArray(raw) ? (raw as unknown[]) : [raw];
  if (!values.every((value) => typeof value === 'string' && value !== '')) {
    throw new Rejected('invalid-range-filter');
  }
  return values as string[];
}

/** The search, trimmed; null when left out or blank. Given more than once, `invalid-range-filter`. */
function searchOf(raw: unknown): string | null {
  if (raw === undefined) return null;
  if (typeof raw !== 'string') throw new Rejected('invalid-range-filter');
  return raw.trim() || null;
}

function tagId(value: string): string {
  if (!isUuid(value)) throw new Rejected('invalid-range-filter');
  return value;
}
