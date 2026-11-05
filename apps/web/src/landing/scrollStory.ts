/**
 * The landing's story: the five sections the visitor scrolls through, and
 * the part of the video each one carries. The clip is 20 s at 24 fps: a
 * golden ribbon waves like a graph (0–5 s), tightens into a V and dives
 * (5–6.5 s), falls like a bolt and strikes the floor (6.5–7.5 s), draws the
 * oval of a poker table (7.5–8 s) whose rim burns (8–12 s), and then the table
 * settles, lit and empty (12–20 s).
 */

export type StorySection = 'opening' | 'results' | 'library' | 'rooms' | 'close'

/** The time of the clip's last frame: 480 frames at 24 fps. */
export const lastFrame = 479 / 24

/**
 * In order down the page: how tall each section is, in viewport heights,
 * and the video time it starts on. The heights are the tuning knob for how
 * unhurried the story feels; the close is one screen, the page's last.
 */
export const story: readonly { section: StorySection; screens: number; startsAt: number }[] = [
  { section: 'opening', screens: 1.25, startsAt: 0 },
  { section: 'results', screens: 1.5, startsAt: 2.5 },
  { section: 'library', screens: 1.5, startsAt: 5 },
  { section: 'rooms', screens: 1.5, startsAt: 7.5 },
  { section: 'close', screens: 1, startsAt: 12 },
]

/** How far the page scrolls, in viewport heights: everything but the last screen. */
const scrollScreens = story.reduce((total, { screens }) => total + screens, 0) - 1

/**
 * The scroll progress at which a section starts: when its top reaches the
 * middle of the viewport, which is where its copy sits.
 */
export function sectionStart(section: StorySection): number {
  let top = 0
  for (const entry of story) {
    if (entry.section === section) return Math.max(0, top - 0.5) / scrollScreens
    top += entry.screens
  }
  throw new Error(`No section ${section} in the landing's story`)
}

/** Each section's start, then the end of the scroll: the knots of the mapping. */
const knots = [
  ...story.map(({ section, startsAt }) => ({ progress: sectionStart(section), time: startsAt })),
  { progress: 1, time: lastFrame },
]

/**
 * The landing's video time for a scroll progress: 0 at the top of the page
 * gives the first frame, 1 at the end of the scroll gives the last, and in
 * between each section runs through its own part of the clip. More progress
 * never gives an earlier time; progress outside 0–1 is held at the ends.
 */
export function videoTimeAt(progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  for (let i = 1; i < knots.length; i++) {
    const from = knots[i - 1]
    const to = knots[i]
    if (p <= to.progress) {
      return from.time + ((p - from.progress) / (to.progress - from.progress)) * (to.time - from.time)
    }
  }
  return lastFrame
}
