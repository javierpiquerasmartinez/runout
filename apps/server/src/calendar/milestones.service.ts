import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { isUuid } from '../database/uuid.js';
import { milestones } from '../database/schema.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { calendarDate, type CalendarSpan } from './calendar-date.js';

/** A Milestone as its owner sees it. */
export interface Milestone {
  id: string;
  title: string;
  /** Empty when there is none. */
  description: string;
  /** A calendar date, `YYYY-MM-DD`. */
  date: string;
  done: boolean;
  createdAt: Date;
}

/** The Milestones of a span. */
export interface MilestoneList {
  milestones: Milestone[];
}

/** What creating a Milestone sends. */
export interface MilestoneBody {
  title?: unknown;
  description?: unknown;
  date?: unknown;
}

/** What changing a Milestone sends: whichever of its fields change. */
export interface MilestoneChange extends MilestoneBody {
  done?: unknown;
}

/** How long a Milestone's title may be, in characters, once trimmed. */
const MAX_TITLE_LENGTH = 80;

/** How long a Milestone's description may be, in characters, once trimmed. */
const MAX_DESCRIPTION_LENGTH = 500;

const selection = {
  id: milestones.id,
  title: milestones.title,
  description: milestones.description,
  date: milestones.date,
  done: milestones.done,
  createdAt: milestones.createdAt,
};

/**
 * An Account's Milestones, kept in its Calendar. Nobody else ever sees them:
 * another Account is told a Milestone of someone else's is not there.
 */
@Injectable()
export class MilestonesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * The Account's Milestones dated within the span, both ends included, in
   * the order of a day: by date, pending before done, then by creation.
   */
  async list(account: Identity, span: CalendarSpan): Promise<MilestoneList> {
    const rows = await this.db
      .select(selection)
      .from(milestones)
      .where(
        and(
          eq(milestones.identityId, account.id),
          gte(milestones.date, span.from),
          lte(milestones.date, span.to),
        ),
      )
      .orderBy(
        asc(milestones.date),
        asc(milestones.done),
        asc(milestones.createdAt),
        asc(milestones.id),
      );
    return { milestones: rows };
  }

  /** A new Milestone on its date, not done. */
  async create(account: Identity, body: MilestoneBody): Promise<Milestone> {
    const title = titleOf(body.title);
    const description = descriptionOf(body.description);
    const date = calendarDate(body.date, 'invalid-milestone-date');
    const now = this.clock.now();
    const [created] = await this.db
      .insert(milestones)
      .values({
        identityId: account.id,
        title,
        description,
        date,
        createdAt: now,
        updatedAt: now,
      })
      .returning(selection);
    return created;
  }

  /**
   * Changes whichever of a Milestone's title, description, date and done are
   * sent, with the rules of creating; the rest stay as they were. Another
   * Account's Milestone is `milestone-not-found`, even when the body is
   * refused: only a refused body costs a second read.
   */
  async change(
    account: Identity,
    milestoneId: string,
    body: MilestoneChange,
  ): Promise<Milestone> {
    const owned = ownedBy(account, milestoneId);
    let changes: MilestoneFields;
    try {
      changes = changesOf(body);
    } catch (refused) {
      // Not being there wins over a refused body.
      await this.get(account, milestoneId);
      throw refused;
    }
    const [changed] = await this.db
      .update(milestones)
      .set({ ...changes, updatedAt: this.clock.now() })
      .where(owned)
      .returning(selection);
    if (!changed) throw new Rejected('milestone-not-found');
    return changed;
  }

  /**
   * Deletes one of the Account's Milestones, with no undo. Another Account's,
   * or one already deleted, is `milestone-not-found`.
   */
  async delete(account: Identity, milestoneId: string): Promise<void> {
    const deleted = await this.db
      .delete(milestones)
      .where(ownedBy(account, milestoneId))
      .returning({ id: milestones.id });
    if (deleted.length === 0) throw new Rejected('milestone-not-found');
  }

  /** One of the Account's Milestones; `milestone-not-found` for anyone else's. */
  async get(account: Identity, milestoneId: string): Promise<Milestone> {
    const [row] = await this.db
      .select(selection)
      .from(milestones)
      .where(ownedBy(account, milestoneId));
    if (!row) throw new Rejected('milestone-not-found');
    return row;
  }
}

/** The fields of a Milestone a change can set. */
type MilestoneFields = Partial<
  Pick<Milestone, 'title' | 'description' | 'date' | 'done'>
>;

/**
 * Picks out the Milestone with this id among the Account's own;
 * `milestone-not-found` when the id can't be any Milestone's.
 */
function ownedBy(account: Identity, milestoneId: string): SQL | undefined {
  if (!isUuid(milestoneId)) throw new Rejected('milestone-not-found');
  return and(
    eq(milestones.id, milestoneId),
    eq(milestones.identityId, account.id),
  );
}

/** Whichever fields a change sends, each checked with the rules of creating. */
function changesOf(body: MilestoneChange): MilestoneFields {
  const changes: MilestoneFields = {};
  if (body.title !== undefined) changes.title = titleOf(body.title);
  if (body.description !== undefined) {
    changes.description = descriptionOf(body.description);
  }
  if (body.date !== undefined) {
    changes.date = calendarDate(body.date, 'invalid-milestone-date');
  }
  if (body.done !== undefined) changes.done = doneOf(body.done);
  return changes;
}

/** Whether a Milestone is done; `invalid-milestone-done` when not a boolean. */
function doneOf(raw: unknown): boolean {
  if (typeof raw !== 'boolean') throw new Rejected('invalid-milestone-done');
  return raw;
}

/** A Milestone's title, trimmed; `invalid-milestone-title` when empty or too long. */
function titleOf(raw: unknown): string {
  const title = typeof raw === 'string' ? raw.trim() : '';
  if (title === '' || title.length > MAX_TITLE_LENGTH) {
    throw new Rejected('invalid-milestone-title');
  }
  return title;
}

/**
 * A Milestone's description, trimmed, and empty when left out;
 * `invalid-milestone-description` when too long or not text.
 */
function descriptionOf(raw: unknown): string {
  if (raw === undefined) return '';
  if (typeof raw !== 'string') {
    throw new Rejected('invalid-milestone-description');
  }
  const description = raw.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Rejected('invalid-milestone-description');
  }
  return description;
}
