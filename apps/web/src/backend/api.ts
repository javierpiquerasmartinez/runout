/** Why the server refused a command. Mirrors the server's reasons (ADR 0001: no shared code). */
export type RejectionReason =
  | 'unauthenticated'
  | 'invalid-display-name'
  | 'invalid-room-name'
  | 'room-not-found'
  | 'not-in-room'

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
  { token, method = 'GET', body }: { token?: string; method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
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
