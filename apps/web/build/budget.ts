import { gzipSync } from 'node:zlib'
import type { Plugin } from 'vite'

/*
 * The Landing's weight budget, held by the build: `vite build` fails, naming
 * what grew and by how much, when one of these passes its ceiling. Raising a
 * ceiling is deciding the Landing may be heavier; lower one when the Landing
 * gets lighter, so it can't grow back unseen.
 */

/** What the budget weighs, in bytes. */
export type Weights = {
  /**
   * What a Visitor downloads before the copy and the two ways on can show,
   * for the heavier of the Landing's documents: the document, the scripts it
   * asks for with everything they import outright, the chunks it asks for
   * ahead (the messages in its language) and its styles, each gzipped as it
   * is written to disk. Fonts are not counted: the copy shows in a fallback
   * face until they arrive.
   */
  criticalPath: number
  /** The chunk that holds the scene, with what it imports outright that the critical path hasn't brought already: three.js. Gzipped. */
  sceneChunk: number
  /** The pictures in `src/landing/scene/textures`, as they are: already compressed. */
  textures: number
}

/**
 * The ceilings, each a little above what the build of 2026-11-15 weighed
 * (gzip -9; 1 kB is 1000 bytes):
 *
 * - critical path 99.9 kB, for the Landing in Spanish, the heavier of the two
 *   by a tenth of a kB: entry script 82.3 kB, the chunks it imports outright
 *   5.9 kB (the React runtime 3.4 kB, routing 2.4 kB), the Landing's messages
 *   in the document's language 0.9 kB, styles 8.1 kB, the document with the
 *   Landing in it 2.8 kB
 * - scene chunk 157.6 kB, nearly all of it three.js's renderer, which comes
 *   whole however little of it a scene uses
 * - textures 132.8 kB: felt 64.8 kB, card back 44.5 kB, chip face 17.9 kB,
 *   studio 5.6 kB
 *
 * The textures' ceiling is the spec's, not a measurement: `textures/encode.mjs`
 * says what each is made from. The build prints what it weighed.
 */
export const ceilings: Weights = {
  criticalPath: 102_000,
  sceneChunk: 160_000,
  textures: 250_000,
}

type Chunk = { type: 'chunk'; fileName: string; code: string; imports: string[]; moduleIds: string[] }
type Asset = { type: 'asset'; fileName: string; source: string | Uint8Array; originalFileNames?: string[] }
type Bundle = Record<string, Chunk | Asset | { type: string }>

/** The document that holds no Landing: the app's, for every other path (`landingDocuments.ts`). */
const appDocument = 'app.html'
const scene = 'src/landing/scene/LandingScene.ts'
const texturesFolder = 'src/landing/scene/textures/'

const gzipped = (content: string | Uint8Array) => gzipSync(content, { level: 9 }).length

/**
 * Weighs what the build is about to write. It fails where it finds nothing
 * to weigh (no Landing document, the scene's module or its textures not
 * where they are looked for), since a budget that weighs nothing is never
 * passed.
 */
