import type { Person } from '../admin/admin'

export { supportPath, supportTicketIdFromPath, supportTicketPath } from './paths'

/** How long a Support Ticket's subject may be, in characters. */
export const MAX_SUPPORT_SUBJECT_LENGTH = 120

/** How long a Support Message may be, in characters. */
export const MAX_SUPPORT_MESSAGE_LENGTH = 4000

/** How often a thread or the list of Tickets on screen is read again: there is no live push. */
export const SUPPORT_POLL_MS = 15_000

/** How often the header reads again the avatar's unread mark and the Administrators' waiting count. */
export const SUPPORT_MARK_POLL_MS = 60_000

/** Open while something is pending, Closed once settled. */
export type SupportTicketStatus = 'open' | 'closed'

/** The panel's Support filters: Todas, Abiertas and Cerradas, Todas first. */
export const PANEL_TICKET_FILTERS = ['all', 'open', 'closed'] as const
export type PanelTicketFilter = (typeof PANEL_TICKET_FILTERS)[number]

/** Who wrote a Support Message, as the Account sees it: itself, or Runout for every Administrator. */
export type AccountSide = 'account' | 'runout'

/** A Support Message as the Ticket's Account reads it. */
export interface AccountMessage {
  id: string
  from: AccountSide
  text: string
  writtenAt: string
  /** From Runout, and not yet read when the thread was read this time. */
  unread: boolean
}

/** A Support Ticket in the Account's list. */
export interface AccountTicketSummary {
  id: string
  subject: string
  status: SupportTicketStatus
  createdAt: string
  lastMessage: { from: AccountSide; writtenAt: string }
  /** It has a Support Message from Runout the Account hasn't read. */
  unread: boolean
}

/** A Support Ticket and its thread, as its Account reads it. */
export interface AccountTicket {
  id: string
  subject: string
  status: SupportTicketStatus
  openedBy: AccountSide
  createdAt: string
  messages: AccountMessage[]
}

/** Who wrote a Support Message, as the panel shows it: the Account, or which Administrator. */
export interface PanelWriter {
  from: 'account' | 'administrator'
  writer: Person
}

/** A Support Message as the panel reads it. */
export interface PanelMessage extends PanelWriter {
  id: string
  text: string
  writtenAt: string
}

/** Whose turn it is to answer: the Administrators' when the Account wrote last. */
export type WaitingFor = 'administrators' | 'account'

/** A Support Ticket in the panel's Support tab. */
export interface PanelTicketSummary {
  id: string
  account: Person
  subject: string
  status: SupportTicketStatus
  waitingFor: WaitingFor
  createdAt: string
  /** The Administrator who opened it; null when the Account did. */
  openedBy: Person | null
  lastMessage: PanelWriter & { writtenAt: string }
}

/** A Support Ticket and its thread, as the panel reads it. */
export interface PanelTicket {
  id: string
  account: Person
  subject: string
  status: SupportTicketStatus
  waitingFor: WaitingFor
  createdAt: string
  openedBy: Person | null
  messages: PanelMessage[]
}

/** A page of the Support tab. */
export interface PanelTicketPage {
  total: number
  page: number
  pageSize: number
  /** How many Open Tickets wait for an answer, across every page. */
  waiting: number
  tickets: PanelTicketSummary[]
}
