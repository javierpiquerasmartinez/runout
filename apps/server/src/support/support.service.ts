import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import {
  bulkImports,
  identities,
  SUPPORT_TICKET_STATUSES,
  supportMessages,
  supportTickets,
  type BulkImportReason,
  type BulkImportStatus,
  type SupportTicketStatus,
} from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import {
  refuseImpersonation,
  type Identity,
} from '../identity/identity.service.js';
import type { PersonView } from '../identity/invitations.service.js';
import { adminPage, oneOf } from '../admin/admin-query.js';
import { isAccount } from '../admin/accounts.service.js';
import { Rejected } from '../rejection/rejection.js';
import { SupportEmail } from './support-email.js';

/** How long a Support Ticket's subject may be, in characters, once trimmed. */
export const MAX_SUPPORT_SUBJECT_LENGTH = 120;

/** How long a Support Message may be, in characters, once trimmed. */
export const MAX_SUPPORT_MESSAGE_LENGTH = 4000;

/**
 * Who wrote a Support Message, as the Account sees it: itself, or Runout for
 * every Administrator, whoever they are.
 */
export type AccountSide = 'account' | 'runout';

/** A Support Message as the Ticket's Account reads it. */
export interface AccountMessage {
  id: string;
  from: AccountSide;
  text: string;
  writtenAt: Date;
  /** Whether it is from Runout and the Account had not read it before this read of the thread. */
  unread: boolean;
}

/** A Support Ticket as its Account lists it. */
export interface AccountTicketSummary {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  createdAt: Date;
  /** Who wrote last and when. */
  lastMessage: { from: AccountSide; writtenAt: Date };
  /** Whether it has a Support Message from Runout the Account hasn't read. */
  unread: boolean;
}

/**
 * The Bulk Import a Support Ticket points at, as its Account sees it in the
 * Library: its files, where it ended and its Hands. Never a Hand's text.
 */
export interface TicketBulkImport {
  id: string;
  status: BulkImportStatus;
  files: { name: string; size: number }[];
  total: number | null;
  processed: number;
  imported: number;
  /** Why it ended short of adding its Hands, when it did. */
  reason: BulkImportReason | null;
  createdAt: Date;
  finishedAt: Date | null;
}

/** The Bulk Import a Support Ticket points at, as the panel sees it: why it failed, too. */
export interface PanelTicketBulkImport extends TicketBulkImport {
  /** Why it failed, when it did: a technical code, never a Hand's text. */
  failureCode: string | null;
}

/** A Support Ticket and its whole thread, as its Account reads it. */
export interface AccountTicket {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  /** Who opened it: the Account, or Runout. */
  openedBy: AccountSide;
  createdAt: Date;
  /** The Bulk Import it is about; null for a generic one. */
  bulkImport: TicketBulkImport | null;
  messages: AccountMessage[];
}

/** The Account's Support Tickets, Open ones first, the latest written in on top. */
export interface AccountTicketList {
  tickets: AccountTicketSummary[];
}

/** How many of the Account's Support Tickets have a Support Message from Runout it hasn't read. */
export interface AccountUnreadCount {
  unread: number;
}

/** How many Open Support Tickets wait for an answer, the same for every Administrator. */
export interface PanelWaitingCount {
  waiting: number;
}

/** Who wrote a Support Message, as the panel shows it: the Account, or which Administrator. */
export interface PanelWriter {
  from: 'account' | 'administrator';
  writer: PersonView;
}

/** A Support Message as the panel reads it. */
export interface PanelMessage extends PanelWriter {
  id: string;
  text: string;
  writtenAt: Date;
}

/**
 * Whose turn it is to answer, read from the last Support Message's writer:
 * the Administrators' when the Account wrote last.
 */
export type WaitingFor = 'administrators' | 'account';