export function weigh(bundle: Bundle): Weights {
  const files = Object.values(bundle)
  const chunks = new Map(files.filter((file): file is Chunk => file.type === 'chunk').map((chunk) => [chunk.fileName, chunk]))
  const assets = new Map(files.filter((file): file is Asset => file.type === 'asset').map((asset) => [asset.fileName, asset]))
  const nothing = (what: string): never => {
    throw new Error(`The Landing's budget found nothing to weigh: ${what}. What it looks for is in apps/web/build/budget.ts.`)
  }

  /** A chunk and everything it imports outright, by file name. */
  const withImports = (fileName: string, into = new Set<string>()) => {
    const chunk = chunks.get(fileName)
    if (!chunk || into.has(fileName)) return into
    into.add(fileName)
    chunk.imports.forEach((name) => withImports(name, into))
    return into
  }
  const weightOf = (fileName: string) => {
    const file = chunks.get(fileName) ?? assets.get(fileName)
    if (!file) return nothing(`${fileName}, which a Landing document asks for`)
    return gzipped(file.type === 'chunk' ? file.code : file.source)
  }

  // What each Landing document has the browser download before it can show: its scripts, the chunks it asks for ahead and its styles.
  const documents = [...assets.values()].filter(({ fileName }) => fileName.endsWith('.html') && fileName !== appDocument)
  if (!documents.length) nothing('no Landing document among the files of the build')
  const paths = documents.map((document) => {
    const markup = String(document.source)
    const asked = (pattern: RegExp) => [...markup.matchAll(pattern)].map(([, address]) => address.replace(/^\//, ''))
    const scripts = asked(/<script\b[^>]*\bsrc="([^"]+)"/g)
    if (!scripts.length) nothing(`${document.fileName} asks for no script`)
    const first = new Set<string>()
    for (const script of [...scripts, ...asked(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g)]) {
      if (!chunks.has(script)) nothing(`${script}, which ${document.fileName} asks for`)
      withImports(script, first)
    }
    const styles = asked(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)
    return { first, weight: gzipped(document.source) + [...first, ...styles].reduce((sum, name) => sum + weightOf(name), 0) }
  })
  const heaviest = paths.reduce((heavier, path) => (path.weight > heavier.weight ? path : heavier))

  const sceneChunk = [...chunks.values()].find((chunk) => chunk.moduleIds.some((id) => id.replace(/[?#].*$/, '').endsWith(`/${scene}`)))
  if (!sceneChunk) return nothing(`no chunk holds ${scene}`)
  const later = [...withImports(sceneChunk.fileName)].filter((name) => !heaviest.first.has(name))

  const textures = [...assets.values()].filter((asset) => asset.originalFileNames?.some((name) => name.includes(texturesFolder)))
  if (!textures.length) nothing(`no picture of the build comes from ${texturesFolder}`)

  return {
    criticalPath: heaviest.weight,
    sceneChunk: later.reduce((sum, name) => sum + weightOf(name), 0),
    textures: textures.reduce((sum, texture) => sum + texture.source.length, 0),
  }
}

const kB = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`

const names: Record<keyof Weights, [name: string, weighs: string, its: string]> = {
  criticalPath: ["The Landing's critical path", 'weighs', 'its'],
  sceneChunk: ["The scene's chunk", 'weighs', 'its'],
  textures: ["The scene's textures", 'weigh', 'their'],
}

/** What is over its ceiling, and by how much: a line each, none where everything fits. */
export function overweight(weights: Weights, limits: Weights = ceilings): string[] {
  return (Object.keys(names) as (keyof Weights)[])
    .filter((part) => weights[part] > limits[part])
    .map((part) => {
      const [name, weighs, its] = names[part]
      return `${name} ${weighs} ${kB(weights[part])}, ${kB(weights[part] - limits[part])} over ${its} ceiling of ${kB(limits[part])}`
    })
}

/** Fails the build when the Landing weighs more than `limits`. `weighed` is told what it weighs. */
export function landingBudget(limits: Weights = ceilings, weighed?: (weights: Weights) => void): Plugin {
  return {
    name: 'runout:landing-budget',
    apply: 'build',
    enforce: 'post',
    // After every other plugin has had the bundle: the files are weighed as they are written, the Landing in its documents.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const weights = weigh(bundle as unknown as Bundle)
        weighed?.(weights)
        this.info(
          `The Landing weighs: critical path ${kB(weights.criticalPath)}, scene chunk ${kB(weights.sceneChunk)}, textures ${kB(weights.textures)}`,
        )
        const over = overweight(weights, limits)
        if (over.length) {
          this.error(`${over.join('\n')}\nThe ceilings are in apps/web/build/budget.ts.`)
        }
      },
    },
  }
}
