import { describe, expect, it } from 'vitest'
import { waveHeightAt, wavePoints } from './brandWave'
import {
  beatAt,
  beats,
  cameraAt,
  captionAt,
  card,
  chip,
  clear,
  figuresAt,
  graphHeight,
  layoutFor,
  placesFor,
  playheadAfter,
  staggeredBeatAt,
  stops,
  type Beat,
  type Caption,
  type Layout,
  type Places,
  type Point,
} from './choreography'

const wide = 16 / 9
const tall = 9 / 19.5
const fieldOfView = 40

/** The windows the framing is held to: a short wide one, a large desktop one and a tall phone, in CSS pixels. */
const windows = [
  { name: 'a short wide window', width: 1280, height: 600 },
  { name: 'a large desktop window', width: 1920, height: 1080 },
  { name: 'a tall phone', width: 390, height: 844 },
]

/** Where a point of the scene is on screen at a progress: `x` across and `y` down, each from 0 to 1. */
function onScreen(point: readonly [number, number, number], progress: number, aspect: number) {
  const { position, target } = cameraAt(progress, aspect, fieldOfView)
  const sub = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const cross = (a: readonly number[], b: readonly number[]) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
  const unit = (a: readonly number[]) => a.map((each) => each / Math.hypot(...a))
  const forward = unit(sub(target, position))
  const right = unit(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)
  const from = sub(point, position)
  const half = Math.tan((fieldOfView * Math.PI) / 360)
  const depth = dot(from, forward)
  return { x: 0.5 + dot(from, right) / (2 * half * aspect * depth), y: 0.5 - dot(from, up) / (2 * half * depth), depth }
}

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
    expect(position[0]).toBe(0)
    expect(position[1] - target[1]).toBeGreaterThan((position[2] - target[2]) * 5)
  })

  it.each(windows)('ends with the table and its seats under the bar and above the copy in $name', ({ width, height }) => {
    const aspect = width / height
    const { table } = layoutFor(aspect)
    // The seats' discs reach 0.85 beyond the rim.
    for (let degrees = 0; degrees < 360; degrees += 5) {
      const angle = (degrees * Math.PI) / 180
      const { x, y } = onScreen([Math.cos(angle) * (table.across + 0.85), 0, Math.sin(angle) * (table.deep + 0.85)], 1, aspect)
      expect(y).toBeGreaterThan(clear.bar)
      expect(y).toBeLessThan(clear.copy)
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(1)
    }
  })

  it.each(windows)("leaves the Results Graph's legend and its first and last Hand room round the graph in $name", ({ width, height }) => {
    const aspect = width / height
    const { graphWidth } = layoutFor(aspect)
    const stop = stops[5].at
    // The legend stands 20 px over the crest, on one line or wrapped to two on a phone; the Hands sit 8 px under the felt.
    const legend = aspect < 1 ? 60 : 40
    const hands = 20
    for (const x of [-graphWidth / 2, 0, graphWidth / 2]) {
      expect(onScreen([x, graphHeight + 0.07, 0], stop, aspect).y * height - legend).toBeGreaterThan(clear.bar * height)
      expect(onScreen([x, 0, 0], stop, aspect).y * height + hands).toBeLessThan(clear.copy * height)
    }
    expect(onScreen([-graphWidth / 2, 0, 0], stop, aspect).x).toBeGreaterThan(0)
    expect(onScreen([graphWidth / 2, 0, 0], stop, aspect).x).toBeLessThan(1)
  })

  it.each(windows)("keeps the board and the Hero's cards under the bar and above the copy in $name", ({ width, height }) => {
    const aspect = width / height
    const { board, hole } = placesFor(layoutFor(aspect))
    const corners = [...board, ...hole].flatMap(([x, , z]) =>
      [-card.width / 2, card.width / 2].flatMap((dx) => [-card.length / 2, card.length / 2].map((dz) => [x + dx, 0, z + dz] as const)),
    )
    for (const stop of [stops[2].at, stops[3].at]) {
      for (const corner of corners) {
        const { x, y } = onScreen(corner, stop, aspect)
        expect(y).toBeGreaterThan(clear.bar)
        expect(y).toBeLessThan(clear.copy)
        expect(x).toBeGreaterThan(0)
        expect(x).toBeLessThan(1)
      }
    }
  })

  it('focuses on what each shot is of: the wave, the board at the river, the graph', () => {
    for (const aspect of [wide, tall]) {
      expect(cameraAt(0, aspect, fieldOfView).focus).toBeCloseTo(onScreen([0, 0.8, 0], 0, aspect).depth)
      expect(cameraAt(stops[3].at, aspect, fieldOfView).focus).toBeCloseTo(onScreen([0, 0, 0], stops[3].at, aspect).depth)
      expect(cameraAt(stops[5].at, aspect, fieldOfView).focus).toBeCloseTo(
        onScreen([0, graphHeight / 2, 0], stops[5].at, aspect).depth,
      )
    }
  })

  it('focuses nearest of all in among the chips', () => {
    for (const aspect of [wide, tall]) {
      const among = cameraAt(stops[4].at, aspect, fieldOfView).focus
      expect(among).toBeGreaterThan(0)
      for (const { at } of stops) expect(cameraAt(at, aspect, fieldOfView).focus).toBeGreaterThanOrEqual(among)
    }
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

describe('placesFor', () => {
  const layouts = [
    ['the wide layout', wide],
    ['the tall layout', tall],
  ] as const
  /** Screens of every shape, from an ultrawide monitor to a tall phone. */
  const screens = [21 / 9, wide, 4 / 3, 3 / 4, 9 / 16, tall]

  type Disc = { x: number; z: number; radius: number }
  type Box = { x: number; z: number; width: number; length: number }

  const stacksOf = (seat: Places['stacks'][number]): Disc[] =>
    seat.map(({ at }) => ({ x: at[0], z: at[2], radius: chip.radius }))
  const cardAt = (at: Point): Box => ({ x: at[0], z: at[2], width: card.width, length: card.length })

  const discsOverlap = (a: Disc, b: Disc) => Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius
  const discOverlapsBox = (disc: Disc, box: Box) =>
    Math.hypot(
      Math.max(0, Math.abs(disc.x - box.x) - box.width / 2),
      Math.max(0, Math.abs(disc.z - box.z) - box.length / 2),
    ) < disc.radius
  const boxesOverlap = (a: Box, b: Box) =>
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.z - b.z) < (a.length + b.length) / 2

  /** The felt ends where the padded rail begins, a little inside the line of light. */
  const felt = 0.985
  const onTheFelt = (x: number, z: number, { table }: Layout) =>
    Math.hypot(x / (table.across * felt), z / (table.deep * felt)) <= 1
  const discOnTheFelt = (disc: Disc, layout: Layout) =>
    Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8).every((angle) =>
      onTheFelt(disc.x + Math.cos(angle) * disc.radius, disc.z + Math.sin(angle) * disc.radius, layout),
    )
  const boxOnTheFelt = (box: Box, layout: Layout) =>
    [-1, 1].every((side) =>
      [-1, 1].every((end) => onTheFelt(box.x + (side * box.width) / 2, box.z + (end * box.length) / 2, layout)),
    )

  it.each(layouts)(
    'sits the seats with 96, 150, 34, 58, 118 and 22 chips, the Hero first, in stacks of 20, in %s',
    (_name, aspect) => {
      const { stacks } = placesFor(layoutFor(aspect))
      expect(stacks.map((seat) => seat.map((stack) => stack.chips))).toEqual([
        [20, 20, 20, 20, 16],
        [20, 20, 20, 20, 20, 20, 20, 10],
        [20, 14],
        [20, 20, 18],
        [20, 20, 20, 20, 20, 18],
        [20, 2],
      ])
    },
  )

  it.each(layouts)("keeps every seat's stacks clear of each other and of every other seat's in %s", (_name, aspect) => {
    const all = placesFor(layoutFor(aspect)).stacks.flatMap(stacksOf)
    expect(all).toHaveLength(26)
    for (const [i, a] of all.entries())
      for (const b of all.slice(i + 1)) expect(discsOverlap(a, b), JSON.stringify([a, b])).toBe(false)
  })

  it.each(layouts)("keeps every seat's stacks off the deck, the Hero's cards and the board in %s", (_name, aspect) => {
    const places = placesFor(layoutFor(aspect))
    expect(places.hole).toHaveLength(2)
    expect(places.board).toHaveLength(5)
    const flat = [places.deck, ...places.hole, ...places.board].map(cardAt)
    for (const stack of places.stacks.flatMap(stacksOf))
      for (const box of flat) expect(discOverlapsBox(stack, box), JSON.stringify([stack, box])).toBe(false)
  })

  it.each(layouts)('lays no card on another, nor on the deck, in %s', (_name, aspect) => {
    const places = placesFor(layoutFor(aspect))
    const flat = [places.deck, ...places.hole, ...places.board].map(cardAt)
    for (const [i, a] of flat.entries()) for (const b of flat.slice(i + 1)) expect(boxesOverlap(a, b)).toBe(false)
  })

  it.each(layouts)('has every stack, the deck and every card at rest inside the rim in %s', (_name, aspect) => {
    const layout = layoutFor(aspect)
    const places = placesFor(layout)
    for (const stack of places.stacks.flatMap(stacksOf)) expect(discOnTheFelt(stack, layout), JSON.stringify(stack)).toBe(true)
    for (const box of [places.deck, ...places.hole, ...places.board].map(cardAt))
      expect(boxOnTheFelt(box, layout), JSON.stringify(box)).toBe(true)
  })

  it("leaves at least a card's width of felt on both sides of the board on a tall table", () => {
    const layout = layoutFor(tall)
    const { board } = placesFor(layout)
    // A card's width beyond the board's outer edges, at both ends of its cards, is still felt.
    const beyond = Math.max(...board.map((at) => Math.abs(at[0]))) + card.width / 2 + card.width
    for (const x of [-beyond, beyond]) for (const z of [-card.length / 2, card.length / 2]) expect(onTheFelt(x, z, layout)).toBe(true)
  })

  /** Whether the straight line from `from` to `to` passes through a stack of `chips` standing at `at`. */
  function passesThrough(from: Point, to: Point, at: Point, chips: number): boolean {
    const dx = to[0] - from[0]
    const dz = to[2] - from[2]
    const ox = from[0] - at[0]
    const oz = from[2] - at[2]
    const a = dx * dx + dz * dz
    const b = 2 * (ox * dx + oz * dz)
    const c = ox * ox + oz * oz - chip.radius ** 2
    const root = b * b - 4 * a * c
    if (a === 0 || root <= 0) return false
    // Within the stack's round between `enter` and `leave`, and lower than its top until `top`.
    const enter = Math.max(0, (-b - Math.sqrt(root)) / (2 * a))
    const leave = Math.min(1, (-b + Math.sqrt(root)) / (2 * a))
    const top = to[1] > from[1] ? (chips * chip.height - from[1]) / (to[1] - from[1]) : 1
    return enter < Math.min(leave, top)
  }

  /** Points all over a card lying at `at`. */
  const pointsOn = (at: Point): Point[] =>
    [-0.5, -0.25, 0, 0.25, 0.5].flatMap((across) =>
      [-0.5, -0.25, 0, 0.25, 0.5].map(
        (along): Point => [at[0] + across * card.width, card.thick, at[2] + along * card.length],
      ),
    )

  it.each([
    ['when the flop is down', stops[2].at, 3],
    ['when the river is down', stops[3].at, 5],
  ])(
    "stands no seat's chips between the visitor and the Hero's cards or the board %s, on any shape of screen",
    (_when, at, dealt) => {
      for (const aspect of screens) {
        const places = placesFor(layoutFor(aspect))
        const { position } = cameraAt(at, aspect, fieldOfView)
        for (const point of [...places.hole, ...places.board.slice(0, dealt)].flatMap(pointsOn))
          for (const [seat, stacks] of places.stacks.entries())
            for (const stack of stacks)
              expect(
                passesThrough(point, position, stack.at, stack.chips),
                `aspect ${aspect}, seat ${seat}, ${JSON.stringify(point)}`,
              ).toBe(false)
      }
    },
  )
})

describe('figuresAt', () => {
  it("shows the Results Graph's figures at the graph's stop and nowhere else the story rests", () => {
    expect(stops.map(({ at }) => figuresAt(at))).toEqual([0, 0, 0, 0, 0, 1, 0])
  })
})