/** A Support Ticket as the panel's Support tab lists it. */
export interface PanelTicketSummary {
  id: string;
  account: PersonView;
  subject: string;
  status: SupportTicketStatus;
  waitingFor: WaitingFor;
  createdAt: Date;
  /** The Administrator who opened it; null when the Account did. */
  openedBy: PersonView | null;
  lastMessage: PanelWriter & { writtenAt: Date };
}

/** A Support Ticket and its whole thread, as the panel reads it. */
export interface PanelTicket {
  id: string;
  account: PersonView;
  subject: string;
  status: SupportTicketStatus;
  waitingFor: WaitingFor;
  createdAt: Date;
  /** The Administrator who opened it; null when the Account did. */
  openedBy: PersonView | null;
  /** The Bulk Import it is about; null for a generic one. */
  bulkImport: PanelTicketBulkImport | null;
  messages: PanelMessage[];
}

/** The panel's Support filters: Todas, Abiertas and Cerradas. */
export const PANEL_TICKET_FILTERS = [
  'all',
  ...SUPPORT_TICKET_STATUSES,
] as const;
export type PanelTicketFilter = (typeof PANEL_TICKET_FILTERS)[number];

/** A page of every Support Ticket, those waiting for an answer first. */
export interface PanelTicketPage {
  total: number;
  page: number;
  pageSize: number;
  /** How many Open Tickets wait for an answer, across every page. */
  waiting: number;
  tickets: PanelTicketSummary[];
}

/** What opening a Support Ticket sends. */
export interface NewTicketBody {
  subject?: unknown;
  message?: unknown;
  /** The Bulk Import of the Ticket's Account it points at; none for a generic one. */
  bulkImportId?: unknown;
}

/** What an Administrator opening a Support Ticket sends: the Account it is with, too. */
export interface NewPanelTicketBody extends NewTicketBody {
  accountId?: unknown;
}

/** What writing in a Support Ticket sends. */
export interface NewMessageBody {
  text?: unknown;
}

type TicketRow = typeof supportTickets.$inferSelect;
type BulkImportRow = typeof bulkImports.$inferSelect;
type MessageRow = typeof supportMessages.$inferSelect;
type PersonRow = Pick<
  typeof identities.$inferSelect,
  'id' | 'displayName' | 'email'
>;

// The Ticket's thread, as subqueries correlated to the outer support_tickets.
// The names are written out: Drizzle leaves a lone table's columns
// unqualified, which inside the subquery would read support_messages' own.

/** When the Ticket was last written in. */
const lastWrittenAt = sql<Date>`(select max(m.written_at) from support_messages m where m.ticket_id = support_tickets.id)`;

/** Whether its Account wrote its last Support Message. */
const accountWroteLast = sql<boolean>`(select m.administrator_id is null from support_messages m where m.ticket_id = support_tickets.id order by m.seq desc limit 1)`;

/**
 * Whether the Ticket has a Support Message from Runout after the last one its
 * Account read. One it never read counts from the start, so a Ticket an
 * Administrator opened is unread until the Account opens it.
 */
const unreadByAccount = sql<boolean>`exists (select 1 from support_messages m where m.ticket_id = support_tickets.id and m.administrator_id is not null and m.seq > coalesce(support_tickets.account_read_seq, 0))`;

/** Open, with the Account's Support Message last: waiting for the Administrators' answer. */
const waitingForAdministrators = sql<boolean>`(support_tickets.status = 'open' and ${accountWroteLast})`;

/**
 * Support: Support Tickets between an Account and the Administrators, and
 * their Support Messages. It has two sides: the Account's, over its own
 * Tickets and never while Impersonated, where every Administrator signs
 * "Runout"; and the Administrators', over every Ticket, where each
 * Support Message shows which of them wrote it.
 */
