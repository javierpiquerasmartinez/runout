/**
 * The Landing's choreography: what the scene shows at each point of the
 * scroll, as plain numbers. The scroll plays one Hand: the Runout wave is
 * drawn in the dark, turns out to be the lit rim of a table, the Hand is
 * dealt down to the river, the chips go into the pot and the camera dives
 * among them, they stack up again as a graph the wave runs along, and the
 * camera rises over the table as its seats light up.
 *
 * Nothing here knows about three.js or the DOM: `scene/LandingScene` draws
 * what these functions say, and scrolling back up rewinds it exactly.
 */

/** A point in the scene: `x` across, `y` up, `z` towards the visitor; the felt is `y = 0`. */
export type Point = readonly [x: number, y: number, z: number]

/** Where each part of the story starts and ends, in scroll progress from 0 to 1. */
export const beats = {
  /** The wave bends into the table's rim. */
  rim: [0.06, 0.2],
  /** The felt, the deck and every seat's chips come up out of the dark. */
  table: [0.14, 0.24],
  hole: [0.22, 0.3],
  flop: [0.3, 0.4],
  turn: [0.4, 0.46],
  river: [0.46, 0.52],
  /** Every seat's chips slide into the pot. */
  pot: [0.53, 0.61],
  /** The cards go back to the deck. */
  muck: [0.61, 0.68],
  /** The pot bursts into a cloud the camera flies through. */
  dive: [0.61, 0.68],
  /** The chips stack up as a graph. */
  graph: [0.72, 0.84],
  /** The wave leaves the rim and runs along the top of the stacks. */
  line: [0.76, 0.86],
  /** The Results Graph's rules, figures and legend come up round the line. */
  figures: [0.8, 0.86],
  /** Line and chips go back to the table. */
  room: [0.88, 0.96],
  /** The seats light up one by one. */
  seats: [0.9, 1],
} as const satisfies Record<string, readonly [from: number, to: number]>

export type Beat = keyof typeof beats

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Eases 0–1 in and out, flat at both ends. */
export function ease(t: number): number {
  const c = clamp01(t)
  return c * c * (3 - 2 * c)
}

/** How far through a beat the scroll is: 0 before it, 1 after it, eased in between. */
export function beatAt(beat: Beat, progress: number): number {
  const [from, to] = beats[beat]
  return ease((progress - from) / (to - from))
}

/**
 * The same, for one of `count` things that take the beat in turn (cards
 * dealt, seats lit, chips pushed in): each starts a little after the one
 * before and all have arrived when the beat ends. `overlap` is how much of
 * the beat each one takes, from 1 (all together) down to `1 / count` (one
 * strictly after another).
 */
export function staggeredBeatAt(beat: Beat, progress: number, index: number, count: number, overlap = 0.5): number {
  const [from, to] = beats[beat]
  const whole = clamp01((progress - from) / (to - from))
  if (count <= 1) return ease(whole)
  const each = Math.min(1, Math.max(1 / count, overlap))
  const start = (index / (count - 1)) * (1 - each)
  return ease((whole - start) / each)
}

/** What the scene is laid out for: a screen wider than tall, or taller than wide. */
export type Layout = {
  portrait: boolean
  /** The table's half-width across and half-depth towards the visitor. On a tall screen it is turned end-on. */
  table: { across: number; deep: number }
  /** How wide the wave is drawn in the opening. */
  waveWidth: number
  /** How wide the graph of chips is. */
  graphWidth: number
}

const wide: Layout = { portrait: false, table: { across: 4, deep: 2.2 }, waveWidth: 4.6, graphWidth: 6 }
const tall: Layout = { portrait: true, table: { across: 2.3, deep: 3.9 }, waveWidth: 3.2, graphWidth: 3.6 }

/** The layout for a viewport's width over its height. */
export function layoutFor(aspect: number): Layout {
  return aspect < 1 ? tall : wide
}

