import { api } from '../backend/api'
import type { AccountTicket, AccountTicketSummary } from './support'

/** The session's token, when there is one. */
type Token = string | null

/** The Account's Support Tickets, Open ones first. */
export function listTickets(token: Token): Promise<{ tickets: AccountTicketSummary[] }> {
  return api('/support/tickets', { token: token ?? undefined })
}

/** Opens a Support Ticket with a subject and a first message. */
export function openTicket(token: Token, ticket: { subject: string; message: string }): Promise<AccountTicket> {
  return api('/support/tickets', { token: token ?? undefined, method: 'POST', body: ticket })
}

/** One of the Account's Support Tickets and its thread. */
export function readTicket(token: Token, id: string): Promise<AccountTicket> {
  return api(`/support/tickets/${id}`, { token: token ?? undefined })
}

/** Writes in one of the Account's Support Tickets, answering with the thread. */
export function writeInTicket(token: Token, id: string, text: string): Promise<AccountTicket> {
  return api(`/support/tickets/${id}/messages`, { token: token ?? undefined, method: 'POST', body: { text } })
}
