import type { GraphColourPreference } from '../preferences/preferences'

/*
 * The running Results over the Hands a Library filter keeps, as the server's
 * `GET /library/results` sends them (ADR 0001: no shared code).
 */

/** The Results Graph's lines, in the order the legend lists them. */
export const RESULT_LINES = ['result', 'allInEv', 'showdown', 'nonShowdown'] as const

export type ResultLine = (typeof RESULT_LINES)[number]

/** The Preference (Graph Colours) that holds each line's colour. */
export const LINE_COLOUR: Record<ResultLine, GraphColourPreference> = {
  result: 'resultColour',
  allInEv: 'allInEvColour',
  showdown: 'showdownColour',
  nonShowdown: 'nonShowdownColour',
}

export type ResultLines = Record<ResultLine, number>

/** Where the lines stand after one Hand, counted from 1 in played order. */
export interface ResultsPoint {
  hand: number
  /** In big blinds of each Hand's own Stake, to the hundredth. */
  bigBlinds: ResultLines
  /** As Amounts, only when every Hand shares one currency. */
  amounts: ResultLines | null
}

/** A Zoom: the Hands from `from` to `to`, counted from 1 in played order. */
export interface Zoom {
  from: number
  to: number
}

/** The running Results over the Hands a Library filter keeps, or over a Zoom of them. */
export interface Results {
  /** How many Hands the series covers: all the filter keeps, or the Zoom's. */
  hands: number
  /** The currency every Hand the filter keeps shares, or null when they mix (or there are none). */
  currency: string | null
  /** What each line won or lost over the Hands the series covers. */
  totals: Omit<ResultsPoint, 'hand'>
  /** Where the lines stood just before the series' first Hand: nothing without a Zoom. */
  start: Omit<ResultsPoint, 'hand'>
  /** The stretch the series covers, as the server clamped it, or null for all of it. */
  zoom: Zoom | null
  /** Downsampled by the server; the last one is the series' last Hand. Each keeps the running totals from Hand 1. */
  points: ResultsPoint[]
}