/** A chip, lying flat. */
export const chip = { radius: 0.115, height: 0.024 }

/** A card, lying flat with its length towards the visitor. The deck is as wide and as long. */
export const card = { width: 0.62, length: 0.88, thick: 0.01 }

/**
 * How many chips each seat sits with, the Hero's first: a big stack, a short
 * one, and nobody with the same.
 */
export const seatChips = [96, 150, 34, 58, 118, 22] as const

/** How many chips a seat piles up before starting another stack, and how many stacks it sets side by side. */
export const stackOf = 20
const stacksAcross = 4
/** Stacks stand this far apart, centre to centre: a chip and a finger's gap. */
const stackGap = 0.26

/** Where things sit on the felt, each by its centre. */
export type Places = {
  deck: Point
  /** The seats' discs, just outside the rim; seat 0 is the Hero's, nearest the visitor. */
  seats: readonly Point[]
  /** Each seat's stacks, inside the rim: where each stands and how many chips it holds. */
  stacks: readonly (readonly { at: Point; chips: number }[])[]
  /** The Hero's two cards, near the visitor. */
  hole: readonly Point[]
  /** The board's five cards, across the middle. */
  board: readonly Point[]
}

/** The point on the felt at `degrees` round the table from its right, `reach` of the way out to the rim. */
function roundTable({ table }: Layout, degrees: number, reach = 0.74): Point {
  const angle = (degrees * Math.PI) / 180
  return [Math.cos(angle) * table.across * reach, 0, Math.sin(angle) * table.deep * reach]
}

/** `count` things in a row across, `gap` apart, centred on `x`, at `z`. */
function row(count: number, gap: number, x: number, z: number): Point[] {
  return Array.from({ length: count }, (_, index): Point => [x + (index - (count - 1) / 2) * gap, 0, z])
}

function layPlaces(layout: Layout): Places {
  const { table, portrait } = layout
  // The middle of each seat's chips: round the table, the short stack on the Hero's right keeping clear of
  // the Hero's, which stand well to the side of their cards, clear of the board from where the visitor sits.
  const stacksAt: Point[] = [
    portrait ? [1.25, 0, 2.05] : [2.2, 0, 1.2],
    // On a tall table the seats either side of the Hero keep nearer the visitor's end, where their chips
    // don't stand between the visitor and the ends of the board.
    roundTable(layout, portrait ? 144 : 150),
    roundTable(layout, 210),
    roundTable(layout, 270),
    roundTable(layout, 330),
    roundTable(layout, portrait ? 30 : 14),
  ]
  return {
    // The deck sits in the gap between two seats' chips, on the far side.
    deck: roundTable(layout, 240),
    seats: seatChips.map((_, seat): Point => {
      const angle = Math.PI / 2 + (seat * 2 * Math.PI) / seatChips.length
      return [Math.cos(angle) * (table.across + 0.55), 0.01, Math.sin(angle) * (table.deep + 0.55)]
    }),
    // Rows of up to four stacks, each row centred, the full stacks first.
    stacks: seatChips.map((chips, seat) => {
      const stacks = Math.ceil(chips / stackOf)
      const rows = Math.ceil(stacks / stacksAcross)
      const [x, , z] = stacksAt[seat]
      return Array.from({ length: rows }, (_, inRows) =>
        row(Math.min(stacksAcross, stacks - inRows * stacksAcross), stackGap, x, z + (inRows - (rows - 1) / 2) * stackGap),
      )
        .flat()
        .map((at, stack) => ({ at, chips: Math.min(stackOf, chips - stack * stackOf) }))
    }),
    hole: row(2, 0.72, 0, 0.95),
    // A tall table is narrow: its board is laid closer, to leave a card's width of felt on both sides.
    board: row(5, portrait ? 0.65 : 0.74, 0, 0),
  }
}

const places = { wide: layPlaces(wide), tall: layPlaces(tall) }

