import type { Translator } from '../i18n/translator'
import type { DisplayUnit, GraphColourPreference } from '../preferences/preferences'

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
export type LinesInBothUnits = Pick<ResultsPoint, 'bigBlinds' | 'amounts'>

/** A Zoom: the Hands from `from` to `to`, counted from 1 in played order. */
export interface Zoom {
  from: number
  to: number
}

/**
 * The Hero's share of the Rake, by what they put in the pot: in big blinds,
 * and as an Amount only when every Hand shares one currency.
 */
export interface RakeGenerated {
  bigBlinds: number
  amounts: number | null
}

/** The running Results over the Hands a Library filter keeps, or over a Zoom of them. */
export interface Results {
  /** How many Hands the series covers: all the filter keeps, or the Zoom's. */
  hands: number
  /** The currency every Hand the filter keeps shares, or null when they mix (or there are none). */
  currency: string | null
  /** What each line won or lost over the Hands the series covers. */
  totals: LinesInBothUnits
  /** Where the lines stood just before the series' first Hand: nothing without a Zoom. */
  start: LinesInBothUnits
  /** The stretch the series covers, as the server clamped it, or null for all of it. */
  zoom: Zoom | null
  /** The Hero's Rake Generated over the Hands the series covers. */
  rakeGenerated: RakeGenerated
  /** Downsampled by the server; the last one is the series' last Hand. Each keeps the running totals from Hand 1. */
  points: ResultsPoint[]
}

/** What a graph adds up in: big blinds always, Amounts only in one currency. */
export type GraphUnit = Exclude<DisplayUnit, 'both'>

/** A line's Win Rate, in big blinds per 100 Hands of the series; only asked of a series that has Hands. */
export function winRate(results: Pick<Results, 'hands' | 'totals'>, line: ResultLine): number {
  return (results.totals.bigBlinds[line] / results.hands) * 100
}

/** A line's value, signed: "+4.9 BB", "-€0.09". With `auto`, only a negative one is. */
export function formatValue(
  value: number,
  unit: GraphUnit,
  currency: string | null,
  i18n: Translator,
  signDisplay: 'exceptZero' | 'auto' = 'exceptZero',
): string {
  if (unit === 'amount' && currency) return i18n.formatCurrency(value / 100, currency, { signDisplay })
  return i18n.t('room.table.bigBlinds', {
    value: i18n.formatNumber(value, { maximumFractionDigits: 2, signDisplay }),
  })
}
