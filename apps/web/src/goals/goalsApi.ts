import { api } from '../backend/api'
import type { Goal } from './goals'

/** The session's token, when there is one. */
type Token = string | null

/** What creating a Goal sends. */
export type NewGoal = Pick<Goal, 'name' | 'description' | 'target' | 'startDate' | 'deadline'>

/** All the Account's Goals. */
export function listGoals(token: Token): Promise<{ goals: Goal[] }> {
  return api('/goals', { token: token ?? undefined })
}

/** A new Goal, at 0. */
export function createGoal(token: Token, goal: NewGoal): Promise<Goal> {
  return api('/goals', { token: token ?? undefined, method: 'POST', body: goal })
}
