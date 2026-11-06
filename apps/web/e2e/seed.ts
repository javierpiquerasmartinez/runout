import { readFileSync } from 'node:fs'
import { SERVER_URL, VIEWPORTS, type Seed } from './seeded'

/*
 * Gives Tester A, on the throwaway server, the Hands the tests replay: a few
 * fixture Hand Histories in their Library (ten-handed, all-ins with side pots,
 * a showdown, a session) and one Room per viewport holding all of them, so no
 * two tests step the same Room.
 */
const FIXTURES = [
  'pokerstars-ten-max.txt',
  'pokerstars-all-ins.txt',
  'pokerstars-showdown.txt',
  'pokerstars-session.txt',
  'ggpoker-session.txt',
]

export default async function seed() {
  const { token } = await call<{ token: string }>('POST', '/sessions/google', undefined, {
    idToken: 'dev-sign-in|tester-a',
  })
  await call('PUT', '/identities/me/display-name', token, { displayName: 'Tester A' })

  for (const name of FIXTURES) {
    const text = readFileSync(new URL(`../../server/src/hands/import/fixtures/${name}`, import.meta.url), 'utf8')
    const preview = await call<{ id: string }>('POST', '/library/imports/previews', token, { text })
    await call('POST', '/library/imports', token, { previews: [preview.id] })
  }
  const { hands } = await call<{ hands: { id: string }[] }>('GET', '/library/hands?pageSize=100', token)
  const handIds = hands.map((hand) => hand.id)

  const rooms: Record<string, string> = {}
  for (const viewport of VIEWPORTS) {
    const { code } = await call<{ code: string }>('POST', '/rooms', token, {
      name: `Layout ${viewport.name}`,
      displayName: 'Tester A',
    })
    await call('POST', `/rooms/${code}/library-hands`, token, { handIds })
    rooms[viewport.name] = code
  }

  const seeded: Seed = { handIds, rooms }
  process.env.RUNOUT_E2E_SEED = JSON.stringify(seeded)
}

async function call<T = unknown>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${SERVER_URL}/api${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}
