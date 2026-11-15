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
   * What a Visitor downloads before the copy and the two ways on can show:
   * the document, the scripts it asks for with everything they import
   * outright, and their styles, each gzipped. Fonts are not counted: the copy
   * shows in a fallback face until they arrive.
   */
  criticalPath: number
  /** The chunk that holds the scene and three.js, gzipped. */
  sceneChunk: number
  /** The pictures in `src/landing/scene/textures`, as they are: already compressed. */
  textures: number
}

/**
 * The ceilings, each a little above what the build of 2026-11-15 weighed
 * (gzip -9; 1 kB is 1000 bytes):
 *
 * - critical path 133.8 kB: entry script 78.4 kB, a shared chunk 43.4 kB (the
 *   whole message catalogue, both languages), the React runtime 3.4 kB,
 *   styles 8.1 kB, the document 0.5 kB
 * - scene chunk 157.4 kB, nearly all of it three.js's renderer, which comes
 *   whole however little of it a scene uses
 * - textures 132.8 kB: felt 64.8 kB, card back 44.5 kB, chip face 17.9 kB,
 *   studio 5.6 kB
 *
 * The textures' ceiling is the spec's, not a measurement: `textures/encode.mjs`
 * says what each is made from. The build prints what it weighed.
 */
export const ceilings: Weights = {
  criticalPath: 138_000,
  sceneChunk: 160_000,
  textures: 250_000,
}

type Chunk = { type: 'chunk'; fileName: string; code: string; isEntry: boolean; imports: string[]; moduleIds: string[] }
type Asset = { type: 'asset'; fileName: string; source: string | Uint8Array; originalFileNames?: string[] }
type Bundle = Record<string, Chunk | Asset | { type: string }>

const scene = '/src/landing/scene/LandingScene.ts'
const texturesFolder = 'src/landing/scene/textures/'

const gzipped = (content: string | Uint8Array) => gzipSync(content, { level: 9 }).length

/** Weighs what the build is about to write. */
export function weigh(bundle: Bundle): Weights {
  const files = Object.values(bundle)
  const chunks = files.filter((file): file is Chunk => file.type === 'chunk')
  const assets = files.filter((file): file is Asset => file.type === 'asset')
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))

  // The document's scripts and everything they import outright.
  const first = new Set<Chunk>()
  const take = (chunk: Chunk | undefined) => {
    if (!chunk || first.has(chunk)) return
    first.add(chunk)
    chunk.imports.forEach((name) => take(byName.get(name)))
  }
  chunks.filter((chunk) => chunk.isEntry).forEach(take)
  // Their styles: the ones the document links to.
  const document = assets.find((asset) => asset.fileName === 'index.html')
  const markup = document ? String(document.source) : ''
  const styles = assets.filter((asset) => asset.fileName.endsWith('.css') && markup.includes(asset.fileName))

  const sceneChunk = chunks.find((chunk) => chunk.moduleIds.some((id) => id.replace(/[?#].*$/, '').endsWith(scene)))
  const textures = assets.filter((asset) => asset.originalFileNames?.some((name) => name.includes(texturesFolder)))

  return {
    criticalPath:
      (document ? gzipped(document.source) : 0) +
      [...first].reduce((sum, chunk) => sum + gzipped(chunk.code), 0) +
      styles.reduce((sum, style) => sum + gzipped(style.source), 0),
    sceneChunk: sceneChunk ? gzipped(sceneChunk.code) : 0,
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
    generateBundle(_options, bundle) {
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
  }
}
