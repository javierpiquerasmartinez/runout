// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'
import { es as firstMessages } from '../src/i18n/messages/first/es.ts'

/*
 * What a Visitor downloads before the Landing's copy and its two ways on can
 * show: the scripts the document asks for and everything they import
 * outright, with their styles. Read from the build itself, so a page that
 * finds its way back into the first load fails here rather than on a phone.
 */

const web = fileURLToPath(new URL('..', import.meta.url))

type Chunk = { fileName: string; isEntry: boolean; imports: string[]; dynamicImports: string[]; moduleIds: string[] }

/** The app's own areas a Visitor has no use for; each is a folder of `src`. */
const areas = ['admin', 'calendar', 'design-system', 'goals', 'header', 'home', 'lab', 'library', 'room', 'rooms', 'settings']

/** The few modules of those areas the first load may hold: the addresses that tell a Visitor's path from an Account's. */
const addresses = [
  'calendar/paths.ts',
  'goals/paths.ts',
  'home/home.ts',
  'lab/paths.ts',
  'library/paths.ts',
  'room/roomCode.ts',
  'rooms/paths.ts',
  'settings/paths.ts',
]

/** Packages only the pages behind the Sign-in and the scene use: charting, three.js and the poker engine. */
const packages = /\/node_modules\/(?:\.pnpm\/)?(?:recharts|d3-|victory-|three)|\/packages\/poker\//

let chunks: Chunk[]
/** A module's path from `src`, or its whole id where it isn't the app's. */
const named = (id: string) => id.replace(/[?#].*$/, '').replace(`${web}src/`, '')

beforeAll(async () => {
  // As `pnpm build` builds it: vitest's own NODE_ENV would bundle React's development build.
  const env = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const built = await build({ root: web, mode: 'production', logLevel: 'silent', build: { write: false } })
    const { output } = Array.isArray(built) ? built[0] : (built as { output: unknown[] })
    chunks = (output as ({ type: string } & Chunk)[]).filter((file) => file.type === 'chunk')
  } finally {
    process.env.NODE_ENV = env
  }
}, 120_000)

/** The modules in the chunks the document's script imports outright, itself included. */
function firstLoad(): string[] {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const seen = new Set<Chunk>()
  const take = (chunk: Chunk | undefined) => {
    if (!chunk || seen.has(chunk)) return
    seen.add(chunk)
    chunk.imports.forEach((name) => take(byName.get(name)))
  }
  chunks.filter((chunk) => chunk.isEntry).forEach(take)
  return [...seen].flatMap((chunk) => chunk.moduleIds).map(named)
}

describe("a Visitor's first load", () => {
  it('holds the Landing', () => {
    expect(firstLoad()).toContain('landing/Landing.tsx')
  })

  it('holds no Library, Room, Settings, Lab or other page of the app', () => {
    const pages = firstLoad().filter((id) => areas.some((area) => id.startsWith(`${area}/`)) && !addresses.includes(id))
    expect(pages).toEqual([])
  })

  it('holds no charting, three.js or poker engine', () => {
    expect(firstLoad().filter((id) => packages.test(id))).toEqual([])
  })

  it('leaves the scene to a chunk of its own, asked for later', () => {
    expect(firstLoad()).not.toContain('landing/scene/LandingScene.ts')
    const scene = chunks.find((chunk) => chunk.moduleIds.map(named).includes('landing/scene/LandingScene.ts'))
    expect(scene?.isEntry).toBe(false)
    expect(chunks.some((chunk) => chunk.dynamicImports.includes(scene!.fileName))).toBe(true)
  })

  it('holds no message catalogue: each language comes in chunks of its own, asked for as it is needed', () => {
    expect(firstLoad().filter((id) => id.startsWith('i18n/messages/'))).toEqual([])
  })

  // The first load's messages are the Landing's and the few the app may show before any other screen has arrived
  // (`i18n/messages/first`): a module of the first load that reads any other would find it not yet there.
  it('reads no message but the ones that arrive with it', () => {
    // What only an identity is shown, which `identity/SessionProvider` holds back until the whole catalogue is here.
    const forAnIdentity = ['identity/ChooseDisplayName.tsx', 'identity/ImpersonationBanner.tsx']
    const early: string[] = []
    for (const id of firstLoad()) {
      const file = `${web}src/${id}`
      if (id.startsWith('/') || !existsSync(file) || forAnIdentity.includes(id)) continue
      const source = readFileSync(file, 'utf8')
      // A key written out, and one put together from a prefix, as `landing.${caption}.title` is.
      for (const [, key] of source.matchAll(/\bt\(\s*'([^']+)'/g)) if (!(key in firstMessages)) early.push(`${id}: ${key}`)
      for (const [, prefix] of source.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) {
        if (!Object.keys(firstMessages).some((key) => key.startsWith(prefix)) || !prefix) early.push(`${id}: ${prefix}…`)
      }
    }
    expect(early).toEqual([])
  })
})
