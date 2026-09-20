import { backendUrl } from './backendUrl'

/** Why the server refused a command. Mirrors the server's reasons (ADR 0001: no shared code). */
export type RejectionReason =
  | 'unauthenticated'
  | 'invalid-display-name'
  | 'invalid-screen-names'
  | 'invalid-room-name'
  | 'room-not-found'
  | 'not-in-room'
  | 'not-master'
  | 'not-a-participant'
  | 'already-master'
  | 'master-must-choose'
  | 'cannot-kick-yourself'
  | 'kicked-from-room'
  | 'hand-not-found'
  | 'hand-not-in-queue'
  | 'no-hand-loaded'
  | 'invalid-action-index'
  | 'file-too-large'
  | 'unreadable-file'
  | 'invalid-format'
  | 'preview-not-found'
  | 'author-not-in-room'
  | 'invalid-queue-order'
  | 'entry-not-in-queue'
  | 'nothing-to-undo'
  | 'undo-expired'

/** A refusal, or `network` when the server could not be reached at all. */
export type FailureReason = RejectionReason | 'network'

/** A failed API call: the server's typed reason, or `network` when it could not be reached. */
export class ApiError extends Error {
  readonly reason: FailureReason
  readonly status: number

  constructor(status: number, reason: FailureReason) {
    super(reason)
    this.status = status
    this.reason = reason
  }
}

export async function api<T>(
  path: string,
  { token, method = 'GET', body }: { token?: string; method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {},
): Promise<T> {
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
  const payload = (await res.json().catch(() => null)) as { reason?: RejectionReason } | null
  if (!res.ok) throw new ApiError(res.status, payload?.reason ?? 'network')
  return payload as T
}

/** The reason behind any failure of an API call. */
export function reasonOf(error: unknown): FailureReason {
  return error instanceof ApiError ? error.reason : 'network'
}
