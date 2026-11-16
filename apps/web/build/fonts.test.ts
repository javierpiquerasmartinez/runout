// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

/*
 * The Landing's fonts, read from the build: the document asks ahead for the
 * headline's face and no other, and no face holds the copy back while it
 * loads.
 */

const web = fileURLToPath(new URL('..', import.meta.url))

type Asset = { type: string; fileName: string; source: string | Uint8Array }

let assets: Asset[]
let document: string

beforeAll(async () => {
  // As `pnpm build` builds it: vitest's own NODE_ENV would bundle React's development build.
  const env = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const built = await build({ root: web, mode: 'production', logLevel: 'silent', build: { write: false } })
    const { output } = Array.isArray(built) ? built[0] : (built as { output: unknown[] })
    assets = (output as Asset[]).filter((file) => file.type === 'asset')
    document = String(assets.find((asset) => asset.fileName === 'index.html')!.source)
  } finally {
    process.env.NODE_ENV = env
  }
}, 120_000)

describe("the Landing's fonts", () => {
  it("asks ahead for the headline's font, and no other", () => {
    const preloads = document.match(/<link[^>]+rel="preload"[^>]*>/g) ?? []
    expect(preloads).toHaveLength(1)

    const preload = preloads[0] ?? ''
    const href = /href="\/([^"]+)"/.exec(preload)?.[1]
    expect(href).toMatch(/^assets\/instrument-serif-latin-400-normal-[\w-]+\.woff2$/)
    expect(assets.map((asset) => asset.fileName)).toContain(href)
    expect(preload).toContain('as="font"')
    expect(preload).toContain('type="font/woff2"')
    // A font asked for without it is downloaded twice.
    expect(preload).toContain('crossorigin')
  })

  it('shows the copy in a fallback face until each font arrives', () => {
    const styles = assets.filter((asset) => asset.fileName.endsWith('.css') && document.includes(asset.fileName))
    const faces = styles.flatMap((style) => String(style.source).match(/@font-face\s*\{[^}]*\}/g) ?? [])
    // The faces that download something; the fallbacks are fonts the device already has.
    const downloaded = faces.filter((face) => /url\(/.test(face))
    expect(downloaded.length).toBeGreaterThan(0)
    expect(downloaded.filter((face) => !/font-display:\s*swap/.test(face))).toEqual([])
  })
})
