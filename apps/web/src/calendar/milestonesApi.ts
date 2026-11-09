import { api } from '../backend/api'
import type { CalendarDate, CalendarSpan, Milestone } from './calendar'

/** The session's token, when there is one. */
type Token = string | null

/** What creating a Milestone sends. */
export interface NewMilestone {
  title: string
  description: string
  date: string
}

/** What changing a Milestone sends: whichever of its fields change. */
export type MilestoneChange = Partial<{ title: string; description: string; date: CalendarDate; done: boolean }>

/** What lies around a day, beyond what a span can reach. */
export interface MilestoneOutlook {
  next: Milestone | null
  overdue: number
}

const pathOf = (id: string) => `/calendar/milestones/${encodeURIComponent(id)}`

/** The Account's Milestones dated within the span. */
export function listMilestones(token: Token, span: CalendarSpan): Promise<{ milestones: Milestone[] }> {
  return api(`/calendar/milestones?from=${span.from}&to=${span.to}`, { token: token ?? undefined })
}

/** The first Milestone not done after the viewer's `today`, if any, and how many not done are dated before it. */
export function milestoneOutlook(token: Token, today: CalendarDate): Promise<MilestoneOutlook> {
  return api(`/calendar/milestones/outlook?today=${today}`, { token: token ?? undefined })
}

/** One of the Account's Milestones; `milestone-not-found` for anyone else's. */
export function getMilestone(token: Token, id: string): Promise<Milestone> {
  return api(pathOf(id), { token: token ?? undefined })
}

/** A new Milestone on its date, not done. */
export function createMilestone(token: Token, milestone: NewMilestone): Promise<Milestone> {
  return api('/calendar/milestones', { token: token ?? undefined, method: 'POST', body: milestone })
}

/** Changes whichever of a Milestone's fields are sent, answering with the Milestone as it is now. */
export function changeMilestone(token: Token, id: string, change: MilestoneChange): Promise<Milestone> {
  return api(pathOf(id), { token: token ?? undefined, method: 'PATCH', body: change })
}

/** Deletes one of the Account's Milestones, with no undo. */
export async function deleteMilestone(token: Token, id: string): Promise<void> {
  await api(pathOf(id), { token: token ?? undefined, method: 'DELETE' })
}
