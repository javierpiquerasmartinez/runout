import type { Street } from './hand'

/*
 * Where Playback is in the Hand, Street by Street, for the progress bar and
 * the Street jumps. Pure: it reads only each state's Street and whether the
 * Hand reached Showdown.
 */

/**
 * A segment of the progress bar: a Street, or Showdown after the last one.
 * A Hand run more than once has one segment per Run after the Streets dealt
 * before the all-in, in place of the rest: `run-1`, `run-2`…
 */
export type Stop = Street | 'showdown' | `run-${number}`

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

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river']

/** What the progress bar reads of each state: its Street and, run more than once, its Run. */
interface ProgressState {
  street: Street
  run?: number | null
  runs?: unknown[] | null
}

export function streetProgress(
  timeline: { showdown: boolean; states: ProgressState[] },
  actionIndex: number,
): StreetProgress {
  const { states, showdown } = timeline
  const last = states.length - 1
  const index = Math.min(Math.max(actionIndex, 0), last)
  const order = (street: Street) => STREETS.indexOf(street)
  const runCount = states[last].runs?.length ?? 0
  const firstRun = states.findIndex((state) => state.run != null)

  // A Street starts at the first state on it, or past it when an all-in
  // runout deals it without anyone acting; Showdown is the last Action.
  // A Run starts at its first card.
  const finalStreet = order(runCount > 0 ? states[firstRun - 1].street : states[last].street)
  const streets = runCount > 0 ? STREETS.slice(0, finalStreet + 1) : STREETS
  const stops: Stop[] =
    runCount > 0
      ? [...streets, ...Array.from({ length: runCount }, (_, run) => `run-${run + 1}` as const)]
      : [...STREETS, 'showdown']
  const targets = stops.map((stop, i) => {
    if (i >= streets.length) {
      return runCount > 0 ? states.findIndex((state) => state.run === i - streets.length) : showdown ? last : null
    }
    if (order(stop as Street) > finalStreet) return null
    return states.findIndex((state) => order(state.street) >= order(stop as Street))
  })
  const run = states[index].run
  const current =
    run != null
      ? streets.length + run
      : runCount === 0 && showdown && index === last
        ? stops.indexOf('showdown')
        : order(states[index].street)
  const starts = [...new Set(targets.filter((target) => target !== null))].sort((a, b) => a - b)
  const previousStreet = starts.findLast((start) => start < index) ?? null
  const nextStreet = starts.find((start) => start > index) ?? null

  const start = targets[current] ?? index
  const end = nextStreet ?? last
  const progress = end > start ? (index - start) / (end - start) : 1

  return {
    segments: stops.map((stop, i) => ({
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
