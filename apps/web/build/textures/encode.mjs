/*
 * Makes the scene's textures from the originals beside this file: each
 * resized to what the scene shows of it and encoded as WebP, into
 * `src/landing/scene/textures`. The originals are never shipped; the build
 * holds what this writes to 250 kB together (see `../budget.ts`).
 *
 * Run it again only to change a size or a quality. It needs sharp, which is
 * not among the app's dependencies: install it anywhere and point Node at it,
 *
 *   npm install --prefix /tmp/sharp sharp
 *   NODE_PATH=/tmp/sharp/node_modules node build/textures/encode.mjs
 */
import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const sharp = createRequire(import.meta.url)('sharp')
const originals = fileURLToPath(new URL('./originals/', import.meta.url))
const textures = fileURLToPath(new URL('../../src/landing/scene/textures/', import.meta.url))

const encodings = [
  // The same size as the faces the scene paints for the cards.
  { name: 'card-back', width: 432, height: 608, quality: 80 },
  // The dive brings chips close to the camera, out of focus; everywhere else a chip is a few dozen pixels.
  { name: 'chip-face', width: 768, height: 768, quality: 75 },
  // Tiled over the table and tinted near-black: only its grain shows.
  { name: 'felt-3', width: 512, height: 512, quality: 75 },
  // Only ever seen in reflections, which are made from it at 256 px a face.
  { name: 'studio-2', width: 1024, height: 512, quality: 80 },
]

let total = 0
for (const { name, width, height, quality } of encodings) {
  const to = `${textures}${name}.webp`
  await sharp(`${originals}${name}.jpeg`)
    .resize(width, height, { kernel: 'lanczos3' })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toFile(to)
  const size = statSync(to).size
  total += size
  console.log(`${name}.webp ${width}×${height} q${quality}: ${(size / 1000).toFixed(1)} kB`)
}
console.log(`together: ${(total / 1000).toFixed(1)} kB`)
