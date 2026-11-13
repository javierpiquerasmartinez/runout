import { backendUrl } from './backendUrl'

/** Why the server refused a command. Mirrors the server's reasons (ADR 0001: no shared code). */
export type RejectionReason =
  | 'unauthenticated'
  | 'invalid-google-token'
  | 'account-required'
  | 'invalid-display-name'
  | 'invalid-screen-names'
  | 'invalid-preferences'
  | 'invalid-room-name'
  | 'room-not-found'
  | 'not-in-room'
  | 'not-master'
  | 'not-a-participant'
  | 'already-master'
  | 'master-must-choose'
  | 'cannot-kick-yourself'
  | 'kicked-from-room'
  | 'identity-of-another-room'
  | 'hand-not-found'
  | 'invalid-hand-copy'
  | 'no-history'
  | 'hand-not-in-queue'
  | 'no-hand-loaded'
  | 'invalid-action-index'
  | 'invalid-hide-opponent-names'
  | 'file-too-large'
  | 'unreadable-file'
  | 'invalid-format'
  | 'preview-not-found'
  | 'too-many-hands'
  | 'library-full'
  | 'invalid-bulk-import'
  | 'bulk-import-not-found'
  | 'bulk-import-unavailable'
  | 'bulk-import-unfinished'
  | 'author-not-in-room'
  | 'invalid-queue-order'
  | 'entry-not-in-queue'
  | 'nothing-to-undo'
  | 'undo-expired'
  | 'invalid-note'
  | 'note-not-found'
  | 'invalid-library-filter'
  | 'invalid-library-sort'
  | 'invalid-tag-name'
  | 'tag-name-taken'
  | 'tag-not-found'
  | 'invalid-tag-hands'
  | 'invalid-hand-selection'
  | 'invalid-range-name'
  | 'range-name-taken'
  | 'invalid-range-combos'
  | 'invalid-range-tags'
  | 'invalid-range-filter'
  | 'range-not-found'
  | 'invalid-milestone-title'
  | 'invalid-milestone-description'
  | 'invalid-milestone-date'
  | 'invalid-milestone-done'
  | 'invalid-calendar-span'
  | 'milestone-not-found'
  | 'invalid-goal-name'
  | 'invalid-goal-description'
  | 'invalid-goal-target'
  | 'invalid-goal-current-value'
  | 'goal-not-found'
  | 'invalid-goal-start-date'
  | 'invalid-goal-deadline'
  | 'goal-deadline-before-start'
  | 'not-found'
  | 'invalid-email'
  | 'invalid-language'
  | 'account-exists'
  | 'invitation-pending'
  | 'invitation-not-found'
  | 'invitation-expired'
  | 'invitation-cancelled'
  | 'invitation-used'
  | 'invitation-email-mismatch'
  | 'invitation-required'
  | 'email-taken'
  | 'password-too-weak'
  | 'invalid-credentials'
  | 'too-many-attempts'
  | 'account-suspended'
  | 'reset-not-found'
  | 'reset-expired'
  | 'reset-used'
  | 'password-exists'
  | 'cannot-suspend-administrator'
  | 'cannot-impersonate-administrator'
  | 'impersonation-not-allowed'
  | 'invalid-admin-query'

/** A refusal, or `network` when the server could not be reached at all. */
export type FailureReason = RejectionReason | 'network'

/** A failed API call: the server's typed reason, or `network` when it could not be reached. */
export class ApiError extends Error {
  readonly reason: FailureReason
  readonly status: number
  /** What the server said beside the reason: when to try again, which email was invited. */
  readonly details: Record<string, unknown>

  constructor(status: number, reason: FailureReason, details: Record<string, unknown> = {}) {
    super(reason)
    this.status = status
    this.reason = reason
    this.details = details
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export async function api<T>(
  path: string,
  { token, method = 'GET', body }: { token?: string; method?: Method; body?: unknown } = {},
): Promise<T> {
  const res = await request(path, { token, method, body })
  return (await res.json().catch(() => null)) as T
}

/** A GET whose answer is plain text; a refusal still comes as `{ reason }`. */
export async function apiText(path: string, { token }: { token?: string } = {}): Promise<string> {
  const res = await request(path, { token, method: 'GET' })
  return res.text()
}

/** Sends a request to the API; a refusal, or no answer at all, throws its `ApiError`. */
async function request(
  path: string,
  { token, method, body }: { token?: string; method: Method; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  // Form data (file uploads) goes as multipart, with the boundary the browser sets.
  const isForm = body instanceof FormData
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${backendUrl() ?? ''}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network')
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as ({ reason?: RejectionReason } & Record<string, unknown>) | null
    const { reason, ...details } = payload ?? {}
    throw new ApiError(res.status, reason ?? 'network', details)
  }
  return res
}

/** The reason behind any failure of an API call. */
export function reasonOf(error: unknown): FailureReason {
  return error instanceof ApiError ? error.reason : 'network'
}

/** A detail of a refusal, when it is a string: `detailOf(error, 'email')`. */
export function detailOf(error: unknown, key: string): string | null {
  const value = error instanceof ApiError ? error.details[key] : undefined
  return typeof value === 'string' ? value : null
}
