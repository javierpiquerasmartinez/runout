import { describe, expect, it } from 'vitest'
import { BET, betCentres, centred, obstacles, overlaps, TABLE, type SeatPlace } from './tableLayout'

/** Every seat taken, the Hero in slot 0 and the button at `dealer`. */
const full = (slots: number, dealer: number): SeatPlace[] =>
  Array.from({ length: slots }, (_, slot) => ({ slot, hero: slot === 0, dealer: slot === dealer }))

const pills = (slots: number, seats: SeatPlace[]) =>
  [...betCentres(slots, seats).values()].map((centre) => centred(centre, BET.width, BET.height))

describe('betCentres', () => {
  it('keeps every bet off the board, the pot and the seats, at any table size and button', () => {
    for (let slots = 2; slots <= 9; slots++) {
      for (let dealer = 0; dealer < slots; dealer++) {
        const seats = full(slots, dealer)
        const blocked = obstacles(slots, seats)
        for (const pill of pills(slots, seats)) {
          expect(blocked.filter((other) => overlaps(pill, other)), `${slots} seats, button in ${dealer}`).toEqual([])
        }
      }
    }
  })

  it('never draws two bets on top of each other, or off the table', () => {
    for (let slots = 2; slots <= 9; slots++) {
      const drawn = pills(slots, full(slots, 0))
      drawn.forEach((pill, i) => {
        expect(pill.left).toBeGreaterThanOrEqual(0)
        expect(pill.right).toBeLessThanOrEqual(TABLE.width)
        expect(drawn.slice(i + 1).filter((other) => overlaps(pill, other))).toEqual([])
      })
    }
  })

  it('moves the upper-right bet of a 6-max table clear of the river card', () => {
    // The BB in slot 2 used to cover the river's left edge.
    const [river] = obstacles(6, [])
    const bb = centred(betCentres(6, full(6, 5)).get(2)!, BET.width, BET.height)
    expect(overlaps(bb, river)).toBe(false)
  })

  it('leaves a bet where it would be when nothing is in the way', () => {
    // Heads-up: straight above the Hero, and straight below the opponent.
    const centres = betCentres(2, full(2, 1))
    expect(centres.get(0)!.x).toBeCloseTo(TABLE.width / 2, -1)
    expect(centres.get(1)!.x).toBeCloseTo(TABLE.width / 2, -1)
  })
})
