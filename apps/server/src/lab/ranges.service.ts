import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../database/database.js';
import { labTags, ranges, rangeTagLinks } from '../database/schema.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { isUuid } from '../database/uuid.js';
import type { Identity, Preferences } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { COMBOS, type Combos } from './combos.js';
import { LabTagsService, type RangeTag } from './lab-tags.service.js';

/** A Range as its owner opens it. */
export interface Range {
  id: string;
  name: string;
  combos: Combos;
  /** Its Lab Tags, sorted by name ignoring case. */
  tags: RangeTag[];
}

/** A Range as the Lab's list shows it: how wide it is, without its Combos. */
export interface RangeSummary {
  id: string;
  name: string;
  /** Combos held, each counted by its Frequency: AKo at 50 % is 6. */
  comboCount: number;
  /** That, as a share of all 1326 Combos, from 0 to 100. */
  percent: number;
  tags: RangeTag[];
}

/** What a save sends: the name, the Combos and the ids of its Lab Tags (none if left out). */
export interface RangeBody {
  name?: unknown;
  combos?: unknown;
  tagIds?: unknown;
}

/** How long a Range's name may be, in characters, once trimmed. */
const MAX_NAME_LENGTH = 60;

/** The word a copy's name ends in, in the Account's language. */
const COPY_WORD: Record<Preferences['language'], string> = {
  es: 'copia',
  en: 'copy',
};

/**
 * The Lab Tags on the Range of the row being read, sorted by name ignoring
 * case. The Range's id is written with its table: a select from `ranges`
 * alone leaves its columns bare, and a bare `id` here would be the Tag's.
 */
const tagsOnRange = sql<RangeTag[]>`(
  select coalesce(
    json_agg(json_build_object('id', ${labTags.id}, 'name', ${labTags.name})
      order by lower(${labTags.name}), ${labTags.name}),
    '[]'::json)
  from ${rangeTagLinks}
  inner join ${labTags} on ${labTags.id} = ${rangeTagLinks.tagId}
  where ${rangeTagLinks.rangeId} = ${ranges}.id
)`;

const selection = {
  id: ranges.id,
  name: ranges.name,
  combos: ranges.combos,
  tags: tagsOnRange,
};

/**
 * An Account's Ranges, kept in its Lab. Nobody else ever sees them: another
 * Account is told a Range of someone else's is not there.
 */
