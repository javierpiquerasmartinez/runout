/** The Administrator panel (ADR 0008): only routed for Administrators, a path like any other for everyone else. */
export const adminPath = '/admin'

export const ADMIN_TABS = ['invitations', 'accounts', 'rooms'] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

export function adminTabPath(tab: AdminTab): string {
  return `${adminPath}/${tab}`
}

/** The tab a panel path opens, or null when it isn't one; `/admin` opens on Invitations. */
export function adminTabFromPath(path: string): AdminTab | null {
  if (path === adminPath) return 'invitations'
  const tab = path.startsWith(`${adminPath}/`) ? path.slice(adminPath.length + 1) : null
  return ADMIN_TABS.find((each) => each === tab) ?? null
}

export interface Person {
  id: string
  displayName: string | null
  email: string | null
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled'

export interface Invitation {
  id: string
  email: string
  language: 'es' | 'en'
  status: InvitationStatus
  sentBy: Person
  sentAt: string
  expiresAt: string
  acceptedAt: string | null
  account: Person | null
  cancelledAt: string | null
}

export interface InvitationSent {
  invitation: Invitation
  emailSent: boolean
}

export interface AccountCounts {
  libraryHands: number
  imports: number
  ranges: number
  libraryTags: number
  labTags: number
  notes: number
  roomsCreated: number
  roomsJoined: number
}

export interface AdminAccount {
  id: string
  email: string | null
  displayName: string | null
  createdAt: string
  invitation: { id: string; sentAt: string; sentBy: Person } | null
  signInMethods: ('google' | 'password')[]
  lastSignedInAt: string | null
  lastActiveAt: string | null
  administrator: boolean
  suspension: { at: string; by: Person | null } | null
  counts: AccountCounts
  impersonations: { administrator: Person; startedAt: string; endedAt: string }[]
}

export interface AccountsPage {
  total: number
  page: number
  pageSize: number
  accounts: AdminAccount[]
}

export interface Totals {
  accounts: number
  activeLast7Days: number
  activeLast30Days: number
  suspended: number
  pendingInvitations: number
  hands: number
  ranges: number
  openRooms: number
  closedRooms: number
}

export interface AdminRoom {
  code: string
  name: string
  status: 'open' | 'closed'
  master: Person
  participants: number
  queueLength: number
  createdAt: string
  lastActivityAt: string
  closedAt: string | null
}

export interface RoomsPage {
  total: number
  page: number
  pageSize: number
  rooms: AdminRoom[]
}

/** Someone as the panel names them: their Display Name, else their email. */
export function nameOf(person: Person | { displayName: string | null; email: string | null }): string {
  return person.displayName ?? person.email ?? '—'
}