/** Where things sit on the felt for a layout. */
export function placesFor(layout: Layout): Places {
  return layout.portrait ? places.tall : places.wide
}

/** How visible the Results Graph's figures are round the graph of chips, from 0 to 1: there until the chips go home. */
export function figuresAt(progress: number): number {
  return beatAt('figures', progress) * (1 - beatAt('room', progress))
}

/** Where the pot gathers: just behind the board. */
export const potCentre: Point = [0, 0.15, -0.95]

/** How high the tallest stack of the graph stands. */
export const graphHeight = 1.9

/**
 * One view of the scene: what the camera looks at, from how high above the
 * horizon, and the box around that point which must fit on screen whatever
 * the viewport's shape.
 */
type Shot = {
  at: number
  target: Point
  /** Degrees above the horizon: 0 looks level, 90 straight down. */
  elevation: number
  frame: { width: number; height: number }
}

function shots({ table, waveWidth, graphWidth, portrait }: Layout): Shot[] {
  const tilted = (elevation: number) => 2 * table.deep * Math.sin((elevation * Math.PI) / 180) + 1.2
  // From above, the table takes the upper half of the screen, under the bar and clear of the copy.
  const overTableFrame = { width: 2 * table.across + 2, height: (2 * table.deep) / 0.48 }
  const overTable: Point = [0, 0, table.deep * 0.58]
  return [
    // The wave alone, level, in the dark, above the middle of the screen to leave the copy room.
    { at: 0, target: [0, 0.8, 0], elevation: 0, frame: { width: waveWidth + 2.6, height: 4.4 } },
    { at: beats.rim[0], target: [0, 0.8, 0], elevation: 0, frame: { width: waveWidth + 2.6, height: 4.4 } },
    // The whole table.
    { at: beats.hole[0], target: [0, 0, 0], elevation: 38, frame: { width: 2 * table.across + 0.8, height: tilted(38) } },
    // Over the board and the Hero's cards while the flop comes.
    { at: beats.flop[1], target: [0, 0, 0.35], elevation: 50, frame: { width: 4.7, height: portrait ? 4.4 : 3.2 } },
    // Close on the board for the river.
    { at: beats.river[1], target: [0, 0.1, 0], elevation: 30, frame: { width: 4.3, height: 2 } },
    // The pot.
    { at: beats.pot[1], target: potCentre, elevation: 20, frame: { width: 2.4, height: 1.5 } },
    // Among the chips.
    { at: 0.7, target: [0, 0.5, -0.6], elevation: 6, frame: { width: 0.7, height: 0.5 } },
    // Side-on to the graph.
    {
      at: beats.graph[1] - 0.04,
      target: [0, graphHeight / 2, 0],
      elevation: 3,
      frame: { width: graphWidth + 1, height: graphHeight + 1.4 },
    },
    {
      at: beats.line[1],
      target: [0, graphHeight / 2, 0],
      elevation: 5,
      frame: { width: graphWidth + 1, height: graphHeight + 1.4 },
    },
    // Over the table, seats and all, held in the upper part of the screen to leave the copy room.
    {
      at: beats.seats[0] + 0.06,
      target: overTable,
      elevation: 78,
      frame: overTableFrame,
    },
    {
      at: 1,
      target: overTable,
      elevation: 82,
      frame: overTableFrame,
    },
  ]
}

const mix = (from: number, to: number, t: number) => from + (to - from) * t

/**
 * Where the camera is and what it looks at, for a scroll progress, a
 * viewport's width over its height and the camera's vertical field of view
 * in degrees. The camera always faces the scene from the visitor's side;
 * its distance is whatever fits the shot's frame in the viewport, so a tall
 * phone and a wide monitor both see the whole of it.
 */
