/**
 * The Runout wave as numbers: the same drawing as `ui/BrandMark`'s path,
 * `M3 17c3.4 0 3.4-10 6.8-10S13.2 17 16.6 17 20 11.5 21 9.5`, in its 24×24
 * box, as three cubic Béziers. The Landing's scene draws it as a line of
 * light and stacks chips to its height.
 */
const curves: readonly (readonly [number, number])[][] = [
  [
    [3, 17],
    [6.4, 17],
    [6.4, 7],
    [9.8, 7],
  ],
  [
    [9.8, 7],
    [13.2, 7],
    [13.2, 17],
    [16.6, 17],
  ],
  [
    [16.6, 17],
    [20, 17],
    [20, 11.5],
    [21, 9.5],
  ],
]

/** Where the drawing starts and ends across, and its lowest and highest points, in the mark's box. */
const left = 3
const right = 21
const low = 17
const high = 7

/** Where across the wave its crest is, from 0 to 1. */
export const waveCrestAt = (9.8 - left) / (right - left)

function bezier(points: readonly (readonly [number, number])[], t: number, axis: 0 | 1): number {
  const u = 1 - t
  return (
    u * u * u * points[0][axis] +
    3 * u * u * t * points[1][axis] +
    3 * u * t * t * points[2][axis] +
    t * t * t * points[3][axis]
  )
}

/**
 * The wave as `count` points from its left end to its right: `x` from 0 to 1
 * across, `y` from 0 at its lowest to 1 at its crest, up being positive.
 */
export function wavePoints(count: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const along = (i / (count - 1)) * curves.length
    const curve = curves[Math.min(curves.length - 1, Math.floor(along))]
    const t = Math.min(1, along - curves.indexOf(curve))
    points.push({
      x: (bezier(curve, t, 0) - left) / (right - left),
      y: (low - bezier(curve, t, 1)) / (low - high),
    })
  }
  return points
}

const samples = wavePoints(241)

/** How high the wave is at `x` across it, both from 0 to 1; held at its ends outside them. */
export function waveHeightAt(x: number): number {
  if (x <= 0) return samples[0].y
  for (let i = 1; i < samples.length; i++) {
    const to = samples[i]
    if (x <= to.x) {
      const from = samples[i - 1]
      const span = to.x - from.x
      return span > 0 ? from.y + ((x - from.x) / span) * (to.y - from.y) : to.y
    }
  }
  return samples[samples.length - 1].y
}