@Injectable()
export class SupportService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly email: SupportEmail,
  ) {}

  /** The Account's Support Tickets, Open ones first, the latest written in on top. */
  async listForAccount(account: Identity): Promise<AccountTicketList> {
    refuseImpersonation(account);
    const rows = await this.db
      .select({
        ticket: supportTickets,
        lastWrittenAt: lastWrittenAt.mapWith(supportMessages.writtenAt),
        accountWroteLast,
        unread: unreadByAccount,
      })
      .from(supportTickets)
      .where(eq(supportTickets.identityId, account.id))
      .orderBy(
        sql`${supportTickets.status} = 'closed'`,
        sql`${lastWrittenAt} desc`,
        asc(supportTickets.id),
      );
    return {
      tickets: rows.map(
        ({ ticket, lastWrittenAt, accountWroteLast, unread }) => ({
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          createdAt: ticket.createdAt,
          lastMessage: {
            from: accountWroteLast ? 'account' : 'runout',
            writtenAt: lastWrittenAt,
          },
          unread,
        }),
      ),
    };
  }

  /** How many of the Account's Support Tickets have a Support Message from Runout it hasn't read. */
  async unreadForAccount(account: Identity): Promise<AccountUnreadCount> {
    refuseImpersonation(account);
    const [{ unread }] = await this.db
      .select({
        unread: sql<number>`(count(*) filter (where ${unreadByAccount}))::int`,
      })
      .from(supportTickets)
      .where(eq(supportTickets.identityId, account.id));
    return { unread };
  }

  /** Opens a Support Ticket with a subject and its first Support Message; it is Open. */
  async openForAccount(
    account: Identity,
    body: NewTicketBody,
  ): Promise<AccountTicket> {
    refuseImpersonation(account);
    const ticketId = await this.open(account.id, null, body);
    return this.readForAccount(account, ticketId);
  }

  /**
   * One of the Account's Support Tickets with its thread; anyone else's is
   * `support-ticket-not-found`. The Account reads it, so it is no longer
   * unread; each Support Message says whether it was unread before.
   */
  async readForAccount(
    account: Identity,
    ticketId: string,
  ): Promise<AccountTicket> {
    refuseImpersonation(account);
    const ticket = await this.ticket(
      ticketId,
      eq(supportTickets.identityId, account.id),
    );
    const messages = await this.messagesOf(ticket.id);
    const readSeq = ticket.accountReadSeq ?? 0;
    const lastSeq = messages.at(-1)?.seq;
    if (lastSeq !== undefined && lastSeq > readSeq) {
      await this.db
        .update(supportTickets)
        .set({ accountReadSeq: lastSeq })
        .where(eq(supportTickets.id, ticket.id));
    }
    const bulkImport = await this.bulkImportOf(ticket);
    return {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      openedBy: ticket.openedByAdministratorId ? 'runout' : 'account',
      createdAt: ticket.createdAt,
      bulkImport: bulkImport && accountBulkImport(bulkImport),
      messages: messages.map((message) => ({
        id: message.id,
        from: message.administratorId ? 'runout' : 'account',
        text: message.text,
        writtenAt: message.writtenAt,
        unread: message.administratorId !== null && message.seq > readSeq,
      })),
    };
  }

  /** The Account writes in one of its Support Tickets. */
  async writeForAccount(
    account: Identity,
    ticketId: string,
    body: NewMessageBody,
  ): Promise<AccountTicket> {
    refuseImpersonation(account);
    const ticket = await this.ticket(
      ticketId,
      eq(supportTickets.identityId, account.id),
    );
    const text = messageOf(body.text);
    await this.write(ticket.id, null, text);
    await this.email.toAdministrators('written', account.id, {
      id: ticket.id,
      subject: ticket.subject,
      message: text,
    });
    return this.readForAccount(account, ticket.id);
  }

  /** The Account closes one of its Support Tickets: it says the matter is settled. */
  async closeForAccount(
    account: Identity,
    ticketId: string,
  ): Promise<AccountTicket> {
    refuseImpersonation(account);
    const ticket = await this.ticket(
      ticketId,
      eq(supportTickets.identityId, account.id),
    );
    await this.close(ticket.id);
    return this.readForAccount(account, ticket.id);
  }

  /**
   * A page of every Support Ticket: those waiting for an answer first, then
   * the other Open ones, then the Closed; the latest written in on top of
   * each. `status` keeps only the Open or only the Closed; the waiting count
   * is over every Ticket whatever it keeps.
   */
  async listForPanel(query: {
    status?: unknown;
    page?: unknown;
    pageSize?: unknown;
  }): Promise<PanelTicketPage> {
    const filter = oneOf(query.status, PANEL_TICKET_FILTERS);
    const { page, pageSize } = adminPage(query);
    const open = sql`${supportTickets.status} = 'open'`;
    const kept =
      filter === 'all' ? undefined : eq(supportTickets.status, filter);
    const [[{ total, waiting }], rows] = await Promise.all([
      this.db
        .select({
          total: sql<number>`(count(*) filter (where ${kept ?? sql`true`}))::int`,
          waiting: sql<number>`(count(*) filter (where ${waitingForAdministrators}))::int`,
        })
        .from(supportTickets),
      this.db
        .select({
          ticket: supportTickets,
          lastWrittenAt: lastWrittenAt.mapWith(supportMessages.writtenAt),
          accountWroteLast,
          lastAdministratorId: sql<
            string | null
          >`(select m.administrator_id from support_messages m where m.ticket_id = support_tickets.id order by m.seq desc limit 1)`,
        })
        .from(supportTickets)
        .where(kept)
        .orderBy(
          sql`case when ${open} and ${accountWroteLast} then 0 when ${open} then 1 else 2 end`,
          sql`${lastWrittenAt} desc`,
          asc(supportTickets.id),
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const people = await this.people(
      rows.flatMap(({ ticket, lastAdministratorId }) => [
        ticket.identityId,
        ticket.openedByAdministratorId,
        lastAdministratorId,
      ]),
    );
    return {
      total,
      page,
      pageSize,
      waiting,
      tickets: rows.map(({ ticket, lastWrittenAt, lastAdministratorId }) => ({
        id: ticket.id,
        account: people(ticket.identityId),
        subject: ticket.subject,
        status: ticket.status,
        waitingFor: lastAdministratorId ? 'account' : 'administrators',
        createdAt: ticket.createdAt,
        openedBy: ticket.openedByAdministratorId
          ? people(ticket.openedByAdministratorId)
          : null,
        lastMessage: {
          ...writerOf(ticket, lastAdministratorId, people),
          writtenAt: lastWrittenAt,
        },
      })),
    };
  }

  /**
   * How many Open Support Tickets wait for an answer: those whose last
   * Support Message is the Account's. Every Administrator sees the same
   * count, and one answering lowers it for all.
   */
  async waitingForPanel(): Promise<PanelWaitingCount> {
    const [{ waiting }] = await this.db
      .select({
        waiting: sql<number>`(count(*) filter (where ${waitingForAdministrators}))::int`,
      })
      .from(supportTickets);
    return { waiting };
  }

  /** Any Support Ticket with its thread, each Support Message showing who wrote it. */
  async readForPanel(ticketId: string): Promise<PanelTicket> {
    const ticket = await this.ticket(ticketId);
    const [messages, bulkImport] = await Promise.all([
      this.messagesOf(ticket.id),
      this.bulkImportOf(ticket),
    ]);
    const people = await this.people([
      ticket.identityId,
      ticket.openedByAdministratorId,
      ...messages.map((message) => message.administratorId),
    ]);
    const last = messages.at(-1);
    return {
      id: ticket.id,
      account: people(ticket.identityId),
      subject: ticket.subject,
      status: ticket.status,
      waitingFor: last?.administratorId ? 'account' : 'administrators',
      createdAt: ticket.createdAt,
      openedBy: ticket.openedByAdministratorId
        ? people(ticket.openedByAdministratorId)
        : null,
      bulkImport: bulkImport && {
        ...accountBulkImport(bulkImport),
        failureCode: bulkImport.failureCode,
      },
      messages: messages.map((message) => ({
        id: message.id,
        ...writerOf(ticket, message.administratorId, people),
        text: message.text,
        writtenAt: message.writtenAt,
      })),
    };
  }

  /**
   * An Administrator opens a Support Ticket with an Account, writing its
   * first Support Message; the Account sees it from Runout. Never with a
   * Suspended Account (`support-account-suspended`), nor with no such
   * Account (`not-found`).
   */
  async openForPanel(
    administrator: Identity,
    body: NewPanelTicketBody,
  ): Promise<PanelTicket> {
    const [account] = isUuid(body.accountId)
      ? await this.db
          .select({ id: identities.id, suspendedAt: identities.suspendedAt })
          .from(identities)
          .where(and(eq(identities.id, body.accountId), isAccount))
      : [];
    if (!account) throw new Rejected('not-found');
    if (account.suspendedAt !== null) {
      throw new Rejected('support-account-suspended');
    }
    return this.readForPanel(
      await this.open(account.id, administrator.id, body),
    );
  }

  /** An Administrator writes in any Support Ticket, a Suspended Account's included. */
  async writeForPanel(
    administrator: Identity,
    ticketId: string,
    body: NewMessageBody,
  ): Promise<PanelTicket> {
    const ticket = await this.ticket(ticketId);
    const text = messageOf(body.text);
    await this.write(ticket.id, administrator.id, text);
    await this.email.toAccount('written', ticket.identityId, {
      id: ticket.id,
      subject: ticket.subject,
      message: text,
    });
    return this.readForPanel(ticket.id);
  }

  /** An Administrator closes any Support Ticket, so it stops counting as pending. */
  async closeForPanel(ticketId: string): Promise<PanelTicket> {
    const ticket = await this.ticket(ticketId);
    if (await this.close(ticket.id)) {
      const last = (await this.messagesOf(ticket.id)).at(-1);
      await this.email.toAccount('closed', ticket.identityId, {
        id: ticket.id,
        subject: ticket.subject,
        message: last?.text ?? '',
      });
    }
    return this.readForPanel(ticket.id);
  }

  /**
   * Opens an Open Support Ticket with the Account and its first Support
   * Message, written by the Administrator who opens it, or by the Account
   * when `administratorId` is null. It points at `bulkImportId` when one is
   * given, which must be a Bulk Import of that Account
   * (`bulk-import-not-found` otherwise).
   */
  private async open(
    accountId: string,
    administratorId: string | null,
    body: NewTicketBody,
  ): Promise<string> {
    const subject = subjectOf(body.subject);
    const text = messageOf(body.message);
    const bulkImportId = await this.bulkImportOfAccount(
      accountId,
      body.bulkImportId,
    );
    const now = this.clock.now();
    const ticketId = await this.db.transaction(async (tx) => {
      const [ticket] = await tx
        .insert(supportTickets)
        .values({
          identityId: accountId,
          subject,
          status: 'open',
          openedByAdministratorId: administratorId,
          bulkImportId,
          createdAt: now,
        })
        .returning({ id: supportTickets.id });
      await tx
        .insert(supportMessages)
        .values({ ticketId: ticket.id, administratorId, text, writtenAt: now });
      return ticket.id;
    });
    const mention = { id: ticketId, subject, message: text };
    if (administratorId) {
      await this.email.toAccount('opened', accountId, mention);
    } else {
      await this.email.toAdministrators('opened', accountId, mention);
    }
    return ticketId;
  }

  /** Writes a Support Message; in a Closed Ticket it opens it again, since something is pending once more. */
  private async write(
    ticketId: string,
    administratorId: string | null,
    text: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(supportMessages).values({
        ticketId,
        administratorId,
        text,
        writtenAt: this.clock.now(),
      });
      await tx
        .update(supportTickets)
        .set({ status: 'open' })
        .where(eq(supportTickets.id, ticketId));
    });
  }

  /** Closes a Support Ticket; a Closed one stays as it is. Whether it was Open. */
  private async close(ticketId: string): Promise<boolean> {
    const closed = await this.db
      .update(supportTickets)
      .set({ status: 'closed' })
      .where(
        and(eq(supportTickets.id, ticketId), eq(supportTickets.status, 'open')),
      )
      .returning({ id: supportTickets.id });
    return closed.length > 0;
  }

  /** The Support Ticket, if it is there and meets `scope`; `support-ticket-not-found` otherwise. */
  private async ticket(ticketId: string, scope?: SQL): Promise<TicketRow> {
    if (!isUuid(ticketId)) throw new Rejected('support-ticket-not-found');
    const [ticket] = await this.db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, ticketId), scope));
    if (!ticket) throw new Rejected('support-ticket-not-found');
    return ticket;
  }

  /**
   * The Bulk Import a new Ticket points at: null when none is given, its id
   * when it is one of the Account's, `bulk-import-not-found` otherwise.
   */
  private async bulkImportOfAccount(
    accountId: string,
    raw: unknown,
  ): Promise<string | null> {
    if (raw === undefined || raw === null) return null;
    if (!isUuid(raw)) throw new Rejected('bulk-import-not-found');
    const [found] = await this.db
      .select({ id: bulkImports.id })
      .from(bulkImports)
      .where(
        and(eq(bulkImports.id, raw), eq(bulkImports.identityId, accountId)),
      );
    if (!found) throw new Rejected('bulk-import-not-found');
    return found.id;
  }

  /** The Bulk Import the Ticket points at, or null for a generic one. */
  private async bulkImportOf(ticket: TicketRow): Promise<BulkImportRow | null> {
    if (!ticket.bulkImportId) return null;
    const [found] = await this.db
      .select()
      .from(bulkImports)
      .where(eq(bulkImports.id, ticket.bulkImportId));
    return found ?? null;
  }

  /** A Ticket's thread, in the order it was written. */
  private messagesOf(ticketId: string): Promise<MessageRow[]> {
    return this.db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, ticketId))
      .orderBy(asc(supportMessages.seq));
  }

  /** Finds these identities at once, answering each by id. */
  private async people(
    ids: (string | null)[],
  ): Promise<(id: string) => PersonView> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    const rows: PersonRow[] =
      wanted.length === 0
        ? []
        : await this.db
            .select({
              id: identities.id,
              displayName: identities.displayName,
              email: identities.email,
            })
            .from(identities)
            .where(inArray(identities.id, wanted));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return (id) => {
      const row = byId.get(id);
      return {
        id,
        displayName: row?.displayName ?? null,
        email: row?.email ?? null,
      };
    };
  }
}

