// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { ceilings, landingBudget, type Weights } from './budget.ts'

/*
 * The Landing's weight, held by the build itself: `pnpm build` fails when
 * the critical path, the scene's chunk or the scene's textures pass their
 * ceilings. Here the app is built as `pnpm build` builds it, with the
 * ceilings as they stand and with ceilings nothing could fit under.
 */

const web = fileURLToPath(new URL('..', import.meta.url))

/** Builds the app, held to `limits` as well as to the ceilings its own config holds it to. */
async function builtWithin(limits: Weights, weighed?: (weights: Weights) => void) {
  // As `pnpm build` builds it: vitest's own NODE_ENV would bundle React's development build.
  const env = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await build({
      root: web,
      mode: 'production',
      logLevel: 'silent',
      build: { write: false },
      plugins: [landingBudget(limits, weighed)],
    })
  } finally {
    process.env.NODE_ENV = env
  }
}

describe("the Landing's weight", () => {
  it('is within its ceilings, and not far under them', async () => {
    let weights: Weights | undefined
    await builtWithin(ceilings, (measured) => (weights = measured))

    for (const part of ['criticalPath', 'sceneChunk', 'textures'] as const) {
      expect(weights?.[part], part).toBeGreaterThan(0)
      expect(weights?.[part], part).toBeLessThanOrEqual(ceilings[part])
    }
    // A ceiling far above what it holds lets the Landing grow unseen: lower it when the Landing gets lighter.
    expect(weights!.criticalPath).toBeGreaterThan(ceilings.criticalPath * 0.9)
    expect(weights!.sceneChunk).toBeGreaterThan(ceilings.sceneChunk * 0.9)
  }, 120_000)

  it("keeps the scene's textures under 250 kB", () => {
    expect(ceilings.textures).toBe(250_000)
  })

  it('fails the build, naming what grew and by how much', async () => {
    const tight: Weights = { criticalPath: 100_000, sceneChunk: ceilings.sceneChunk, textures: 1_000 }
    let weights: Weights | undefined
    const failure = await builtWithin(tight, (measured) => (weights = measured)).then(
      () => null,
      (error: Error) => error.message,
    )

    const kB = (bytes: number) => (bytes / 1000).toFixed(1)
    expect(failure).toContain(
      `The Landing's critical path weighs ${kB(weights!.criticalPath)} kB, ${kB(weights!.criticalPath - 100_000)} kB over its ceiling of 100.0 kB`,
    )
    expect(failure).toContain(
      `The scene's textures weigh ${kB(weights!.textures)} kB, ${kB(weights!.textures - 1_000)} kB over their ceiling of 1.0 kB`,
    )
    expect(failure).not.toContain("The scene's chunk")
  }, 120_000)
})
