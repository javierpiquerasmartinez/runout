import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { libraryEntries, tagLinks, tags } from '../database/schema.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { handSelection } from './library-hand.js';

/** A Tag as its owner sees it: with how many Hands of their Library carry it. */
export interface Tag {
  id: string;
  name: string;
  hands: number;
}

/** Which Hands now carry a Tag, or no longer do, as the person set it. */
export interface TagChange {
  tagId: string;
  handIds: string[];
  attached: boolean;
}

/** How long a Tag's name may be, in characters, once trimmed. */
const MAX_NAME_LENGTH = 40;

/**
 * An Account's Tags: its own way of classifying the Hands of its Library.
 * Nobody else ever sees them, even on a Hand they have too.
 */
@Injectable()
export class TagsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The Account's Tags, sorted by name ignoring case, each with its count. */
  async list(account: Identity): Promise<Tag[]> {
    return this.db
      .select({
        id: tags.id,
        name: tags.name,
        hands: count(tagLinks.handId),
      })
      .from(tags)
      .leftJoin(tagLinks, eq(tagLinks.tagId, tags.id))
      .where(eq(tags.identityId, account.id))
      .groupBy(tags.id)
      .orderBy(asc(sql`lower(${tags.name})`), asc(tags.name));
  }

  /** A new Tag; `tag-name-taken` if the Account has one by that name, whatever its case. */
  async create(account: Identity, name: unknown): Promise<Tag> {
    const [created] = await this.db
      .insert(tags)
      .values({
        identityId: account.id,
        name: nameOf(name),
        createdAt: this.clock.now(),
      })
      .onConflictDoNothing()
      .returning({ id: tags.id, name: tags.name });
    if (!created) throw new Rejected('tag-name-taken');
    return { ...created, hands: 0 };
  }

  /** Renames one of the Account's Tags; its Hands keep it. */
  async rename(account: Identity, tagId: string, name: unknown): Promise<Tag> {
    const newName = nameOf(name);
    if (!isUuid(tagId)) throw new Rejected('tag-not-found');
    let renamed: { id: string; name: string } | undefined;
    try {
      [renamed] = await this.db
        .update(tags)
        .set({ name: newName })
        .where(and(eq(tags.id, tagId), eq(tags.identityId, account.id)))
        .returning({ id: tags.id, name: tags.name });
    } catch (error) {
      // An update can't skip a clash the way an insert does.
      if (isUniqueViolation(error)) throw new Rejected('tag-name-taken');
      throw error;
    }
    if (!renamed) throw new Rejected('tag-not-found');
    const [{ hands }] = await this.db
      .select({ hands: count() })
      .from(tagLinks)
      .where(eq(tagLinks.tagId, tagId));
    return { ...renamed, hands };
  }

  /** Deletes one of the Account's Tags, taking it off every Hand. */
  async delete(account: Identity, tagId: string): Promise<void> {
    await this.owned(account, tagId);
    await this.db.delete(tags).where(eq(tags.id, tagId));
  }

  /**
   * Puts the Tag on the Hands, or takes it off. Every Hand must be in the
   * Account's Library, or nothing changes: `hand-not-found`.
   */
  async set(
    account: Identity,
    tagId: string,
    handIds: unknown,
    attached: boolean,
  ): Promise<TagChange> {
    const ids = handSelection(handIds, 'invalid-tag-hands');
    await this.owned(account, tagId);
    const held = await this.db
      .select({ handId: libraryEntries.handId })
      .from(libraryEntries)
      .where(
        and(
          eq(libraryEntries.identityId, account.id),
          inArray(libraryEntries.handId, ids),
        ),
      );
    if (held.length !== ids.length) throw new Rejected('hand-not-found');
    if (attached) {
      await this.db
        .insert(tagLinks)
        .values(
          ids.map((handId) => ({ tagId, identityId: account.id, handId })),
        )
        .onConflictDoNothing();
    } else {
      await this.db
        .delete(tagLinks)
        .where(and(eq(tagLinks.tagId, tagId), inArray(tagLinks.handId, ids)));
    }
    return { tagId, handIds: ids, attached };
  }

  /** Throws `tag-not-found` unless the Tag is the Account's. */
  private async owned(account: Identity, tagId: string): Promise<void> {
    if (!isUuid(tagId)) throw new Rejected('tag-not-found');
    const [row] = await this.db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.identityId, account.id)));
    if (!row) throw new Rejected('tag-not-found');
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
