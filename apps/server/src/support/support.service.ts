import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import {
  identities,
  supportMessages,
  supportTickets,
  type SupportTicketStatus,
} from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import {
  refuseImpersonation,
  type Identity,
} from '../identity/identity.service.js';
import type { PersonView } from '../identity/invitations.service.js';
import { adminPage } from '../admin/admin-query.js';
import { Rejected } from '../rejection/rejection.js';

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
}

/** A Support Ticket as its Account lists it. */
export interface AccountTicketSummary {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  createdAt: Date;
  /** Who wrote last and when. */
  lastMessage: { from: AccountSide; writtenAt: Date };
}

/** A Support Ticket and its whole thread, as its Account reads it. */
export interface AccountTicket {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  /** Who opened it: the Account, or Runout. */
  openedBy: AccountSide;
  createdAt: Date;
  messages: AccountMessage[];
}

/** The Account's Support Tickets, Open ones first, the latest written in on top. */
export interface AccountTicketList {
  tickets: AccountTicketSummary[];
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
  messages: PanelMessage[];
}

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
}

/** What writing in a Support Ticket sends. */
export interface NewMessageBody {
  text?: unknown;
}

type TicketRow = typeof supportTickets.$inferSelect;
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
  ) {}

  /** The Account's Support Tickets, Open ones first, the latest written in on top. */
  async listForAccount(account: Identity): Promise<AccountTicketList> {
    refuseImpersonation(account);
    const rows = await this.db
      .select({
        ticket: supportTickets,
        lastWrittenAt: lastWrittenAt.mapWith(supportMessages.writtenAt),
        accountWroteLast,
      })
      .from(supportTickets)
      .where(eq(supportTickets.identityId, account.id))
      .orderBy(
        sql`${supportTickets.status} = 'closed'`,
        sql`${lastWrittenAt} desc`,
        asc(supportTickets.id),
      );
    return {
      tickets: rows.map(({ ticket, lastWrittenAt, accountWroteLast }) => ({
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        createdAt: ticket.createdAt,
        lastMessage: {
          from: accountWroteLast ? 'account' : 'runout',
          writtenAt: lastWrittenAt,
        },
      })),
    };
  }

  /** Opens a Support Ticket with a subject and its first Support Message; it is Open. */
  async openForAccount(
    account: Identity,
    body: NewTicketBody,
  ): Promise<AccountTicket> {
    refuseImpersonation(account);
    const subject = subjectOf(body.subject);
    const text = messageOf(body.message);
    const now = this.clock.now();
    const ticketId = await this.db.transaction(async (tx) => {
      const [ticket] = await tx
        .insert(supportTickets)
        .values({
          identityId: account.id,
          subject,
          status: 'open',
          createdAt: now,
        })
        .returning({ id: supportTickets.id });
      await tx
        .insert(supportMessages)
        .values({ ticketId: ticket.id, text, writtenAt: now });
      return ticket.id;
    });
    return this.readForAccount(account, ticketId);
  }

  /** One of the Account's Support Tickets with its thread; anyone else's is `support-ticket-not-found`. */
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
    return {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      openedBy: ticket.openedByAdministratorId ? 'runout' : 'account',
      createdAt: ticket.createdAt,
      messages: messages.map((message) => ({
        id: message.id,
        from: message.administratorId ? 'runout' : 'account',
        text: message.text,
        writtenAt: message.writtenAt,
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
    await this.write(ticket.id, null, messageOf(body.text));
    return this.readForAccount(account, ticket.id);
  }

  /**
   * A page of every Support Ticket: those waiting for an answer first, then
   * the other Open ones, then the Closed; the latest written in on top of
   * each.
   */
  async listForPanel(query: {
    page?: unknown;
    pageSize?: unknown;
  }): Promise<PanelTicketPage> {
    const { page, pageSize } = adminPage(query);
    const open = sql`${supportTickets.status} = 'open'`;
    const [[{ total, waiting }], rows] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          waiting: sql<number>`(count(*) filter (where ${open} and ${accountWroteLast}))::int`,
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

  /** Any Support Ticket with its thread, each Support Message showing who wrote it. */
  async readForPanel(ticketId: string): Promise<PanelTicket> {
    const ticket = await this.ticket(ticketId);
    const messages = await this.messagesOf(ticket.id);
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
      messages: messages.map((message) => ({
        id: message.id,
        ...writerOf(ticket, message.administratorId, people),
        text: message.text,
        writtenAt: message.writtenAt,
      })),
    };
  }

  /** An Administrator writes in any Support Ticket, a Suspended Account's included. */
  async writeForPanel(
    administrator: Identity,
    ticketId: string,
    body: NewMessageBody,
  ): Promise<PanelTicket> {
    const ticket = await this.ticket(ticketId);
    await this.write(ticket.id, administrator.id, messageOf(body.text));
    return this.readForPanel(ticket.id);
  }

  private async write(
    ticketId: string,
    administratorId: string | null,
    text: string,
  ): Promise<void> {
    await this.db.insert(supportMessages).values({
      ticketId,
      administratorId,
      text,
      writtenAt: this.clock.now(),
    });
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