export function cameraAt(progress: number, aspect: number, fieldOfView: number): { position: Point; target: Point } {
  const keys = shots(layoutFor(aspect))
  const p = clamp01(progress)
  let i = 1
  while (i < keys.length - 1 && p > keys[i].at) i++
  const from = keys[i - 1]
  const to = keys[i]
  const t = to.at > from.at ? ease((p - from.at) / (to.at - from.at)) : 1

  const target: Point = [
    mix(from.target[0], to.target[0], t),
    mix(from.target[1], to.target[1], t),
    mix(from.target[2], to.target[2], t),
  ]
  const elevation = (mix(from.elevation, to.elevation, t) * Math.PI) / 180
  // Sizes are mixed by ratio, so a move in closes at an even pace.
  const width = from.frame.width * (to.frame.width / from.frame.width) ** t
  const height = from.frame.height * (to.frame.height / from.frame.height) ** t

  const half = Math.tan((fieldOfView * Math.PI) / 360)
  const distance = Math.max(height / (2 * half), width / (2 * half * aspect))
  return {
    target,
    position: [target[0], target[1] + distance * Math.sin(elevation), target[2] + distance * Math.cos(elevation)],
  }
}

/** The copy the Landing holds on screen, in the order the Hand tells it. */
export type Caption = 'opening' | 'library' | 'results' | 'rooms'

const captions: Record<Caption, readonly [from: number, to: number]> = {
  opening: [-1, 0.07],
  library: [0.2, 0.545],
  results: [0.8, 0.88],
  rooms: [0.95, 2],
}

/** How far a caption fades in or out on either side of its stretch of the scroll. */
const captionFade = 0.035

/** How visible a caption is at a scroll progress, from 0 to 1. Never two at once. */
export function captionAt(caption: Caption, progress: number): number {
  const [from, to] = captions[caption]
  return Math.min(ease((progress - from) / captionFade + 1), ease((to - progress) / captionFade + 1))
}

/**
 * Where the story rests. The Visitor doesn't drive it frame by frame: each
 * scroll moves on one stop, and the story plays up to it at its own even
 * pace, in the `seconds` given for the stretch that leads to it.
 */
export const stops: readonly { at: number; seconds: number }[] = [
  // The wave, alone.
  { at: 0, seconds: 0 },
  // The table, every seat's chips on it.
  { at: 0.24, seconds: 2.4 },
  // The Hero's cards and the flop.
  { at: 0.4, seconds: 2.6 },
  // The turn and the river.
  { at: 0.52, seconds: 2.4 },
  // The pot, and in among the chips.
  { at: 0.7, seconds: 3.2 },
  // The graph, the wave along it.
  { at: 0.86, seconds: 3 },
  // The Room.
  { at: 1, seconds: 2.8 },
]

/**
 * Where the story has got to `seconds` later, on its way from `playhead` to
 * a stop: each stretch at its own pace, and three times as fast through any
 * stretch that isn't the last one before the stop, so a Visitor who scrolls
 * past several stops isn't kept waiting. It never overshoots the stop.
 */
export function playheadAfter(playhead: number, stop: number, seconds: number): number {
  const goal = stops[Number.isFinite(stop) ? Math.min(stops.length - 1, Math.max(0, Math.round(stop))) : 0].at
  let at = clamp01(playhead)
  let left = seconds
  while (left > 0 && at !== goal) {
    const forward = goal > at
    // The stretch the playhead is in, heading that way.
    let end = 1
    while (end < stops.length - 1 && (forward ? stops[end].at <= at : stops[end].at < at)) end++
    const from = stops[end - 1].at
    const to = stops[end].at
    const edge = forward ? Math.min(to, goal) : Math.max(from, goal)
    const last = forward ? to >= goal : from <= goal
    const pace = ((to - from) / stops[end].seconds) * (last ? 1 : 3)
    const needed = Math.abs(edge - at) / pace
    if (needed > left) return at + (forward ? 1 : -1) * pace * left
    at = edge
    left -= needed
  }
  return at
}
