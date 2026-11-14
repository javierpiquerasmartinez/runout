import { waveHeightAt } from './brandWave'

/**
 * The Results the Landing's graph stands for: nobody's, made up to the shape
 * of the Runout wave. The Result line is the wave itself; the All-in EV line
 * runs a little under it.
 */
export const sampleResults = {
  hands: 12_480,
  /** What the wave's crest stands for, in big blinds. */
  crest: 1200,
  /** The figures the rules across the graph mark. */
  rules: [0, 400, 800, 1200],
} as const

/** The Result line's height at `x` across the graph, both from 0 to 1. */
export const resultAt = waveHeightAt

/** The All-in EV line's height at `x` across the graph, both from 0 to 1. */
export function allInEvAt(x: number): number {
  return waveHeightAt(x) * 0.88 + 0.06 * x * Math.sin(x * 11)
}

/** What a line ends on, in big blinds. */
export function totalOf(line: (x: number) => number): number {
  return Math.round(line(1) * sampleResults.crest)
}

/** A line's Win Rate: big blinds won every hundred Hands. */
export function winRateOf(line: (x: number) => number): number {
  return (totalOf(line) / sampleResults.hands) * 100
}
