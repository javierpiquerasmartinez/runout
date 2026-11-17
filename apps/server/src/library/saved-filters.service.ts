import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { savedFilters } from '../database/schema.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import {
  readSavedCriteria,
  savedCriteriaOf,
  storedCriteria,
  type SavedCriteria,
  type StoredCriteria,
} from './saved-filter-criteria.js';

/**
 * A Saved Filter as its owner sees it. `dropped` counts the criteria it held
 * on facts or Stats the Library no longer knows, left out of `criteria`.
 */
export interface SavedFilter {
  id: string;
  name: string;
  criteria: SavedCriteria;
  dropped: number;
}

/** How long a Saved Filter's name may be, in characters, once trimmed. */
const MAX_NAME_LENGTH = 40;

const columns = {
  id: savedFilters.id,
  name: savedFilters.name,
  criteria: savedFilters.criteria,
};

/**
 * An Account's Saved Filters, kept from the Library. Nobody else ever sees
 * them; Impersonation acts as the Account.
 */
@Injectable()
export class SavedFiltersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The Account's Saved Filters, sorted by name ignoring case. */
  async list(account: Identity): Promise<SavedFilter[]> {
    const rows = await this.db
      .select(columns)
      .from(savedFilters)
      .where(eq(savedFilters.identityId, account.id))
      .orderBy(asc(sql`lower(${savedFilters.name})`), asc(savedFilters.name));
    return rows.map(savedFilter);
  }

  /** A new Saved Filter; `saved-filter-name-taken` if the Account has one by that name, whatever its case. */
  async create(
    account: Identity,
    name: unknown,
    criteria: unknown,
  ): Promise<SavedFilter> {
    const values = {
      identityId: account.id,
      name: nameOf(name),
      criteria: storedCriteria(savedCriteriaOf(criteria)),
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    };
    const [created] = await this.db
      .insert(savedFilters)
      .values(values)
      .onConflictDoNothing()
      .returning(columns);
    if (!created) throw new Rejected('saved-filter-name-taken');
    return savedFilter(created);
  }

  /** Renames one of the Account's Saved Filters; its criteria stay. */
  async rename(
    account: Identity,
    id: string,
    name: unknown,
  ): Promise<SavedFilter> {
    return this.change(account, id, { name: nameOf(name) });
  }

  /** Puts new criteria in one of the Account's Saved Filters, under the same name. */
  async replace(
    account: Identity,
    id: string,
    criteria: unknown,
  ): Promise<SavedFilter> {
    return this.change(account, id, {
      criteria: storedCriteria(savedCriteriaOf(criteria)),
    });
  }

  /** Deletes one of the Account's Saved Filters. */
  async delete(account: Identity, id: string): Promise<void> {
    if (!isUuid(id)) throw new Rejected('saved-filter-not-found');
    const deleted = await this.db
      .delete(savedFilters)
      .where(
        and(eq(savedFilters.id, id), eq(savedFilters.identityId, account.id)),
      )
      .returning({ id: savedFilters.id });
    if (deleted.length === 0) throw new Rejected('saved-filter-not-found');
  }

  private async change(
    account: Identity,
    id: string,
    set: { name?: string; criteria?: StoredCriteria },
  ): Promise<SavedFilter> {
    if (!isUuid(id)) throw new Rejected('saved-filter-not-found');
    let changed: typeof savedFilters.$inferSelect | undefined;
    try {
      [changed] = await this.db
        .update(savedFilters)
        .set({ ...set, updatedAt: this.clock.now() })
        .where(
          and(eq(savedFilters.id, id), eq(savedFilters.identityId, account.id)),
        )
        .returning();
    } catch (error) {
      // An update can't skip a clash the way an insert does.
      if (isUniqueViolation(error)) {
        throw new Rejected('saved-filter-name-taken');
      }
      throw error;
    }
    if (!changed) throw new Rejected('saved-filter-not-found');
    return savedFilter(changed);
  }
}

function savedFilter(row: {
  id: string;
  name: string;
  criteria: StoredCriteria;
}): SavedFilter {
  return { id: row.id, name: row.name, ...readSavedCriteria(row.criteria) };
}

/** A Saved Filter's name, trimmed; `invalid-saved-filter-name` when empty or too long. */
function nameOf(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name === '' || name.length > MAX_NAME_LENGTH) {
    throw new Rejected('invalid-saved-filter-name');
  }
  return name;
}
