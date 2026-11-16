import { describe, expect, it } from 'vitest'
import {
  BET,
  betCentres,
  betHeight,
  centred,
  DEALER,
  dealerCentre,
  fixedPieces,
  insideFelt,
  LANDSCAPE,
  obstacles,
  overlaps,
  portrait,
  type Box,
  type Point,
  type SeatPlace,
  type TableShape,
} from './tableLayout'

/** Every seat taken, the Hero in slot 0 and the button at `dealer`. */
const full = (slots: number, dealer: number): SeatPlace[] =>
  Array.from({ length: slots }, (_, slot) => ({ slot, hero: slot === 0, dealer: slot === dealer }))

const sizes = [1, 2].map((lines) => ({ ...BET, height: betHeight(lines) }))

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const insideDrawing = (b: Box, shape: TableShape) =>
  b.left >= 0 && b.top >= 0 && b.right <= shape.table.width && b.bottom <= shape.table.height

const drawings = {
  // The "Sala" boards' table, for every size up to 9-max.
  landscape: { shapeOf: (): TableShape => LANDSCAPE, most: 9 },
  // The phone boards' table, standing up, up to 10-max.
  portrait: { shapeOf: (slots: number): TableShape => portrait(slots), most: 10 },
}

for (const [name, { shapeOf, most }] of Object.entries(drawings)) {
  /** Every table size from heads-up up, with the button on every seat, in one unit and in both. */
  function* tables() {
    for (let slots = 2; slots <= most; slots++) {
      const shape = shapeOf(slots)
      for (let dealer = 0; dealer < slots; dealer++) {
        for (const size of sizes) {
          yield { slots, dealer, size, shape, seats: full(slots, dealer), at: `${slots} seats, button in ${dealer}, ${size.height} px pills` }
        }
      }
    }
  }

  const pills = (slots: number, seats: SeatPlace[], shape: TableShape, size = BET) =>
    [...betCentres(slots, seats, size.height, shape).values()].map((centre) => centred(centre, size.width, size.height))

  /** The seat nearest to `point`, by slot. */
  const nearestSeat = (point: Point, slots: number, seats: SeatPlace[], shape: TableShape) =>
    [...seats].sort((a, b) => distance(point, shape.anchor(a.slot, slots)) - distance(point, shape.anchor(b.slot, slots)))[0].slot

  describe(`the ${name} table`, () => {
    describe('betCentres', () => {
      it('keeps every bet off the board, the pot, the seats and the button, at any table size and button', () => {
        for (const { slots, seats, size, shape, at } of tables()) {
          const blocked = obstacles(slots, seats, shape)
          for (const pill of pills(slots, seats, shape, size)) {
            expect(blocked.filter((other) => overlaps(pill, other)), at).toEqual([])
          }
        }
      })

      it('keeps every bet on the felt where the drawing asks for it, and in the drawing always', () => {
        for (const { slots, seats, size, shape, at } of tables()) {
          for (const pill of pills(slots, seats, shape, size)) {
            if (shape.betsOnFelt) expect(insideFelt(pill, shape), at).toBe(true)
            expect(insideDrawing(pill, shape), at).toBe(true)
          }
        }
      })

      it('puts every bet nearer its own seat than any other, so it is clear whose it is', () => {
        for (const { slots, seats, size, shape, at } of tables()) {
          for (const [slot, centre] of betCentres(slots, seats, size.height, shape)) {
            expect(nearestSeat(centre, slots, seats, shape), `${at}, bet of slot ${slot}`).toBe(slot)
          }
        }
      })

      it('never draws two bets on top of each other', () => {
        for (const { slots, seats, size, shape, at } of tables()) {
          const drawn = pills(slots, seats, shape, size)
          drawn.forEach((pill, i) => {
            expect(pill.left).toBeGreaterThanOrEqual(0)
            expect(pill.right).toBeLessThanOrEqual(shape.table.width)
            expect(drawn.slice(i + 1).filter((other) => overlaps(pill, other)), at).toEqual([])
          })
        }
      })

      it('leaves a bet where it would be when nothing is in the way', () => {
        // Heads-up: straight above the Hero, and straight below the opponent.
        const shape = shapeOf(2)
        const centres = betCentres(2, full(2, 1), BET.height, shape)
        expect(centres.get(0)!.x).toBeCloseTo(shape.table.width / 2, -1)
        expect(centres.get(1)!.x).toBeCloseTo(shape.table.width / 2, -1)
      })
    })

    describe('dealerCentre', () => {
      it('puts the button on the felt, nearest its own seat, clear of everything', () => {
        for (const { slots, dealer, seats, shape, at } of tables()) {
          const centre = dealerCentre(slots, seats, shape)!
          const button = centred(centre, DEALER, DEALER)
          if (shape.betsOnFelt) expect(insideFelt(button, shape), at).toBe(true)
          expect(insideDrawing(button, shape), at).toBe(true)
          expect(nearestSeat(centre, slots, seats, shape), at).toBe(dealer)
          const others = obstacles(slots, seats, shape).filter((box) => !(box.left === button.left && box.top === button.top))
          expect(others.filter((other) => overlaps(button, other)), at).toEqual([])
        }
      })

      it('is absent when nobody has the button', () => {
        expect(dealerCentre(6, full(6, -1), shapeOf(6))).toBeNull()
      })
    })
  })
}

