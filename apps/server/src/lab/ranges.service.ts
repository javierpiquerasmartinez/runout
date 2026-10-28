import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { ranges } from '../database/schema.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { COMBOS, type Combos } from './combos.js';

/** A Range as its owner opens it. */
export interface Range {
  id: string;
  name: string;
  combos: Combos;
}

/** A Range as the Lab's list shows it: how wide it is, without its Combos. */
export interface RangeSummary {
  id: string;
  name: string;
  /** Combos held, each counted by its Frequency: AKo at 50 % is 6. */
  comboCount: number;
  /** That, as a share of all 1326 Combos, from 0 to 100. */
  percent: number;
}

/** What a save sends: the name and the Combos. */
export interface RangeBody {
  name?: unknown;
  combos?: unknown;
}

/** How long a Range's name may be, in characters, once trimmed. */
const MAX_NAME_LENGTH = 60;

const selection = { id: ranges.id, name: ranges.name, combos: ranges.combos };

/**
 * An Account's Ranges, kept in its Lab. Nobody else ever sees them: another
 * Account is told a Range of someone else's is not there.
 */
@Injectable()
export class RangesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The Account's Ranges, sorted by name ignoring case. */
  async list(account: Identity): Promise<RangeSummary[]> {
    const rows = await this.db
      .select(selection)
      .from(ranges)
      .where(eq(ranges.identityId, account.id))
      .orderBy(asc(sql`lower(${ranges.name})`), asc(ranges.name));
    return rows.map(({ id, name, combos }) => {
      const comboCount = weightedCount(combos);
      return {
        id,
        name,
        comboCount,
        percent: (comboCount / COMBOS.size) * 100,
      };
    });
  }

  /** One of the Account's Ranges; `range-not-found` for anyone else's. */
  async get(account: Identity, rangeId: string): Promise<Range> {
    if (!isUuid(rangeId)) throw new Rejected('range-not-found');
    const [row] = await this.db
      .select(selection)
      .from(ranges)
      .where(and(eq(ranges.id, rangeId), eq(ranges.identityId, account.id)));
    if (!row) throw new Rejected('range-not-found');
    return row;
  }

  /** A new Range; `range-name-taken` if the Account has one by that name, whatever its case. */
  async create(account: Identity, body: RangeBody): Promise<Range> {
    const name = nameOf(body.name);
    const combos = combosOf(body.combos);
    const now = this.clock.now();
    const [created] = await this.db
      .insert(ranges)
      .values({
        identityId: account.id,
        name,
        combos,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning(selection);
    if (!created) throw new Rejected('range-name-taken');
    return created;
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
    let saved: Range | undefined;
    try {
      [saved] = await this.db
        .update(ranges)
        .set({ name, combos, updatedAt: this.clock.now() })
        .where(and(eq(ranges.id, rangeId), eq(ranges.identityId, account.id)))
        .returning(selection);
    } catch (error) {
      // An update can't skip a clash the way an insert does.
      if (isUniqueViolation(error)) throw new Rejected('range-name-taken');
      throw error;
    }
    if (!saved) throw new Rejected('range-not-found');
    return saved;
  }
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
