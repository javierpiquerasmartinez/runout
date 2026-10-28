import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { labTags, rangeTagLinks } from '../database/schema.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';

/** A Lab Tag as its owner sees it: with how many of their Ranges carry it. */
export interface LabTag {
  id: string;
  name: string;
  ranges: number;
}

/** A Lab Tag as a Range carries it. */
export type RangeTag = Pick<LabTag, 'id' | 'name'>;

/** How long a Tag's name may be, in characters, once trimmed, as in the Library. */
const MAX_NAME_LENGTH = 40;

/**
 * An Account's Lab Tags: its own way of grouping the Ranges of its Lab, a set
 * apart from the Library's Tags. Nobody else ever sees them.
 */
@Injectable()
export class LabTagsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The Account's Lab Tags, sorted by name ignoring case, each with its count. */
  async list(account: Identity): Promise<LabTag[]> {
    return this.db
      .select({
        id: labTags.id,
        name: labTags.name,
        ranges: count(rangeTagLinks.rangeId),
      })
      .from(labTags)
      .leftJoin(rangeTagLinks, eq(rangeTagLinks.tagId, labTags.id))
      .where(eq(labTags.identityId, account.id))
      .groupBy(labTags.id)
      .orderBy(asc(sql`lower(${labTags.name})`), asc(labTags.name));
  }

  /** A new Lab Tag; `tag-name-taken` if the Account has one by that name, whatever its case. */
  async create(account: Identity, name: unknown): Promise<LabTag> {
    const [created] = await this.db
      .insert(labTags)
      .values({
        identityId: account.id,
        name: nameOf(name),
        createdAt: this.clock.now(),
      })
      .onConflictDoNothing()
      .returning({ id: labTags.id, name: labTags.name });
    if (!created) throw new Rejected('tag-name-taken');
    return { ...created, ranges: 0 };
  }

  /** Renames one of the Account's Lab Tags; its Ranges keep it. */
  async rename(
    account: Identity,
    tagId: string,
    name: unknown,
  ): Promise<LabTag> {
    const newName = nameOf(name);
    if (!isUuid(tagId)) throw new Rejected('tag-not-found');
    let renamed: RangeTag | undefined;
    try {
      [renamed] = await this.db
        .update(labTags)
        .set({ name: newName })
        .where(and(eq(labTags.id, tagId), eq(labTags.identityId, account.id)))
        .returning({ id: labTags.id, name: labTags.name });
    } catch (error) {
      // An update can't skip a clash the way an insert does.
      if (isUniqueViolation(error)) throw new Rejected('tag-name-taken');
      throw error;
    }
    if (!renamed) throw new Rejected('tag-not-found');
    const [{ ranges }] = await this.db
      .select({ ranges: count() })
      .from(rangeTagLinks)
      .where(eq(rangeTagLinks.tagId, tagId));
    return { ...renamed, ranges };
  }

  /** Deletes one of the Account's Lab Tags, taking it off every Range. */
  async delete(account: Identity, tagId: string): Promise<void> {
    if (!isUuid(tagId)) throw new Rejected('tag-not-found');
    const deleted = await this.db
      .delete(labTags)
      .where(and(eq(labTags.id, tagId), eq(labTags.identityId, account.id)))
      .returning({ id: labTags.id });
    if (deleted.length === 0) throw new Rejected('tag-not-found');
  }

  /**
   * The Tag ids a Range is saved with, without repeats, when every one is a
   * Lab Tag of the Account's. Not a list of text: `invalid-range-tags`; any
   * id that isn't one of its Lab Tags: `tag-not-found`.
   */
  async owned(account: Identity, raw: unknown): Promise<string[]> {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || !raw.every((id) => typeof id === 'string')) {
      throw new Rejected('invalid-range-tags');
    }
    const ids = [...new Set(raw as string[])];
    if (ids.length === 0) return ids;
    if (!ids.every(isUuid)) throw new Rejected('tag-not-found');
    const held = await this.db
      .select({ id: labTags.id })
      .from(labTags)
      .where(and(eq(labTags.identityId, account.id), inArray(labTags.id, ids)));
    if (held.length !== ids.length) throw new Rejected('tag-not-found');
    return ids;
  }
}

/** A Tag's name, trimmed; `invalid-tag-name` when empty or too long. */
function nameOf(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name === '' || name.length > MAX_NAME_LENGTH) {
    throw new Rejected('invalid-tag-name');
  }
  return name;
}
