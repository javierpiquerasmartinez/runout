import type { Street } from './hand'

/*
 * Where Playback is in the Hand, Street by Street, for the progress bar and
 * the Street jumps. Pure: it reads only each state's Street and whether the
 * Hand reached Showdown.
 */

/** A segment of the progress bar: a Street, or Showdown after the last one. */
export type Stop = Street | 'showdown'

export interface StreetSegment {
  stop: Stop
  state: 'completed' | 'current' | 'pending'
  /** How far through the current Street Playback is, 0 to 1. */
  progress: number
  /** The Action index the segment jumps to, or null if the Hand never got there. */
  target: number | null
}

export interface StreetProgress {
  segments: StreetSegment[]
  /** Playback is on the Hand's last Action. */
  finished: boolean
  /**
   * Where the Street jumps go: back to this Street's start, or from there the
   * one before; forward to the next Street's start, or to Showdown after the river.
   */
  previousStreet: number | null
  nextStreet: number | null
}

const STOPS: Stop[] = ['preflop', 'flop', 'turn', 'river', 'showdown']

export function streetProgress(
  timeline: { showdown: boolean; states: { street: Street }[] },
  actionIndex: number,
): StreetProgress {
  const { states, showdown } = timeline
  const last = states.length - 1
  const index = Math.min(Math.max(actionIndex, 0), last)
  const order = (stop: Stop) => STOPS.indexOf(stop)
  const finalStreet = order(states[last].street)

  // A Street starts at the first state on it, or past it when an all-in
  // runout deals it without anyone acting; Showdown is the last Action.
  const targets = STOPS.map((stop) => {
    if (stop === 'showdown') return showdown ? last : null
    if (order(stop) > finalStreet) return null
    return states.findIndex((state) => order(state.street) >= order(stop))
  })
  const current = order(showdown && index === last ? 'showdown' : states[index].street)
  const starts = [...new Set(targets.filter((target) => target !== null))].sort((a, b) => a - b)
  const previousStreet = starts.findLast((start) => start < index) ?? null
  const nextStreet = starts.find((start) => start > index) ?? null

  const start = targets[current] ?? index
  const end = nextStreet ?? last
  const progress = end > start ? (index - start) / (end - start) : 1

  return {
    segments: STOPS.map((stop, i) => ({
      stop,
      state: i < current ? 'completed' : i === current ? 'current' : 'pending',
      progress: i < current ? 1 : i === current ? progress : 0,
      target: targets[i],
    })),
    finished: index === last,
    previousStreet,
    nextStreet,
  }
}
