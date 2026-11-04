import { vi } from 'vitest'

/** A request the app made, as a test reads it back. */
export interface ApiCall {
  method: string
  path: string
  search: string
  body: unknown
  token: string | null
}

type Answer = (call: ApiCall) => Response | Promise<Response>

/**
 * Stubs `fetch` with answers by "METHOD /path" (the path after `/api`); any
 * other request is answered `not-found`. Every call is kept, in order.
 */
export function fakeApi(answers: Record<string, Answer>): ApiCall[] {
  const calls: ApiCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const parsed = new URL(url, 'http://localhost')
      const headers = (init.headers ?? {}) as Record<string, string>
      const call: ApiCall = {
        method: init.method ?? 'GET',
        path: parsed.pathname.replace(/^\/api/, ''),
        search: parsed.search,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
        token: headers.Authorization?.replace(/^Bearer /, '') ?? null,
      }
      calls.push(call)
      const answer = answers[`${call.method} ${call.path}`]
      return answer ? answer(call) : Response.json({ reason: 'not-found' }, { status: 404 })
    }),
  )
  return calls
}

/** A refusal as the server writes one. */
export function refusal(status: number, reason: string, details: Record<string, unknown> = {}): Response {
  return Response.json({ ...details, reason }, { status })
}
