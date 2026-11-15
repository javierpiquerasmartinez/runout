// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { weigh } from './budget.ts'

/*
 * What the budget weighs, on builds made up here: a few files each, so that
 * what is counted, and what makes the weighing fail, can be said exactly.
 * `budget.test.ts` holds the app's own build to its ceilings.
 */

const gzipped = (content: string | Uint8Array) => gzipSync(content, { level: 9 }).length
/** Text that doesn't compress, so every file's weight is its own. */
const noise = (bytes: number) => randomBytes(bytes).toString('hex')

const chunk = (fileName: string, code: string, { imports = [] as string[], moduleIds = [] as string[], isEntry = false } = {}) =>
  ({ type: 'chunk', fileName, code, imports, moduleIds, isEntry }) as const
const asset = (fileName: string, source: string | Uint8Array, originalFileNames: string[] = []) =>
  ({ type: 'asset', fileName, source, originalFileNames }) as const

const page = (body: string, messages: string) =>
  `<!doctype html><html><head>` +
  `<script type="module" crossorigin src="/assets/index.js"></script>` +
  `<link rel="modulepreload" crossorigin href="/assets/runtime.js">` +
  `<link rel="modulepreload" crossorigin href="/assets/${messages}">` +
  `<link rel="stylesheet" crossorigin href="/assets/index.css">` +
  `<link rel="preload" as="font" type="font/woff2" href="/assets/serif.woff2" crossorigin>` +
  `<link rel="icon" href="/favicon.svg">` +
  `</head><body><div id="root">${body}</div></body></html>`

const files = {
  spanish: asset('index.html', page(noise(300), 'es.js')),
  english: asset('en/index.html', page(noise(900), 'en.js')),
  app: asset('app.html', page(noise(40000), 'es.js')),
  entry: chunk('assets/index.js', noise(4000), { isEntry: true, imports: ['assets/runtime.js', 'assets/shared.js'] }),
  runtime: chunk('assets/runtime.js', noise(1000)),
  shared: chunk('assets/shared.js', noise(700)),
  es: chunk('assets/es.js', noise(200)),
  en: chunk('assets/en.js', noise(260)),
  styles: asset('assets/index.css', noise(800)),
  otherStyles: asset('assets/LibraryPage.css', noise(2000)),
  library: chunk('assets/LibraryPage.js', noise(9000), { imports: ['assets/shared.js'] }),
  font: asset('assets/serif.woff2', randomBytes(3000)),
  scene: chunk('assets/LandingScene.js', noise(6000), {
    imports: ['assets/three.js', 'assets/shared.js'],
    moduleIds: ['/repo/apps/web/src/landing/scene/LandingScene.ts'],
  }),
  three: chunk('assets/three.js', noise(5000)),
  felt: asset('assets/felt.webp', randomBytes(640), ['src/landing/scene/textures/felt-3.webp']),
  chip: asset('assets/chip.webp', randomBytes(170), ['src/landing/scene/textures/chip-face.webp']),
  still: asset('assets/wide-0.webp', randomBytes(900), ['src/landing/stills/wide-0.webp']),
}
type Built = typeof files
const bundleOf = (built: Partial<Built> = files) => Object.fromEntries(Object.values(built).map((file) => [file.fileName, file]))
const without = (...names: (keyof Built)[]) => bundleOf(Object.fromEntries(Object.entries(files).filter(([name]) => !names.includes(name as keyof Built))))

const sum = (...of: (keyof Built)[]) =>
  of.map((name) => files[name]).reduce((total, file) => total + gzipped(file.type === 'chunk' ? file.code : file.source), 0)

describe('what the budget weighs', () => {
  it('weighs, for the critical path, what the heavier Landing document has a Visitor download: itself, its scripts with all they import outright, the chunks it asks for ahead and its styles', () => {
    expect(weigh(bundleOf()).criticalPath).toBe(sum('english', 'entry', 'runtime', 'shared', 'en', 'styles'))
  })

  it("leaves out the app's own document, the fonts, and what no Landing document asks for", () => {
    const { criticalPath } = weigh(bundleOf())
    expect(criticalPath).toBeLessThan(gzipped(files.app.source))
    expect(weigh(without('app', 'font', 'library', 'otherStyles', 'still')).criticalPath).toBe(criticalPath)
  })

  it("weighs the scene's chunk with what it imports outright that the critical path hasn't brought already", () => {
    expect(weigh(bundleOf()).sceneChunk).toBe(sum('scene', 'three'))
  })

  it("weighs the scene's textures as they are, and no other picture", () => {
    expect(weigh(bundleOf()).textures).toBe(640 + 170)
  })
})

describe('a build with nothing to weigh', () => {
  it.each([
    ["no Landing document", without('spanish', 'english'), /no Landing document/i],
    ["a Landing document that asks for no script", bundleOf({ ...files, spanish: asset('index.html', '<html></html>'), english: asset('en/index.html', '<html></html>') }), /asks for no script/],
    ["a file a Landing document asks for missing", without('styles'), /assets\/index\.css/],
    ["the scene's module in no chunk, as when it is renamed", bundleOf({ ...files, scene: chunk('assets/LandingScene.js', noise(10), { moduleIds: ['/repo/apps/web/src/landing/scene/Scene.ts'] }) }), /src\/landing\/scene\/LandingScene\.ts/],
    ["no texture, as when their folder is renamed", without('felt', 'chip'), /src\/landing\/scene\/textures\//],
  ])('fails for %s, rather than weigh nothing and pass', (_what, bundle, says) => {
    expect(() => weigh(bundle)).toThrow(says)
  })
})
