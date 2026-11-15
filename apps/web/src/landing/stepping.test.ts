import { describe, expect, it } from 'vitest'
import { headingAfterScroll, stopAskedFor, stopHeadedFor, wheelHeard, type Heading, type WheelGesture } from './stepping'

const lastStop = 6

/** The steps a run of wheel events asks for, each event given as its delta and the milliseconds since the one before. */
function stepsOf(events: (readonly [deltaY: number, after: number])[]): number[] {
  let gesture: WheelGesture | null = null
  let at = 1000
  return events.map(([deltaY, after]) => {
    at += after
    const heard = wheelHeard(gesture, { deltaY, at })
    gesture = heard.gesture
    return heard.step
  })
}

/** A trackpad's swipe: the fingers speed up, lift, and the glide dies away over `milliseconds`, an event a frame. */
function glide(milliseconds: number, direction: 1 | -1 = 1): (readonly [number, number])[] {
  const fingers = [3, 12, 40, 85, 120, 110]
  const frames = Math.round(milliseconds / 16)
  const gliding = Array.from({ length: frames }, (_, frame) => Math.max(1, Math.round(100 * (1 - frame / frames) ** 2)))
  return [...fingers, ...gliding].map((delta) => [delta * direction, 16] as const)
}

const sum = (steps: number[]) => steps.reduce((total, step) => total + Math.abs(step), 0)

describe('the wheel', () => {
  it('moves one stop with one notch, forward or back', () => {
    expect(stepsOf([[100, 0]])).toEqual([1])
    expect(stepsOf([[-100, 0]])).toEqual([-1])
  })

  it('moves one stop for each notch, once the wheel has gone quiet between them', () => {
    expect(stepsOf([[100, 0], [100, 400], [100, 400]])).toEqual([1, 1, 1])
  })

  it('takes a turn too slight to mean anything for none', () => {
    expect(stepsOf([[2, 0], [-1, 500]])).toEqual([0, 0])
  })

  it("moves one stop with a trackpad's swipe, however long its glide lasts", () => {
    for (const milliseconds of [400, 900, 1600, 3000]) {
      const steps = stepsOf(glide(milliseconds))
      expect(sum(steps), `a glide of ${milliseconds} ms`).toBe(1)
      expect(steps.find((step) => step !== 0)).toBe(1)
    }
  })

  it('steps as soon as a swipe that began slightly means something', () => {
    expect(stepsOf([[1, 0], [3, 16], [9, 16], [30, 16]])).toEqual([0, 0, 1, 0])
  })

  it('moves another stop when a second swipe comes over the glide of the first', () => {
    // The first swipe's glide is cut short at a third of its length by the second.
    const first = glide(1500).slice(0, 40)
    const steps = stepsOf([...first, ...glide(1500)])
    expect(sum(steps)).toBe(2)
    expect(sum(steps.slice(0, first.length))).toBe(1)
  })

  it("doesn't take the wobble of a glide for a second swipe", () => {
    const wobbling = glide(1200).map(([delta, after], index) => [delta + (index % 3 === 0 ? 3 : 0), after] as const)
    expect(sum(stepsOf(wobbling))).toBe(1)
  })

  it('goes back at once when the wheel is turned the other way, glide or no glide', () => {
    const steps = stepsOf([...glide(1500).slice(0, 30), ...glide(600, -1)])
    expect(steps.filter((step) => step !== 0)).toEqual([1, -1])
  })
})

describe('the stop headed for', () => {
  it('is the one nearest where the page is scrolled to, while no gesture has sent it anywhere', () => {
    expect(stopHeadedFor(null, 2.2, lastStop)).toBe(2)
    expect(stopHeadedFor(null, 2.6, lastStop)).toBe(3)
    expect(stopHeadedFor(null, 9, lastStop)).toBe(lastStop)
    expect(stopHeadedFor(null, Number.NaN, lastStop)).toBe(0)
  })

  it('is the one a gesture sent the page to, while the page is on its way there', () => {
    expect(stopHeadedFor({ stop: 3, from: 2 }, 2.2, lastStop)).toBe(3)
  })
})

describe('the stop a step asks for', () => {
  it('is the next one, and the one before', () => {
    expect(stopAskedFor(2, 1, lastStop)).toBe(3)
    expect(stopAskedFor(2, -1, lastStop)).toBe(1)
  })

  it('is never before the first or after the last', () => {
    expect(stopAskedFor(0, -1, lastStop)).toBe(0)
    expect(stopAskedFor(lastStop, 1, lastStop)).toBe(lastStop)
  })

  // The page has barely left stop 2 on its way to 3: counting from where it is scrolled to would ask for 3 again, and for 1.
  const onTheWay: Heading = { stop: 3, from: 2 }

  it('is one further on for a second step forward in the middle of a stretch', () => {
    expect(stopAskedFor(stopHeadedFor(onTheWay, 2.2, lastStop), 1, lastStop)).toBe(4)
  })

  it('is the stop just left for a step back in the middle of a stretch, wherever in it the page is', () => {
    expect(stopAskedFor(stopHeadedFor(onTheWay, 2.2, lastStop), -1, lastStop)).toBe(2)
    expect(stopAskedFor(stopHeadedFor(onTheWay, 2.8, lastStop), -1, lastStop)).toBe(2)
  })
})

describe('where a gesture sent the page', () => {
  const heading: Heading = { stop: 3, from: 2 }

  it('is kept while the page scrolls towards it', () => {
    expect(headingAfterScroll(heading, 2.4)).toEqual(heading)
  })

  it('is forgotten once the page is there', () => {
    expect(headingAfterScroll(heading, 3)).toBeNull()
  })

  it('is forgotten when something else scrolls the page away: the scrollbar, Home or End', () => {
    expect(headingAfterScroll(heading, 0)).toBeNull()
    expect(headingAfterScroll(heading, 5.5)).toBeNull()
    expect(headingAfterScroll({ stop: 2, from: 3 }, 3.4)).toBeNull()
  })

  it('stays forgotten', () => {
    expect(headingAfterScroll(null, 2.4)).toBeNull()
  })
})
