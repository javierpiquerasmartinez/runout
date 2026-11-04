import { describe, expect, it } from 'vitest'
import {
  BET,
  betCentres,
  betHeight,
  centred,
  DEALER,
  dealerCentre,
  insideFelt,
  obstacles,
  overlaps,
  seatCentre,
  TABLE,
  type Point,
  type SeatPlace,
} from './tableLayout'

/** Every seat taken, the Hero in slot 0 and the button at `dealer`. */
const full = (slots: number, dealer: number): SeatPlace[] =>
  Array.from({ length: slots }, (_, slot) => ({ slot, hero: slot === 0, dealer: slot === dealer }))

const sizes = [1, 2].map((lines) => ({ ...BET, height: betHeight(lines) }))

const pills = (slots: number, seats: SeatPlace[], size = BET) =>
  [...betCentres(slots, seats, size.height).values()].map((centre) => centred(centre, size.width, size.height))

/** Every table size from heads-up to 9-max, with the button on every seat, in one unit and in both. */
function* tables() {
  for (let slots = 2; slots <= 9; slots++) {
    for (let dealer = 0; dealer < slots; dealer++) {
      for (const size of sizes) yield { slots, dealer, size, seats: full(slots, dealer), at: `${slots} seats, button in ${dealer}, ${size.height} px pills` }
    }
  }
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** The seat nearest to `point`, by slot. */
const nearestSeat = (point: Point, slots: number, seats: SeatPlace[]) =>
  [...seats].sort((a, b) => distance(point, seatCentre(a.slot, slots)) - distance(point, seatCentre(b.slot, slots)))[0].slot

describe('betCentres', () => {
  it('keeps every bet off the board, the pot, the seats and the button, at any table size and button', () => {
    for (const { slots, seats, size, at } of tables()) {
      const blocked = obstacles(slots, seats)
      for (const pill of pills(slots, seats, size)) {
        expect(blocked.filter((other) => overlaps(pill, other)), at).toEqual([])
      }
    }
  })

  it('keeps every bet on the felt', () => {
    for (const { slots, seats, size, at } of tables()) {
      for (const pill of pills(slots, seats, size)) expect(insideFelt(pill), at).toBe(true)
    }
  })

  it('puts every bet nearer its own seat than any other, so it is clear whose it is', () => {
    for (const { slots, seats, size, at } of tables()) {
      for (const [slot, centre] of betCentres(slots, seats, size.height)) {
        expect(nearestSeat(centre, slots, seats), `${at}, bet of slot ${slot}`).toBe(slot)
      }
    }
  })

  it('never draws two bets on top of each other', () => {
    for (const { slots, seats, size, at } of tables()) {
      const drawn = pills(slots, seats, size)
      drawn.forEach((pill, i) => {
        expect(pill.left).toBeGreaterThanOrEqual(0)
        expect(pill.right).toBeLessThanOrEqual(TABLE.width)
        expect(drawn.slice(i + 1).filter((other) => overlaps(pill, other)), at).toEqual([])
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

describe('dealerCentre', () => {
  it('puts the button on the felt, nearest its own seat, clear of everything', () => {
    for (const { slots, dealer, seats, at } of tables()) {
      const centre = dealerCentre(slots, seats)!
      const button = centred(centre, DEALER, DEALER)
      expect(insideFelt(button), at).toBe(true)
      expect(nearestSeat(centre, slots, seats), at).toBe(dealer)
      const others = obstacles(slots, seats).filter((box) => !(box.left === button.left && box.top === button.top))
      expect(others.filter((other) => overlaps(button, other)), at).toEqual([])
    }
  })

  it('is absent when nobody has the button', () => {
    expect(dealerCentre(6, full(6, -1))).toBeNull()
  })
})
