/*
 * Captures the Landing's scene at rest on every stop, in a wide and a tall
 * shape, and writes the pictures into the app: what a Visitor sees where the
 * scene can't be drawn, and what the Sign-in page has behind it. Run it again
 * whenever the scene changes how a stop looks:
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

const server = await createServer({ root, server: { host: '127.0.0.1', port: 5193 }, logLevel: 'warn' })
await server.listen()
const browser = await chromium.launch({ args: ['--enable-gpu'] })
try {
  await mkdir(into, { recursive: true })
  for (const { name, window, picture } of shapes) {
    const page = await browser.newPage({ viewport: window, deviceScaleFactor: 2 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error))
    await page.goto(`${server.resolvedUrls.local[0]}scripts/capture.html`)
    // The textures and the cards' font are in, and the scene has drawn with them.
    await page.waitForFunction(() => 'capture' in window)
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)

    const stops = await page.evaluate(() => window.capture.stops)
    for (let stop = 0; stop < stops; stop++) {
      await page.evaluate((stop) => window.capture.show(stop), stop)
      const png = (await page.screenshot({ type: 'png' })).toString('base64')
      const webp = Buffer.from(
        await page.evaluate(([png, width, height, quality]) => window.capture.encode(png, width, height, quality), [
          png,
          picture.width,
          picture.height,
          quality,
        ]),
        'base64',
      )
      await writeFile(`${into}${name}-${stop}.webp`, webp)
      console.log(`${name}-${stop}.webp  ${picture.width}×${picture.height}  ${(webp.length / 1000).toFixed(1)} kB`)
    }
    if (errors.length) throw errors[0]
    await page.close()
  }
} finally {
  await browser.close()
  await server.close()
}
