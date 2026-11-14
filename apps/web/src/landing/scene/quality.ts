/**
 * How much the Landing's scene asks of a device. `high` and `medium` play
 * the story as it moves; `still` draws it only where it rests, one picture
 * per stop, for a Visitor who asked for less motion or a device that can't
 * keep up.
 */
export type Tier = 'high' | 'medium' | 'still'

/** What is known of a device before the scene has drawn a frame on it. */
export type Device = {
  /** The Visitor asked the system for less motion. */
  reducedMotion: boolean
  /** A finger, not a mouse: a phone or a tablet. */
  coarsePointer: boolean
  /** Processor cores and gigabytes of memory, where the browser says. */
  cores?: number
  memory?: number
}

/** The tier a device starts on. Phones start on `medium`, whatever they say of themselves. */
export function tierFor({ reducedMotion, coarsePointer, cores, memory }: Device): Tier {
  if (reducedMotion) return 'still'
  if (coarsePointer || (cores !== undefined && cores <= 4) || (memory !== undefined && memory <= 4)) return 'medium'
  return 'high'
}

/**
 * Whether a tier is drawn with a shallow depth of field on a device: `high`
 * is, `medium` never, and a still only where it stands in for `high`, for a
 * Visitor who asked for less motion on a device that could have played it.
 * A still the scene fell to because the device couldn't keep up has none.
 */
export function depthOfFieldFor(tier: Tier, device: Device): boolean {
  if (tier === 'high') return true
  return tier === 'still' && tierFor({ ...device, reducedMotion: false }) === 'high'
}

/** The tier to fall back to from one that is too much; `still` is the last. */
export function tierBelow(tier: Tier): Tier {
  return tier === 'high' ? 'medium' : 'still'
}

/** The slowest a tier may average, in milliseconds a frame: 45 a second on `high`, 28 on `medium`. */
const slowest: Record<Tier, number> = { high: 1000 / 45, medium: 1000 / 28, still: Infinity }

/** Frames left out at the start, while shaders compile and textures arrive, and frames averaged after. */
const warmUp = 40
const window = 90

/**
 * Watches a tier's frames. `frame` takes the milliseconds since the frame
 * before and answers true once the last ninety have averaged slower than the
 * tier allows. A gap of a quarter of a second or more is the tab in the
 * background, not a slow frame, and isn't counted.
 */
export function paceOf(tier: Tier): { frame(milliseconds: number): boolean } {
  let seen = 0
  const last: number[] = []
  return {
    frame(milliseconds) {
      if (!(milliseconds > 0) || milliseconds >= 250) return false
      if (++seen <= warmUp) return false
      last.push(milliseconds)
      if (last.length > window) last.shift()
      if (last.length < window) return false
      return last.reduce((sum, each) => sum + each, 0) / window > slowest[tier]
    },
  }
}