/** The Bulk Import a Ticket points at, as its Account sees it. */
function accountBulkImport(row: BulkImportRow): TicketBulkImport {
  return {
    id: row.id,
    status: row.status,
    files: row.files.map(({ name, size }) => ({ name, size })),
    total: row.total,
    processed: row.processed,
    imported: row.imported,
    reason: row.reason,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

/** Who wrote a Support Message, for the panel. */
function writerOf(
  ticket: TicketRow,
  administratorId: string | null,
  people: (id: string) => PersonView,
): PanelWriter {
  return administratorId
    ? { from: 'administrator', writer: people(administratorId) }
    : { from: 'account', writer: people(ticket.identityId) };
}

/** A subject, trimmed, with at least a character and at most the cap. */
function subjectOf(raw: unknown): string {
  const subject = typeof raw === 'string' ? raw.trim() : '';
  if (subject.length === 0 || subject.length > MAX_SUPPORT_SUBJECT_LENGTH) {
    throw new Rejected('invalid-support-subject');
  }
  return subject;
}

/** A Support Message's text, trimmed, with at least a character and at most the cap. */
function messageOf(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length === 0 || text.length > MAX_SUPPORT_MESSAGE_LENGTH) {
    throw new Rejected('invalid-support-message');
  }
  return text;
}
