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
import { waveCrestAt, waveHeightAt } from './brandWave'

/** The camera's vertical field of view, in degrees. */
export const fieldOfView = 40

/** A point in the scene: `x` across, `y` up, `z` towards the Visitor; the felt is `y = 0`. */
export type Point = readonly [x: number, y: number, z: number]

/** Where each part of the story starts and ends, in scroll progress from 0 to 1. */
export const beats = {
  /** The wave bends into the table's rim. */
  rim: [0.06, 0.2],
  /** The felt, the deck and every seat's chips come up out of the dark. */
  table: [0.14, 0.24],
  /** The Hero's cards leave the deck as the story leaves the table's stop, and not before. */
  hole: [0.24, 0.3],
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
  /** The table's half-width across and half-depth towards the Visitor. On a tall screen it is turned end-on. */
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

/** A seat's disc, lying flat just outside the rim: a ring, by its inner and outer radius. */
export const seatDisc = { inner: 0.2, outer: 0.3 }
/** How far beyond the rim a seat's disc is centred, and how far it reaches. */
const seatOut = 0.55
const seatReach = seatOut + seatDisc.outer

/** A chip, lying flat. */
export const chip = { radius: 0.115, height: 0.024 }

/** A card, lying flat with its length towards the Visitor. The deck is as wide and as long. */
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
  /** The seats' discs, just outside the rim; seat 0 is the Hero's, nearest the Visitor. */
  seats: readonly Point[]
  /** Each seat's stacks, inside the rim: where each stands and how many chips it holds. */
  stacks: readonly (readonly { at: Point; chips: number }[])[]
  /** The Hero's two cards, near the Visitor. */
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
  // the Hero's, which stand well to the side of their cards, clear of the board from where the Visitor sits.
  const stacksAt: Point[] = [
    portrait ? [1.25, 0, 2.05] : [2.2, 0, 1.2],
    // On a tall table the seats either side of the Hero keep nearer the Visitor's end, where their chips
    // don't stand between the Visitor and the ends of the board.
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
      return [Math.cos(angle) * (table.across + seatOut), 0.01, Math.sin(angle) * (table.deep + seatOut)]
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

/** How many chips there are: every seat's, and the rest, which come out of the pot as it bursts to build the graph. */
export const chipCount = 960

/** How many stacks the graph is, and its shortest as a share of its tallest. */
export const graphColumns = 24
const graphFloor = 0.12

/** How high each of the graph's stacks is, as a share of the tallest: the Runout wave, on a floor. */
const graphShareAt = (x: number) => graphFloor + (1 - graphFloor) * waveHeightAt(x)

/** How many chips a stack as tall as the tallest holds, when every chip there is goes into the graph. */
const graphChips =
  chipCount / Array.from({ length: graphColumns }, (_, column) => graphShareAt(column / (graphColumns - 1))).reduce((a, b) => a + b)

/** The top of the graph at `x` across it, from 0 to 1: where the wave runs. */
export function graphTopAt(x: number): number {
  return graphShareAt(x) * graphChips * chip.height
}

/** How high the tallest stack of the graph stands, near enough: what the shots of it are framed for. */
export const graphHeight = 1.9
/** How far over the stacks the line runs. */
export const lineOverGraph = 0.07
const graphTop = graphHeight + lineOverGraph

/**
 * What the page keeps over the scene in a layout, as shares of the screen's
 * height from its top: what the bar holds ends above `bar` and no caption
 * starts above `copy`. The page's styles hold the copy to it; the shots that
 * have something to read fit it in between. On a narrow phone the bar wraps
 * to two lines, the brand over the two ways on, so a tall screen keeps more
 * for it.
 */
export function clearFor({ portrait }: Layout): { bar: number; copy: number } {
  return { bar: portrait ? 0.15 : 0.13, copy: 0.6 }
}

/**
 * The depth of field, where the scene is drawn with one. What a shot focuses
 * on is sharp, and the rest is blurred by `strength` times how far it is from
 * the focus, as a share of the focus's own distance: so the close shots, on
 * the board and in among the chips, are the shallow ones. `most` is the most
 * anything is blurred, as a share of the screen's width. Both are tuned by eye.
 */
export const depthOfField = { strength: 0.012, most: 0.014 }

/** The top and bottom of a stretch of the screen, as shares of its height from the top. */
type Band = { top: number; bottom: number }

const wholeScreen: Band = { top: 0, bottom: 1 }

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
  /** The stretch of the screen's height the frame is fitted in and centred on; the whole of it unless said. */
  band?: Band
  /** What is sharp where there is a depth of field; the target unless said. */
  focus?: Point
}

function shots(layout: Layout): Shot[] {
  const { table, waveWidth, graphWidth } = layout
  const clear = clearFor(layout)
  const betweenBarAndCopy: Band = { top: clear.bar, bottom: clear.copy }
  const tilted = (elevation: number) => 2 * table.deep * Math.sin((elevation * Math.PI) / 180) + 1.2
  // From above, the table and its seats and a hair of air, so they fill the stretch they are fitted in: as deep
  // as they look from that high. The near seats are nearer the camera than the far ones and drawn larger, so
  // the shot is of a point a little nearer than the table's middle, which leaves both as far from the stretch's ends.
  const overTable = (elevation: number): Pick<Shot, 'target' | 'elevation' | 'frame' | 'band'> => {
    const angle = (elevation * Math.PI) / 180
    const deep = table.deep + seatReach
    const stretch = Math.tan((fieldOfView * Math.PI) / 360) * (clear.copy - clear.bar)
    return {
      target: [0, 0, (deep * stretch) / Math.tan(angle)],
      elevation,
      frame: { width: 2 * (table.across + seatReach) + 0.2, height: 2 * deep * Math.sin(angle) * 1.01 },
      band: betweenBarAndCopy,
    }
  }
  // The same from lower down, where the near seats are a good deal nearer the camera than the far ones and the
  // table is no longer as deep on screen as its depth times the angle's sine: where the shot must look, and how
  // deep a frame it needs, for the far seats to come just under the top of the stretch and the near ones just
  // over its bottom, as the camera's own projection draws them.
  const lowOverTable = (elevation: number): Pick<Shot, 'target' | 'elevation' | 'frame' | 'band'> => {
    const angle = (elevation * Math.PI) / 180
    const deep = table.deep + seatReach
    const half = Math.tan((fieldOfView * Math.PI) / 360)
    const lean = half * Math.cos(angle)
    const nearer = (deep * (clear.copy - clear.bar) * lean) / (Math.sin(angle) - lean * (1 - clear.bar - clear.copy))
    return {
      target: [0, 0, nearer],
      elevation,
      frame: { width: 2 * (table.across + seatReach) + 0.2, height: 2 * (deep + nearer) * (Math.sin(angle) - lean * (1 - 2 * clear.bar)) * 1.01 },
      band: betweenBarAndCopy,
    }
  }
  // The graph, from the felt to the line along its top, with room over it for the legend and under it for the
  // first and last Hand, as shares of the stretch it is fitted in: what they need of the shortest window.
  const graphRoom = { over: 0.19, under: 0.09 }
  const graphFrame = { width: graphWidth + 1, height: graphTop / (1 - graphRoom.over - graphRoom.under) }
  const graphMiddle: Point = [0, graphFrame.height * (0.5 - graphRoom.under), 0]
  const graph: Point = [0, graphHeight / 2, 0]
  const board: Point = [0, 0, 0]
  return [
    // The wave alone, level, in the dark, above the middle of the screen to leave the copy room.
    { at: 0, target: [0, 0.8, 0], elevation: 0, frame: { width: waveWidth + 2.6, height: 4.4 } },
    { at: beats.rim[0], target: [0, 0.8, 0], elevation: 0, frame: { width: waveWidth + 2.6, height: 4.4 } },
    // The whole table.
    { at: beats.hole[0], target: [0, 0, 0], elevation: 38, frame: { width: 2 * table.across + 0.8, height: tilted(38) } },
    // Over the board and the Hero's cards while the flop comes.
    { at: beats.flop[1], target: [0, 0, 0.5], elevation: 50, frame: { width: 4.7, height: 1.9 }, band: betweenBarAndCopy },
    // Close on the board for the river, the Hero's cards kept in view under it.
    {
      at: beats.river[1],
      target: [0, 0.05, 0.5],
      elevation: 34,
      frame: { width: 4.3, height: 1.4 },
      band: betweenBarAndCopy,
      focus: board,
    },
    // The pot.
    { at: beats.pot[1], target: potCentre, elevation: 20, frame: { width: 2.4, height: 1.5 } },
    // Among the chips.
    { at: 0.7, target: [0, 0.5, -0.6], elevation: 6, frame: { width: 0.7, height: 0.5 } },
    // Side-on to the graph.
    { at: beats.graph[1] - 0.04, target: graphMiddle, elevation: 3, frame: graphFrame, band: betweenBarAndCopy, focus: graph },
    { at: beats.line[1], target: graphMiddle, elevation: 5, frame: graphFrame, band: betweenBarAndCopy, focus: graph },
    // Over the table, seats and all, under the bar and above the copy: from almost straight above on a tall screen.
    // That view of a wide table is limited by the height of the stretch it is fitted in, and the table comes out
    // a third of the screen's width; from lower it is shallower on screen and so can be wider, its rim more than
    // half the width of a 16:9 screen, with the board still read.
    ...(layout.portrait
      ? [
          { at: beats.seats[0] + 0.06, ...overTable(78), focus: board },
          { at: 1, ...overTable(82), focus: board },
        ]
      : [
          { at: beats.seats[0] + 0.06, ...lowOverTable(38), focus: board },
          { at: 1, ...lowOverTable(42), focus: board },
        ]),
  ]
}

const mix = (from: number, to: number, t: number) => from + (to - from) * t
const mixPoint = (from: Point, to: Point, t: number): Point => [
  mix(from[0], to[0], t),
  mix(from[1], to[1], t),
  mix(from[2], to[2], t),
]

/**
 * Where the camera is and what it looks at, for a scroll progress, a
 * viewport's width over its height and the camera's vertical field of view
 * in degrees. The camera always faces the scene from the Visitor's side;
 * its distance is whatever fits the shot's frame in its band of the
 * viewport, so a tall phone and a wide monitor both see the whole of it.
 * `focus` is how far in front of the camera the shot is sharp.
 */
export function cameraAt(
  progress: number,
  aspect: number,
  fieldOfView: number,
): { position: Point; target: Point; focus: number } {
  const keys = shots(layoutFor(aspect))
  const p = clamp01(progress)
  let i = 1
  while (i < keys.length - 1 && p > keys[i].at) i++
  const from = keys[i - 1]
  const to = keys[i]
  const t = to.at > from.at ? ease((p - from.at) / (to.at - from.at)) : 1

  const subject = mixPoint(from.target, to.target, t)
  const sharp = mixPoint(from.focus ?? from.target, to.focus ?? to.target, t)
  const elevation = (mix(from.elevation, to.elevation, t) * Math.PI) / 180
  // Sizes are mixed by ratio, so a move in closes at an even pace.
  const width = from.frame.width * (to.frame.width / from.frame.width) ** t
  const height = from.frame.height * (to.frame.height / from.frame.height) ** t
  const top = mix((from.band ?? wholeScreen).top, (to.band ?? wholeScreen).top, t)
  const bottom = mix((from.band ?? wholeScreen).bottom, (to.band ?? wholeScreen).bottom, t)

  const half = Math.tan((fieldOfView * Math.PI) / 360)
  const distance = Math.max(height / (2 * half * (bottom - top)), width / (2 * half * aspect))
  // The camera is slid in its own plane, so the subject sits in the middle of the band rather than of the screen.
  const slide = (0.5 - (top + bottom) / 2) * 2 * half * distance
  const up = Math.sin(elevation)
  const back = Math.cos(elevation)
  const target: Point = [subject[0], subject[1] - back * slide, subject[2] + up * slide]
  const position: Point = [target[0], target[1] + distance * up, target[2] + distance * back]
  return {
    target,
    position,
    focus: (position[1] - sharp[1]) * up + (position[2] - sharp[2]) * back,
  }
}

/** Where the graph of chips is on the screen, in CSS pixels from its top left. */
export type GraphOnScreen = {
  /** How visible the Results Graph's figures are, from 0 to 1. */
  showing: number
  /** The graph's two ends across. */
  left: number
  right: number
  /** Down the screen: where the line starts from, the line's crest, and the felt the chips stand on. */
  zero: number
  crest: number
  floor: number
}

/**
 * Where the graph of chips is on a screen `width` by `height`, at a scroll
 * progress, for the Results Graph's figures laid over it: by the same camera
 * the scene draws with, so a picture of the scene can carry them where there
 * is no scene. `from` is the camera, where it has leant away from its place.
 */
export function graphOnScreen(
  progress: number,
  width: number,
  height: number,
  from: { position: Point; target: Point } = cameraAt(progress, width / height, fieldOfView),
): GraphOnScreen {
  const { graphWidth } = layoutFor(width / height)
  const { position, target } = from
  // The camera's own axes: it looks at its target, upright.
  const ahead = [target[0] - position[0], target[1] - position[1], target[2] - position[2]]
  const far = Math.hypot(...ahead)
  const [ax, ay, az] = ahead.map((each) => each / far)
  const flat = Math.hypot(ax, az)
  const right = [-az / flat, 0, ax / flat]
  const up = [-ay * right[2], ax * right[2] - az * right[0], ay * right[0]]
  const half = Math.tan((fieldOfView * Math.PI) / 360)
  const seen = (x: number, y: number) => {
    const to = [x - position[0], y - position[1], -position[2]]
    const depth = to[0] * ax + to[1] * ay + to[2] * az
    return {
      across: (0.5 + (to[0] * right[0] + to[2] * right[2]) / (2 * half * depth * (width / height))) * width,
      down: (0.5 - (to[0] * up[0] + to[1] * up[1] + to[2] * up[2]) / (2 * half * depth)) * height,
    }
  }
  return {
    showing: figuresAt(progress),
    left: seen(-graphWidth / 2, 0).across,
    right: seen(graphWidth / 2, 0).across,
    zero: seen(0, graphTopAt(0) + lineOverGraph).down,
    crest: seen(0, graphTopAt(waveCrestAt) + lineOverGraph).down,
    floor: seen(0, 0).down,
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
