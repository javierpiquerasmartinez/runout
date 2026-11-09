import type { FailureReason, RejectionReason } from '../backend/api'
import { parseDate } from '../calendar/calendar'
import type { Locale, MessageKey } from '../i18n'
import { readGoalNumber, readTarget } from './goals'

/** A field of a Goal that is written in its dialog. */
export type GoalField = 'name' | 'description' | 'target' | 'startDate' | 'deadline'

/** What is wrong with each refused field, and with the form as a whole. */
export type Refusals = Partial<Record<GoalField | 'form', MessageKey>>

/** A Goal as its dialog holds it, written as the person typed it. */
export interface GoalDraft {
  name: string
  target: string
  startDate: string
  deadline: string
}

/** The field each of the server's refusals is about. */
const refusedField: Partial<Record<RejectionReason, GoalField>> = {
  'invalid-goal-name': 'name',
  'invalid-goal-description': 'description',
  'invalid-goal-target': 'target',
  'invalid-goal-start-date': 'startDate',
  'invalid-goal-deadline': 'deadline',
  'goal-deadline-before-start': 'deadline',
}

/** What is wrong with a typed Target; undefined when it can be one. */
function targetRefusal(target: string, locale: Locale): MessageKey | undefined {
  const value = readGoalNumber(target, locale)
  if (value === null || value <= 0) return 'goals.form.targetRequired'
  return readTarget(target, locale) === null ? 'goals.form.targetInvalid' : undefined
}

/** What is wrong with the Deadline, given the Start Date; undefined when nothing is. */
function deadlineRefusal(deadline: string, startDate: string): MessageKey | undefined {
  if (parseDate(deadline) === null) return 'goals.form.deadlineRequired'
  return deadline < startDate ? 'goals.form.deadlineBeforeStart' : undefined
}

/** Everything a Goal's dialog refuses before sending anything; empty when it can be sent. */
export function draftRefusals({ name, target, startDate, deadline }: GoalDraft, locale: Locale): Refusals {
  const refusals: Refusals = {
    name: name.trim() === '' ? 'goals.form.nameRequired' : undefined,
    target: targetRefusal(target, locale),
    startDate: parseDate(startDate) === null ? 'goals.form.startDateRequired' : undefined,
    deadline: deadlineRefusal(deadline, startDate),
  }
  return Object.fromEntries(Object.entries(refusals).filter(([, message]) => message !== undefined))
}

/** The server's refusal of a Goal, beside the field it is about, or for the whole form. */
export function serverRefusal(reason: FailureReason): Refusals {
  return { [(reason !== 'network' && refusedField[reason]) || 'form']: `reason.${reason}` }
}
