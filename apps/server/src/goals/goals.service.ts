import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { calendarDate } from '../calendar/calendar-date.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { goals } from '../database/schema.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';

/** A Goal as its owner sees it. */
export interface Goal {
  id: string;
  name: string;
  /** Empty when there is none. */
  description: string;
  target: number;
  currentValue: number;
  /** A calendar date, `YYYY-MM-DD`. */
  startDate: string;
  /** A calendar date, `YYYY-MM-DD`. */
  deadline: string;
  createdAt: Date;
}

/** An Account's Goals. */
export interface GoalList {
  goals: Goal[];
}

/** What creating a Goal sends. */
export interface GoalBody {
  name?: unknown;
  description?: unknown;
  target?: unknown;
  startDate?: unknown;
  deadline?: unknown;
}

/** How long a Goal's name may be, in characters, once trimmed. */
const MAX_NAME_LENGTH = 80;

/** How long a Goal's description may be, in characters, once trimmed. */
const MAX_DESCRIPTION_LENGTH = 500;

/** The largest a Target may be. */
const MAX_AMOUNT = 999_999_999;

const selection = {
  id: goals.id,
  name: goals.name,
  description: goals.description,
  target: goals.target,
  currentValue: goals.currentValue,
  startDate: goals.startDate,
  deadline: goals.deadline,
  createdAt: goals.createdAt,
};

/**
 * An Account's Goals. The server stores and validates them; what they amount
 * to on a given day is the browser's to work out, because "today" is its own.
 */
@Injectable()
export class GoalsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** All the Account's Goals, oldest first so that a list reads the same each time. */
  async list(account: Identity): Promise<GoalList> {
    const rows = await this.db
      .select(selection)
      .from(goals)
      .where(eq(goals.identityId, account.id))
      .orderBy(asc(goals.createdAt), asc(goals.id));
    return { goals: rows };
  }

  /** A new Goal, whose Current Value is 0 whatever the body says. */
  async create(account: Identity, body: GoalBody): Promise<Goal> {
    const name = nameOf(body.name);
    const description = descriptionOf(body.description);
    const target = targetOf(body.target);
    const startDate = calendarDate(body.startDate, 'invalid-goal-start-date');
    const deadline = calendarDate(body.deadline, 'invalid-goal-deadline');
    if (deadline < startDate) throw new Rejected('goal-deadline-before-start');
    const now = this.clock.now();
    const [created] = await this.db
      .insert(goals)
      .values({
        identityId: account.id,
        name,
        description,
        target,
        startDate,
        deadline,
        createdAt: now,
        updatedAt: now,
      })
      .returning(selection);
    return created;
  }
}

/**
 * A Goal's Target: a number above 0, up to `MAX_AMOUNT`, with at most two
 * decimals; `invalid-goal-target` otherwise. The decimals are read from how
 * the number is written, where multiplying by 100 would add binary error.
 */
function targetOf(raw: unknown): number {
  if (
    typeof raw !== 'number' ||
    raw <= 0 ||
    raw > MAX_AMOUNT ||
    !/^\d+(\.\d{1,2})?$/.test(String(raw))
  ) {
    throw new Rejected('invalid-goal-target');
  }
  return raw;
}

/** A Goal's name, trimmed; `invalid-goal-name` when empty or too long. */
function nameOf(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name === '' || name.length > MAX_NAME_LENGTH) {
    throw new Rejected('invalid-goal-name');
  }
  return name;
}

/**
 * A Goal's description, trimmed, and empty when left out;
 * `invalid-goal-description` when too long or not text.
 */
function descriptionOf(raw: unknown): string {
  if (raw === undefined) return '';
  if (typeof raw !== 'string') throw new Rejected('invalid-goal-description');
  const description = raw.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Rejected('invalid-goal-description');
  }
  return description;
}