describe('the landscape table', () => {
  it('moves the upper-right bet of a 6-max table clear of the river card', () => {
    // The BB in slot 2 used to cover the river's left edge.
    const [river] = obstacles(6, [])
    const bb = centred(betCentres(6, full(6, 5)).get(2)!, BET.width, BET.height)
    expect(overlaps(bb, river)).toBe(false)
  })
})

describe('the portrait table', () => {
  it('fits every seat and its cards, the pot and the board in the drawing without touching, heads-up to 10-max', () => {
    for (let slots = 2; slots <= 10; slots++) {
      const shape = portrait(slots)
      const pieces = fixedPieces(slots, full(slots, -1), shape)
      const middle = shape.middle.length
      pieces.forEach((piece, i) => {
        expect(insideDrawing(piece, shape), `${slots} seats, piece ${i} leaves the drawing`).toBe(true)
        // A seat's own plate and cards (or status, the Hero's) are drawn together: only other seats' and the middle count.
        const own = i < middle ? [] : seatOf(i, middle)
        const others = pieces.filter((_, j) => j > i && !own.includes(j))
        expect(others.filter((other) => overlaps(piece, other)), `${slots} seats, piece ${i}`).toEqual([])
      })
    }
  })

  it('stands the felt on its end, the Hero at the bottom centre and the seat opposite at the top', () => {
    const shape = portrait(6)
    const { felt } = shape
    expect(felt.bottom - felt.top).toBeGreaterThan(felt.right - felt.left)
    const hero = shape.seatCentre(0, 6)
    const opposite = shape.seatCentre(3, 6)
    expect(hero.x).toBeCloseTo(shape.table.width / 2)
    expect(opposite.x).toBeCloseTo(shape.table.width / 2)
    expect(hero.y).toBeGreaterThan(felt.bottom - 32)
    expect(opposite.y).toBeLessThan(felt.top + 32)
  })

  it('draws up to 6-max on a short table and bigger tables on a taller one', () => {
    expect(portrait(6).table).toEqual({ width: 390, height: 640 })
    expect(portrait(9).table).toEqual({ width: 390, height: 780 })
  })
})

/** The indices of the two boxes (plate and cards, or plate and status) of the seat `i` belongs to. */
function seatOf(i: number, offset: number): number[] {
  const first = offset + Math.floor((i - offset) / 2) * 2
  return [first, first + 1]
}
