/*
 * What a mouse press and release on the Results Graph mean. The graph only
 * collects where they landed and acts on the answer.
 */

/** How far, in pixels, the mouse may move between press and release and still click. */
export const CLICK_THRESHOLD = 4

export interface GraphPress {
  /** The Hand number under the press, or null where no Hand stands (the start point). */
  press: number | null
  /** The Hand number under the release, or null where no Hand stands. */
  release: number | null
  /** How many pixels the mouse moved between press and release. */
  moved: number
}

/** What the gesture asks the graph to do. */
export type GraphGesture =
  | { kind: 'open'; hand: number }
  | { kind: 'zoom'; from: number; to: number }
  | { kind: 'nothing' }

/**
 * A press and release that barely moved open the Hand under the press. A drag
 * Zooms into the Hands between them, whichever way it went, as long as it
 * covers at least two Hands; one that starts or ends where no Hand stands
 * does nothing.
 */
export function graphGesture({ press, release, moved }: GraphPress): GraphGesture {
  if (moved < CLICK_THRESHOLD) return press === null ? { kind: 'nothing' } : { kind: 'open', hand: press }
  if (press === null || release === null || press === release) return { kind: 'nothing' }
  return { kind: 'zoom', from: Math.min(press, release), to: Math.max(press, release) }
}
