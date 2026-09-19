/*
 * Where things sit on the table of the "Sala" boards, drawn at 820 × 606:
 * the seats around the felt and each seat's bet. Pure, so the layout can be
 * checked without a browser. Sizes mirror RoomPage.css at that scale.
 */

export const TABLE = { width: 820, height: 606 }

/** Where the seats' plates sit, as a share of the table's width and height. */
const RIM = { x: 0.4, y: 0.3 }
const CENTRE = { x: 0.5, y: 0.49 }
/** Where a bet would ideally go: this share of the way from the centre to its seat. */
const BET_REACH = 0.62

const PLATE = { width: 148, height: 57 }
/**
 * A bet's pill, sized for the longest label ("999,9 BB 100% bote", or
 * "all-in 999,9 BB") so its place never shifts mid-Hand.
 */
export const BET = { width: 156, height: 28 }
/** The least room left between a bet and anything else. */
const CLEARANCE = 4
const STEP = 4

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Point {
  x: number
  y: number
}

export interface SeatPlace {
  slot: number
  hero: boolean
  dealer: boolean
}

/** Slot 0 is the bottom centre; slots go clockwise, as players act. */
export function seatCentre(slot: number, slots: number, reach = 1): Point {
  const angle = Math.PI / 2 + (slot / slots) * 2 * Math.PI
  return {
    x: TABLE.width * (CENTRE.x + RIM.x * reach * Math.cos(angle)),
    y: TABLE.height * (CENTRE.y + RIM.y * reach * Math.sin(angle)),
  }
}

/** A point as the CSS position of something centred on it. */
export function asPercent({ x, y }: Point): { left: string; top: string } {
  return { left: `${(x / TABLE.width) * 100}%`, top: `${(y / TABLE.height) * 100}%` }
}

function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height }
}

export function centred({ x, y }: Point, width: number, height: number): Box {
  return box(x - width / 2, y - height / 2, width, height)
}

export function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right + CLEARANCE && b.left < a.right + CLEARANCE && a.top < b.bottom + CLEARANCE && b.top < a.bottom + CLEARANCE
  )
}

/** What a bet must not cover: the board and pot, and every seat's plate, cards, status and dealer button. */
export function obstacles(slots: number, seats: SeatPlace[]): Box[] {
  // The board's five community cards, and the pot below them with room for a
  // long value, or for a main pot and two side pots side by side.
  const found = [box(261, 214, 298, 76), box(214, 304, 392, 58)]
  for (const seat of seats) {
    const { x, y } = seatCentre(seat.slot, slots)
    const plate = centred({ x, y }, PLATE.width, PLATE.height)
    found.push(plate)
    // The Hero's cards hang below the plate and the status above; everyone else's the other way round.
    if (seat.hero) found.push(box(x - 42, plate.bottom + 5, 84, 56), box(x - 48, plate.top - 19, 96, 14))
    else found.push(box(x - 32, plate.top - 47, 64, 42), box(x - 48, plate.bottom + 5, 96, 14))
    if (seat.dealer) found.push(box(plate.right + 12, plate.top + 10, 22, 22))
  }
  return found
}

/**
 * Where each seat's bet is centred, by slot: the free spot nearest its ideal
 * place between the seat and the middle, so no bet covers the board, the pot,
 * a seat or another bet. Seats are placed in slot order.
 */
export function betCentres(slots: number, seats: SeatPlace[]): Map<number, Point> {
  const taken = obstacles(slots, seats)
  const centres = new Map<number, Point>()
  for (const { slot } of [...seats].sort((a, b) => a.slot - b.slot)) {
    const ideal = seatCentre(slot, slots, BET_REACH)
    let best: { point: Point; distance: number } | null = null
    for (let x = BET.width / 2; x <= TABLE.width - BET.width / 2; x += STEP) {
      for (let y = BET.height / 2; y <= TABLE.height - BET.height / 2; y += STEP) {
        const distance = (x - ideal.x) ** 2 + (y - ideal.y) ** 2
        if (best && distance >= best.distance) continue
        const pill = centred({ x, y }, BET.width, BET.height)
        if (taken.some((other) => overlaps(pill, other))) continue
        best = { point: { x, y }, distance }
      }
    }
    // A table with no room at all keeps the ideal place rather than losing the bet.
    const point = best?.point ?? ideal
    centres.set(slot, point)
    taken.push(centred(point, BET.width, BET.height))
  }
  return centres
}

const cache = new Map<string, Map<number, Point>>()

/** `betCentres`, worked out once per table shape: it only changes when another Hand is loaded. */
export function cachedBetCentres(slots: number, seats: SeatPlace[]): Map<number, Point> {
  const key = `${slots}:${seats.map((s) => `${s.slot}${s.hero ? 'h' : ''}${s.dealer ? 'd' : ''}`).join(',')}`
  let centres = cache.get(key)
  if (!centres) {
    centres = betCentres(slots, seats)
    cache.set(key, centres)
  }
  return centres
}
