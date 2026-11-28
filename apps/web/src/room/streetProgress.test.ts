import { describe, expect, it } from 'vitest'
import type { Street } from './hand'
import { streetProgress } from './streetProgress'

/** A Timeline reduced to what the progress bar reads: each state's Street. */
const timeline = (showdown: boolean, ...streets: Street[]) => ({ showdown, states: streets.map((street) => ({ street })) })

/**
 * Preflop: Initial State and two Actions; the third closes it (index 3 is on
 * the flop). Flop 3–5, turn 6–7, river 8–10, then Showdown at the last Action.
 */
const toShowdown = timeline(
  true,
  'preflop', 'preflop', 'preflop',
  'flop', 'flop', 'flop',
  'turn', 'turn',
  'river', 'river', 'river',
)

/** Won by a fold on the flop: the turn, the river and Showdown never came. */
const foldedOnTheFlop = timeline(false, 'preflop', 'preflop', 'flop', 'flop', 'flop')

/** All in on the flop: the last Action deals the turn and river at once. */
const allInOnTheFlop = timeline(true, 'preflop', 'preflop', 'flop', 'river')

const states = (progress: ReturnType<typeof streetProgress>) => progress.segments.map((s) => [s.stop, s.state])

describe('streetProgress', () => {
  it('has the four Streets plus Showdown, whatever the Hand reached', () => {
    expect(streetProgress(foldedOnTheFlop, 0).segments.map((s) => s.stop)).toEqual([
      'preflop',
      'flop',
      'turn',
      'river',
      'showdown',
    ])
  })

  it('marks the Streets before the current one completed and the ones after pending', () => {
    expect(states(streetProgress(toShowdown, 4))).toEqual([
      ['preflop', 'completed'],
      ['flop', 'current'],
      ['turn', 'pending'],
      ['river', 'pending'],
      ['showdown', 'pending'],
    ])
  })

  it('fills the current Street by how far through its Actions Playback is', () => {
    const flop = (index: number) => streetProgress(toShowdown, index).segments[1].progress
    expect(flop(3)).toBe(0)
    expect(flop(4)).toBeCloseTo(1 / 3)
    expect(flop(5)).toBeCloseTo(2 / 3)
  })

  it('jumps each Street to where it starts: the Initial State for preflop, the deal for the others', () => {
    expect(streetProgress(toShowdown, 4).segments.map((s) => s.target)).toEqual([0, 3, 6, 8, 10])
  })

  it('leaves Streets the Hand never reached, and Showdown when there was none, with nowhere to go', () => {
    expect(streetProgress(foldedOnTheFlop, 0).segments.map((s) => s.target)).toEqual([0, 2, null, null, null])
  })

  it('reaches Streets dealt in an all-in runout, landing them on the last Action', () => {
    expect(streetProgress(allInOnTheFlop, 0).segments.map((s) => s.target)).toEqual([0, 2, 3, 3, 3])
  })

  it('is at Showdown on the last Action of a Hand that went there, with the Hand finished', () => {
    const atShowdown = streetProgress(toShowdown, 10)
    expect(atShowdown.finished).toBe(true)
    expect(atShowdown.segments.find((s) => s.state === 'current')?.stop).toBe('showdown')
    expect(streetProgress(toShowdown, 9).finished).toBe(false)
  })

  it('finishes on the Final Street when the Hand ended without Showdown', () => {
    const end = streetProgress(foldedOnTheFlop, 4)
    expect(end.finished).toBe(true)
    expect(states(end)).toEqual([
      ['preflop', 'completed'],
      ['flop', 'current'],
      ['turn', 'pending'],
      ['river', 'pending'],
      ['showdown', 'pending'],
    ])
  })

  it('steps a Street forward to the next one’s start, and back to this one’s start or, from there, the one before', () => {
    expect(streetProgress(toShowdown, 4)).toMatchObject({ previousStreet: 3, nextStreet: 6 })
    expect(streetProgress(toShowdown, 3)).toMatchObject({ previousStreet: 0, nextStreet: 6 })
    expect(streetProgress(toShowdown, 0)).toMatchObject({ previousStreet: null, nextStreet: 3 })
    expect(streetProgress(toShowdown, 9)).toMatchObject({ previousStreet: 8, nextStreet: 10 })
    expect(streetProgress(toShowdown, 10)).toMatchObject({ previousStreet: 8, nextStreet: null })
  })

  it('has no next Street on the Final Street of a Hand that ended without Showdown', () => {
    expect(streetProgress(foldedOnTheFlop, 3)).toMatchObject({ previousStreet: 2, nextStreet: null })
  })

  describe('in a Hand run twice', () => {
    // All in on the turn: Run 1 deals its river (6) and pays (7), Run 2 goes
    // back to the turn (8), deals its river (9) and ends the Hand (10).
    const runs = [{}, {}]
    const ranTwice = {
      showdown: true,
      states: [
        ...(['preflop', 'preflop', 'flop', 'flop', 'turn', 'turn'] as Street[]).map((street) => ({ street, run: null, runs: null })),
        { street: 'river' as Street, run: 0, runs },
        { street: 'river' as Street, run: 0, runs },
        { street: 'turn' as Street, run: 1, runs },
        { street: 'river' as Street, run: 1, runs },
        { street: 'river' as Street, run: 1, runs },
      ],
    }

    it('has the Streets dealt before the all-in, then a segment per Run instead of the river and Showdown', () => {
      expect(states(streetProgress(ranTwice, 9))).toEqual([
        ['preflop', 'completed'],
        ['flop', 'completed'],
        ['turn', 'completed'],
        ['run-1', 'completed'],
        ['run-2', 'current'],
      ])
      expect(streetProgress(ranTwice, 5).segments.map((s) => s.target)).toEqual([0, 2, 4, 6, 8])
    })

    it('steps by Street from Run to Run, and finishes on the last Run’s Showdown', () => {
      expect(streetProgress(ranTwice, 5)).toMatchObject({ previousStreet: 4, nextStreet: 6 })
      expect(streetProgress(ranTwice, 7)).toMatchObject({ previousStreet: 6, nextStreet: 8 })
      expect(streetProgress(ranTwice, 9)).toMatchObject({ previousStreet: 8, nextStreet: null })
      expect(streetProgress(ranTwice, 10).finished).toBe(true)
      expect(streetProgress(ranTwice, 7).segments[3].state).toBe('current')
    })
  })
})