@Injectable()
export class RangesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tags: LabTagsService,
  ) {}

  /** The Account's Ranges, sorted by name ignoring case. */
  async list(account: Identity): Promise<RangeSummary[]> {
    const rows = await this.db
      .select(selection)
      .from(ranges)
      .where(eq(ranges.identityId, account.id))
      .orderBy(asc(sql`lower(${ranges.name})`), asc(ranges.name));
    return rows.map(({ id, name, combos, tags }) => {
      const comboCount = weightedCount(combos);
      return {
        id,
        name,
        comboCount,
        percent: (comboCount / COMBOS.size) * 100,
        tags,
      };
    });
  }

  /** One of the Account's Ranges; `range-not-found` for anyone else's. */
  async get(account: Identity, rangeId: string): Promise<Range> {
    if (!isUuid(rangeId)) throw new Rejected('range-not-found');
    return read(this.db, account, rangeId);
  }

  /** A new Range; `range-name-taken` if the Account has one by that name, whatever its case. */
  async create(account: Identity, body: RangeBody): Promise<Range> {
    const name = nameOf(body.name);
    const combos = combosOf(body.combos);
    const tagIds = await this.tags.owned(account, body.tagIds);
    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(ranges)
        .values({
          identityId: account.id,
          name,
          combos,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: ranges.id });
      if (!created) throw new Rejected('range-name-taken');
      await link(tx, created.id, tagIds);
      return read(tx, account, created.id);
    });
  }

  /** Saves one of the Account's Ranges over what it held. */
  async save(
    account: Identity,
    rangeId: string,
    body: RangeBody,
  ): Promise<Range> {
    await this.get(account, rangeId);
    const name = nameOf(body.name);
    const combos = combosOf(body.combos);
    const tagIds = await this.tags.owned(account, body.tagIds);
    try {
      return await this.db.transaction(async (tx) => {
        const [saved] = await tx
          .update(ranges)
          .set({ name, combos, updatedAt: this.clock.now() })
          .where(and(eq(ranges.id, rangeId), eq(ranges.identityId, account.id)))
          .returning({ id: ranges.id });
        if (!saved) throw new Rejected('range-not-found');
        await tx
          .delete(rangeTagLinks)
          .where(eq(rangeTagLinks.rangeId, rangeId));
        await link(tx, rangeId, tagIds);
        return read(tx, account, rangeId);
      });
    } catch (error) {
      // An update can't skip a clash the way an insert does.
      if (isUniqueViolation(error)) throw new Rejected('range-name-taken');
      throw error;
    }
  }

  /**
   * A copy of one of the Account's Ranges, with its Combos and Tags, named after it
   * with the first free "(copia)", "(copia 2)", … in `language`.
   */
  async duplicate(
    account: Identity,
    rangeId: string,
    language: Preferences['language'],
  ): Promise<Range> {
    const original = await this.get(account, rangeId);
    const held = await this.db
      .select({ name: ranges.name })
      .from(ranges)
      .where(eq(ranges.identityId, account.id));
    const taken = new Set(held.map(({ name }) => name.toLowerCase()));
    const now = this.clock.now();
    for (let n = 1; ; n++) {
      const name = copyName(original.name, COPY_WORD[language], n);
      if (taken.has(name.toLowerCase())) continue;
      const copy = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(ranges)
          .values({
            identityId: account.id,
            name,
            combos: original.combos,
            createdAt: now,
            updatedAt: now,
          })
          // Taken meanwhile: on to the next number.
          .onConflictDoNothing()
          .returning({ id: ranges.id });
        if (!created) return undefined;
        await link(
          tx,
          created.id,
          original.tags.map(({ id }) => id),
        );
        return read(tx, account, created.id);
      });
      if (copy) return copy;
    }
  }

  /** Deletes one of the Account's Ranges. */
  async delete(account: Identity, rangeId: string): Promise<void> {
    await this.get(account, rangeId);
    await this.db
      .delete(ranges)
      .where(and(eq(ranges.id, rangeId), eq(ranges.identityId, account.id)));
  }
}

/** The Account's Range by its id, with its Tags; `range-not-found` if it isn't there. */
async function read(
  db: Database | Transaction,
  account: Identity,
  rangeId: string,
): Promise<Range> {
  const [row] = await db
    .select(selection)
    .from(ranges)
    .where(and(eq(ranges.id, rangeId), eq(ranges.identityId, account.id)));
  if (!row) throw new Rejected('range-not-found');
  return row;
}

/** Puts the Lab Tags on the Range. */
async function link(
  tx: Transaction,
  rangeId: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  await tx
    .insert(rangeTagLinks)
    .values(tagIds.map((tagId) => ({ rangeId, tagId })));
}

/**
 * The `n`th copy's name, "<name> (copia)" then "(copia 2)", with `name` cut
 * short when that would pass the longest name allowed.
 */
function copyName(name: string, word: string, n: number): string {
  const suffix = n === 1 ? ` (${word})` : ` (${word} ${n})`;
  return name.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd() + suffix;
}

/** A Range's name, trimmed; `invalid-range-name` when empty or too long. */
function nameOf(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name === '' || name.length > MAX_NAME_LENGTH) {
    throw new Rejected('invalid-range-name');
  }
  return name;
}

/**
 * The Combos as sent, when every key is a Combo written the Lab's way and
 * every value a whole number from 1 to 100; `invalid-range-combos` otherwise,
 * for the whole map.
 */
function combosOf(raw: unknown): Combos {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Rejected('invalid-range-combos');
  }
  const combos: Combos = {};
  for (const [combo, frequency] of Object.entries(raw)) {
    if (
      !COMBOS.has(combo) ||
      !Number.isInteger(frequency) ||
      (frequency as number) < 1 ||
      (frequency as number) > 100
    ) {
      throw new Rejected('invalid-range-combos');
    }
    combos[combo] = frequency as number;
  }
  return combos;
}

/** Combos held, each counted by its Frequency. */
function weightedCount(combos: Combos): number {
  return (
    Object.values(combos).reduce((sum, frequency) => sum + frequency, 0) / 100
  );
}
