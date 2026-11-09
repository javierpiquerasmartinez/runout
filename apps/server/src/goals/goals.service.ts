import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { calendarDate } from '../calendar/calendar-date.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { goals } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
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

/** What changing a Goal sends: whichever of its fields are to change. */
export interface GoalChange extends GoalBody {
  currentValue?: unknown;
}

/** How long a Goal's name may be, in characters, once trimmed. */
const MAX_NAME_LENGTH = 80;

/** How long a Goal's description may be, in characters, once trimmed. */
const MAX_DESCRIPTION_LENGTH = 500;

/** The largest a Target or a Current Value may be. */
const MAX_GOAL_NUMBER = 999_999_999;

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
 * An Account's Goals. The server stores and validates them; what they come
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

  /**
   * Changes whichever fields of a Goal are sent, with their rules; the rest
   * stay as they were. The dates are checked against the Goal as it would end
   * up, in the same statement that writes them. Another Account's Goal is
   * `goal-not-found`, even when the change is refused: only a refused change
   * costs a second read.
   */
  async change(
    account: Identity,
    goalId: string,
    body: GoalChange,
  ): Promise<Goal> {
    const owned = ownedBy(account, goalId);
    let changes: GoalFields;
    try {
      changes = changesOf(body);
    } catch (refused) {
      // Not being there wins over a refused body.
      if (!(await this.exists(owned))) throw new Rejected('goal-not-found');
      throw refused;
    }
    const [changed] = await this.db
      .update(goals)
      .set({ ...changes, updatedAt: this.clock.now() })
      .where(and(owned, keepsAPeriod(changes)))
      .returning(selection);
    if (changed) return changed;
    throw new Rejected(
      (await this.exists(owned))
        ? 'goal-deadline-before-start'
        : 'goal-not-found',
    );
  }

  /** Deletes a Goal, for good; `goal-not-found` for anyone else's. */
  async delete(account: Identity, goalId: string): Promise<void> {
    const deleted = await this.db
      .delete(goals)
      .where(ownedBy(account, goalId))
      .returning({ id: goals.id });
    if (deleted.length === 0) throw new Rejected('goal-not-found');
  }

  private async exists(owned: SQL | undefined): Promise<boolean> {
    const [found] = await this.db
      .select({ id: goals.id })
      .from(goals)
      .where(owned);
    return found !== undefined;
  }
}

/** The fields of a Goal a change can set. */
type GoalFields = Partial<
  Pick<
    Goal,
    | 'name'
    | 'description'
    | 'target'
    | 'currentValue'
    | 'startDate'
    | 'deadline'
  >
>;

/**
 * Picks out the Goal with this id among the Account's own; `goal-not-found`
 * when the id can't be any Goal's.
 */
function ownedBy(account: Identity, goalId: string): SQL | undefined {
  if (!isUuid(goalId)) throw new Rejected('goal-not-found');
  return and(eq(goals.id, goalId), eq(goals.identityId, account.id));
}

/** Whichever fields a change sends, each checked with its own rules. */
function changesOf(body: GoalChange): GoalFields {
  const changes: GoalFields = {};
  if (body.name !== undefined) changes.name = nameOf(body.name);
  if (body.description !== undefined) {
    changes.description = descriptionOf(body.description);
  }
  if (body.target !== undefined) changes.target = targetOf(body.target);
  if (body.currentValue !== undefined) {
    changes.currentValue = currentValueOf(body.currentValue);
  }
  if (body.startDate !== undefined) {
    changes.startDate = calendarDate(body.startDate, 'invalid-goal-start-date');
  }
  if (body.deadline !== undefined) {
    changes.deadline = calendarDate(body.deadline, 'invalid-goal-deadline');
  }
  return changes;
}

/** Whether a Goal would still have a real period once these changes are made. */
function keepsAPeriod({ startDate, deadline }: GoalFields): SQL {
  return sql`${startDate ?? goals.startDate}::date <= ${deadline ?? goals.deadline}::date`;
}

/**
 * Whether this can be a Goal number, a Target or a Current Value: from 0 to
 * `MAX_GOAL_NUMBER` with at most two decimals. The decimals are read from how
 * the number is written, where multiplying by 100 would add binary error.
 */
function isGoalNumber(raw: unknown): raw is number {
  return (
    typeof raw === 'number' &&
    raw <= MAX_GOAL_NUMBER &&
    /^\d+(\.\d{1,2})?$/.test(String(raw))
  );
}

/** A Goal's Target: a Goal number above 0; `invalid-goal-target` otherwise. */
function targetOf(raw: unknown): number {
  if (!isGoalNumber(raw) || raw <= 0) throw new Rejected('invalid-goal-target');
  return raw;
}

/** A Goal's Current Value; `invalid-goal-current-value` when it can't be one. */
function currentValueOf(raw: unknown): number {
  if (!isGoalNumber(raw)) throw new Rejected('invalid-goal-current-value');
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
