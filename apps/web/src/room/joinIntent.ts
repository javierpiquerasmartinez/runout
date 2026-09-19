/**
 * Carried in the history entry when "Create" sends the Master to their Room, so
 * the Room screen joins straight away without asking for the name again.
 */
export interface JoinIntent {
  displayName: string
}

export function readJoinIntent(state: unknown = window.history.state): JoinIntent | null {
  if (typeof state === 'object' && state !== null && typeof (state as JoinIntent).displayName === 'string') {
    return state as JoinIntent
  }
  return null
}
