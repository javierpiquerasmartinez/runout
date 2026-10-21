/*
 * The running Results over the Hands a Library filter keeps, as the server's
 * `GET /library/results` sends them (ADR 0001: no shared code).
 */

/** The Results Graph's lines, in the order the legend lists them. */
export const RESULT_LINES = ['result', 'showdown', 'nonShowdown'] as const

export type ResultLine = (typeof RESULT_LINES)[number]

export type ResultLines = Record<ResultLine, number>

/** Where the lines stand after one Hand, counted from 1 in played order. */
export interface ResultsPoint {
  hand: number
  /** In big blinds of each Hand's own Stake, to the hundredth. */
  bigBlinds: ResultLines
  /** As Amounts, only when every Hand shares one currency. */
  amounts: ResultLines | null
}

export interface Results {
  hands: number
  /** The currency every Hand shares, or null when they mix. */
  currency: string | null
  totals: Omit<ResultsPoint, 'hand'>
  /** Downsampled by the server; the last one is the last Hand, equal to the totals. */
  points: ResultsPoint[]
}
