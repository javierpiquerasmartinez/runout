import { describe, expect, it } from 'vitest'
import { lastFrame, sectionStart, videoTimeAt } from './scrollStory'

describe('videoTimeAt', () => {
  it('shows the first frame at the top of the page and the last frame at the end of the scroll', () => {
    expect(videoTimeAt(0)).toBe(0)
    expect(videoTimeAt(1)).toBe(lastFrame)
    expect(lastFrame).toBeCloseTo(479 / 24)
  })

  it('holds the first frame above the top and the last frame past the end, as a bounce overscrolls', () => {
    expect(videoTimeAt(-0.2)).toBe(0)
    expect(videoTimeAt(1.3)).toBe(lastFrame)
  })

  it.each([
    ['results', 2.5, 'over the waving ribbon'],
    ['library', 5, 'as the wave tightens and dives'],
    ['rooms', 7.5, 'at the strike'],
    ['close', 12, 'once the table settles'],
  ] as const)('starts the %s section at %ss, %s', (section, seconds, _phase) => {
    expect(videoTimeAt(sectionStart(section))).toBeCloseTo(seconds)
  })

  it('starts each section further down the page than the one before', () => {
    const starts = (['opening', 'results', 'library', 'rooms', 'close'] as const).map(sectionStart)
    expect(starts[0]).toBe(0)
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1])
    expect(starts[4]).toBeLessThan(1)
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
