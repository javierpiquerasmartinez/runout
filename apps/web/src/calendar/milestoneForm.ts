import type { FailureReason, RejectionReason } from '../backend/api'
import type { MessageKey } from '../i18n'
import { parseDate } from './calendar'

/** A field of a Milestone that is written in a form. */
export type MilestoneField = 'title' | 'description' | 'date'

/** A refused value, shown in place beside its field, or for the whole form. */
export interface Refusal {
  field: MilestoneField | 'form'
  message: MessageKey
}

/** The field each of the server's refusals is about. */
const refusedField: Partial<Record<RejectionReason, MilestoneField>> = {
  'invalid-milestone-title': 'title',
  'invalid-milestone-description': 'description',
  'invalid-milestone-date': 'date',
}

/** What a Milestone's form refuses before sending anything: an empty title, then a missing date; null when neither. */
export function draftRefusal({ title, date }: { title: string; date: string }): Refusal | null {
  if (title.trim() === '') return { field: 'title', message: 'calendar.create.titleRequired' }
  if (parseDate(date) === null) return { field: 'date', message: 'calendar.create.dateRequired' }
  return null
}

/** The server's refusal of a Milestone's form, beside the field it is about, or for the whole form. */
export function serverRefusal(reason: FailureReason): Refusal {
  return { field: (reason !== 'network' && refusedField[reason]) || 'form', message: `reason.${reason}` }
}
