import { describe, expect, it } from 'vitest'
import { lastFrameSeconds, sectionStart, story, videoTimeAt } from './scrollStory'

describe('videoTimeAt', () => {
  it('shows the first frame at the top of the page and the last frame at the end of the scroll', () => {
    expect(videoTimeAt(0)).toBe(0)
    expect(videoTimeAt(1)).toBe(lastFrameSeconds)
    expect(lastFrameSeconds).toBeCloseTo(479 / 24)
  })

  it('holds the first frame above the top and the last frame past the end, as a bounce overscrolls', () => {
    expect(videoTimeAt(-0.2)).toBe(0)
    expect(videoTimeAt(1.3)).toBe(lastFrameSeconds)
  })

  it.each([
    ['results', 2.5, 'over the waving ribbon'],
    ['library', 5, 'as the wave tightens and dives'],
    ['rooms', 7.5, 'at the strike'],
    ['close', 12, 'once the table settles'],
  ] as const)('reaches the %s section, its top crossing the middle of the screen, at %ss, %s', (section, seconds, _phase) => {
    expect(videoTimeAt(sectionStart(section))).toBeCloseTo(seconds)
  })

  it('never runs backwards as the visitor scrolls down', () => {
    let previous = videoTimeAt(0)
    for (let step = 1; step <= 1000; step++) {
      const time = videoTimeAt(step / 1000)
      expect(time).toBeGreaterThanOrEqual(previous)
      previous = time
    }
  })
})

describe('sectionStart', () => {
  it('starts each section of the story further down the page than the one before', () => {
    const starts = story.map(({ section }) => sectionStart(section))
    expect(starts[0]).toBe(0)
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1])
    expect(starts.at(-1)).toBeLessThan(1)
  })
})
