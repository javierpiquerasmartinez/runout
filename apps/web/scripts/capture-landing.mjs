/*
 * Captures the Landing's scene at rest on every stop, in a wide and a tall
 * shape, and writes the pictures into the app: what a Visitor sees where the
 * scene can't be drawn, and what the Sign-in page has behind it. With them it
 * takes the picture a link to Runout previews with, of one stop, at the size
 * previews expect. Run it again whenever the scene changes how a stop looks:
 *
 *   pnpm capture:landing
 *
 * It starts a Vite of its own, opens `scripts/capture.html` (the scene alone,
 * as a still: what the high tier draws, depth of field and all) in a headless
 * Chromium, and takes each stop as the browser shows it. With the machine's
 * graphics card it takes a few seconds; without one, longer.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const into = fileURLToPath(new URL('../src/landing/stills/', import.meta.url))

/*
 * The window each shape is drawn in, in CSS pixels, and the picture kept of
 * it. The wide one is drawn at twice the picture's size and scaled down,
 * which smooths its edges and its grain; the tall one is kept as drawn, a
 * phone's two device pixels to one.
 */
const shapes = [
  { name: 'wide', window: { width: 1600, height: 900 }, picture: { width: 1600, height: 900 } },
  { name: 'tall', window: { width: 400, height: 800 }, picture: { width: 800, height: 1600 } },
]
const quality = 0.8

/*
 * The picture a link to Runout previews with (`build/landingDocuments.ts`
 * puts its address in the Landing's documents): the Hand dealt to the river,
 * at 1200 by 630, the 1.91 to 1 that a large preview is shown at, drawn at
 * twice that and scaled down. A JPEG: not everything that previews a link
 * reads WebP.
 */
const preview = {
  file: fileURLToPath(new URL('../src/landing/preview.jpg', import.meta.url)),
  stop: 3,
  window: { width: 1200, height: 630 },
  quality: 0.82,
}

const server = await createServer({ root, server: { host: '127.0.0.1', port: 5193 }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch({ args: ['--enable-gpu'] })

/** Opens the scene alone in a window of one size, and gives `take` a way to picture a stop, scaled to a size and encoded. */
async function capturing(window, take) {
  const page = await browser.newPage({ viewport: window, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error))
  await page.goto(`${server.resolvedUrls.local[0]}scripts/capture.html`)
  // The textures and the cards' font are in, and the scene has drawn with them.
  await page.waitForFunction(() => 'capture' in window)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)

  const stops = await page.evaluate(() => window.capture.stops)
  await take(stops, async (stop, { width, height }, quality, type) => {
    await page.evaluate((stop) => window.capture.show(stop), stop)
    const png = (await page.screenshot({ type: 'png' })).toString('base64')
    const encoded = await page.evaluate((asked) => window.capture.encode(...asked), [png, width, height, quality, type])
    return Buffer.from(encoded, 'base64')
  })
  if (errors.length) throw errors[0]
  await page.close()
}

const written = (name, { width, height }, picture) => console.log(`${name}  ${width}×${height}  ${(picture.length / 1000).toFixed(1)} kB`)

try {
  await mkdir(into, { recursive: true })
  for (const { name, window, picture } of shapes) {
    await capturing(window, async (stops, pictureOf) => {
      for (let stop = 0; stop < stops; stop++) {
        const webp = await pictureOf(stop, picture, quality, 'image/webp')
        await writeFile(`${into}${name}-${stop}.webp`, webp)
        written(`${name}-${stop}.webp`, picture, webp)
      }
    })
  }
  await capturing(preview.window, async (_stops, pictureOf) => {
    const jpeg = await pictureOf(preview.stop, preview.window, preview.quality, 'image/jpeg')
    await writeFile(preview.file, jpeg)
    written('preview.jpg', preview.window, jpeg)
  })
} finally {
  await browser.close()
  await server.close()
}
