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
  /** The Hand itself, so it can be opened from the graph. */
  handId: string
  /** The Hero's cards in that Hand, as the Library list shows them. */
  holeCards: string[]
  /** In big blinds of each Hand's own Stake, to the hundredth. */
  bigBlinds: ResultLines
  /** As Amounts, only when every Hand shares one currency. */
  amounts: ResultLines | null
}

/** Where the lines stand, in both units. */
export type ResultsLines = Pick<ResultsPoint, 'bigBlinds' | 'amounts'>

/** The running Results over the Hands a Library filter keeps. */
export interface Results {
  hands: number
  /** The currency every Hand shares, or null when they mix (or there are none). */
  currency: string | null
  totals: ResultsLines
  /** Downsampled by the server; the last one is the last Hand, equal to the totals. */
  points: ResultsPoint[]
}
