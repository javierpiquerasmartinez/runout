import { describe, expect, it } from 'vitest'
import { waveHeightAt, wavePoints } from './brandWave'
import {
  beatAt,
  beats,
  cameraAt,
  captionAt,
  figuresAt,
  layoutFor,
  playheadAfter,
  staggeredBeatAt,
  stops,
  type Beat,
  type Caption,
} from './choreography'

const wide = 16 / 9
const tall = 9 / 19.5
const fieldOfView = 40

describe('the Runout wave', () => {
  it('runs from its left end to its right, starting low, cresting once and ending on the way up', () => {
    const points = wavePoints(121)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points.at(-1)?.x).toBeCloseTo(1)
    expect(points.at(-1)?.y).toBeCloseTo(0.75)
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(1)
    for (let i = 1; i < points.length; i++) expect(points[i].x).toBeGreaterThanOrEqual(points[i - 1].x)
  })

  it('gives its height anywhere across, held at the ends', () => {
    expect(waveHeightAt(-1)).toBe(0)
    expect(waveHeightAt((9.8 - 3) / 18)).toBeCloseTo(1, 2)
    expect(waveHeightAt((16.6 - 3) / 18)).toBeCloseTo(0, 2)
    expect(waveHeightAt(2)).toBeCloseTo(0.75)
  })
})

describe('beatAt', () => {
  it.each(Object.keys(beats) as Beat[])('has not started %s before it and has finished it after', (beat) => {
    const [from, to] = beats[beat]
    expect(beatAt(beat, from - 0.01)).toBe(0)
    expect(beatAt(beat, from)).toBe(0)
    expect(beatAt(beat, to)).toBe(1)
    expect(beatAt(beat, to + 0.01)).toBe(1)
  })

  it('deals the Hand in order: hole cards, flop, turn, river, and only then the pot', () => {
    const order: Beat[] = ['hole', 'flop', 'turn', 'river']
    for (let i = 1; i < order.length; i++) expect(beats[order[i]][0]).toBeGreaterThanOrEqual(beats[order[i - 1]][1])
    expect(beatAt('river', beats.pot[0] + 0.02)).toBe(1)
  })
})

describe('staggeredBeatAt', () => {
  it('starts each one after the one before and has them all there when the beat ends', () => {
    const [from, to] = beats.flop
    const middle = (from + to) / 2
    const cards = [0, 1, 2].map((card) => staggeredBeatAt('flop', middle, card, 3))
    expect(cards[0]).toBeGreaterThan(cards[1])
    expect(cards[1]).toBeGreaterThan(cards[2])
    for (const card of [0, 1, 2]) {
      expect(staggeredBeatAt('flop', from, card, 3)).toBe(0)
      expect(staggeredBeatAt('flop', to, card, 3)).toBe(1)
    }
  })
})

describe('cameraAt', () => {
  it.each([
    ['a wide screen', wide],
    ['a tall phone', tall],
  ])('opens level with the wave and far enough back to fit it across %s', (_screen, aspect) => {
    const { position, target } = cameraAt(0, aspect, fieldOfView)
    expect(position[1]).toBeCloseTo(target[1])
    const visibleWidth = 2 * (position[2] - target[2]) * Math.tan((fieldOfView * Math.PI) / 360) * aspect
    expect(visibleWidth).toBeGreaterThanOrEqual(layoutFor(aspect).waveWidth + 1.2 - 1e-9)
  })

  it('stands further back on a tall phone to fit the same wave', () => {
    expect(cameraAt(0, tall, fieldOfView).position[2]).toBeGreaterThan(cameraAt(0, wide, fieldOfView).position[2])
  })

  it('ends over the table, looking almost straight down', () => {
    const { position, target } = cameraAt(1, wide, fieldOfView)
    expect(target[0]).toBe(0)
    expect(target[1]).toBe(0)
    expect(position[1]).toBeGreaterThan((position[2] - target[2]) * 5)
  })

  it('holds the first view above the top and the last past the end, as a bounce overscrolls', () => {
    expect(cameraAt(-0.3, wide, fieldOfView)).toEqual(cameraAt(0, wide, fieldOfView))
    expect(cameraAt(1.4, wide, fieldOfView)).toEqual(cameraAt(1, wide, fieldOfView))
  })

  it('never jumps: a thousandth of the scroll moves the camera a little', () => {
    for (const aspect of [wide, tall]) {
      let previous = cameraAt(0, aspect, fieldOfView).position
      for (let step = 1; step <= 1000; step++) {
        const { position } = cameraAt(step / 1000, aspect, fieldOfView)
        const moved = Math.hypot(position[0] - previous[0], position[1] - previous[1], position[2] - previous[2])
        expect(moved).toBeLessThan(0.5)
        previous = position
      }
    }
  })
})

describe('captionAt', () => {
  it('opens on the opening line and closes on the Rooms line', () => {
    expect(captionAt('opening', 0)).toBe(1)
    expect(captionAt('rooms', 1)).toBe(1)
  })

  it('never shows two captions at once', () => {
    const all: Caption[] = ['opening', 'library', 'results', 'rooms']
    for (let step = 0; step <= 1000; step++) {
      const showing = all.filter((caption) => captionAt(caption, step / 1000) > 0)
      expect(showing.length).toBeLessThanOrEqual(1)
    }
  })
})

describe('playheadAfter', () => {
  it('plays a stretch in the seconds it is given, at an even pace', () => {
    expect(playheadAfter(0, 1, stops[1].seconds / 2)).toBeCloseTo(stops[1].at / 2)
    expect(playheadAfter(0, 1, stops[1].seconds)).toBeCloseTo(stops[1].at)
  })

  it('rests on the stop, however long it is left', () => {
    expect(playheadAfter(0, 1, 60)).toBe(stops[1].at)
    expect(playheadAfter(stops[3].at, 3, 5)).toBe(stops[3].at)
  })

  it('rewinds to an earlier stop at the same pace', () => {
    expect(playheadAfter(stops[2].at, 1, stops[2].seconds / 2)).toBeCloseTo((stops[1].at + stops[2].at) / 2)
    expect(playheadAfter(stops[2].at, 1, 60)).toBe(stops[1].at)
  })

  it('hurries through the stretches before the last when several stops are scrolled past', () => {
    const hurried = stops[1].seconds / 3 + stops[2].seconds / 3
    expect(playheadAfter(0, 3, hurried)).toBeCloseTo(stops[2].at)
    expect(playheadAfter(0, 3, hurried + stops[3].seconds)).toBeCloseTo(stops[3].at)
  })

  it('changes its mind mid-stretch: from between two stops it goes to whichever is asked', () => {
    const between = (stops[1].at + stops[2].at) / 2
    expect(playheadAfter(between, 1, 60)).toBe(stops[1].at)
    expect(playheadAfter(between, 2, 60)).toBe(stops[2].at)
  })

  it('shows a caption, or the dive alone, at every stop', () => {
    const showing = stops.map(({ at }) =>
      (['opening', 'library', 'results', 'rooms'] as Caption[]).find((caption) => captionAt(caption, at) === 1),
    )
    expect(showing).toEqual(['opening', 'library', 'library', 'library', undefined, 'results', 'rooms'])
  })
})

describe('figuresAt', () => {
  it("shows the Results Graph's figures at the graph's stop and nowhere else the story rests", () => {
    expect(stops.map(({ at }) => figuresAt(at))).toEqual([0, 0, 0, 0, 0, 1, 0])
  })
})
