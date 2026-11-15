import { describe, expect, it } from 'vitest'
import { graphOnScreen, stops } from './scene/choreography'
import { graphInStill, stillOf } from './stills'

const shapes = [
  ['wide', false],
  ['tall', true],
] as const

describe('the stills of the scene', () => {
  it.each(shapes)('has a %s picture of every stop, each its own', (_shape, portrait) => {
    const addresses = stops.map((_, stop) => stillOf(stop, portrait))
    for (const address of addresses) expect(address).toMatch(/\.webp$/)
    expect(new Set(addresses).size).toBe(stops.length)
  })

  it('has different pictures for a wide screen and a tall one', () => {
    expect(stillOf(0, true)).not.toBe(stillOf(0, false))
  })
})

describe("the graph in the still of its stop", () => {
  const graphStop = 5

  it('is where the scene drew it, on a screen the size the wide picture was captured at', () => {
    const captured = graphOnScreen(stops[graphStop].at, 1600, 900)
    const graph = graphInStill(graphStop, 1600, 900)
    for (const part of ['left', 'right', 'zero', 'crest', 'floor'] as const) expect(graph[part]).toBeCloseTo(captured[part])
  })

  it('is scaled with the picture on a smaller screen of the same shape', () => {
    const captured = graphOnScreen(stops[graphStop].at, 1600, 900)
    const graph = graphInStill(graphStop, 800, 450)
    expect(graph.left).toBeCloseTo(captured.left / 2)
    expect(graph.right).toBeCloseTo(captured.right / 2)
    expect(graph.crest).toBeCloseTo(captured.crest / 2)
    expect(graph.floor).toBeCloseTo(captured.floor / 2)
  })

  it("follows the picture where it fills a narrower screen's height and is cut at the sides", () => {
    // 1600×900 on a screen 1024×640: drawn 1137.8 px wide, 56.9 px of it off each side.
    const captured = graphOnScreen(stops[graphStop].at, 1600, 900)
    const graph = graphInStill(graphStop, 1024, 640)
    const scale = 640 / 900
    expect(graph.left).toBeCloseTo(captured.left * scale - 56.9, 1)
    expect(graph.right).toBeCloseTo(captured.right * scale - 56.9, 1)
    expect(graph.zero).toBeCloseTo(captured.zero * scale)
    expect(graph.floor).toBeCloseTo(captured.floor * scale)
  })

  it("follows the tall picture where it fills a phone's width and is cut at top and bottom", () => {
    // 400×800 on a screen 360×640: drawn 720 px tall, 40 px of it off the top and the bottom.
    const captured = graphOnScreen(stops[graphStop].at, 400, 800)
    const graph = graphInStill(graphStop, 360, 640)
    expect(graph.left).toBeCloseTo(captured.left * 0.9)
    expect(graph.crest).toBeCloseTo(captured.crest * 0.9 - 40)
    expect(graph.floor).toBeCloseTo(captured.floor * 0.9 - 40)
  })

  it("shows the Results Graph's figures at the graph's stop and at no other", () => {
    expect(stops.map((_, stop) => graphInStill(stop, 1600, 900).showing)).toEqual([0, 0, 0, 0, 0, 1, 0])
  })
})
