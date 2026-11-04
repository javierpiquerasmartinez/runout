/*
 * Where things sit on the table of the "Sala" boards, drawn at 820 × 606:
 * the seats around the felt, the dealer button and each seat's bet. Pure, so
 * the layout can be checked without a browser. Sizes mirror RoomPage.css at
 * that scale.
 */

export const TABLE = { width: 820, height: 606 }
/** The felt: a stadium (a pill) at 110, 148, 600 × 300, as `.poker-table__felt` draws it. */
export const FELT = { left: 110, top: 148, width: 600, height: 300 }

/** Where the seats' plates sit, as a share of the table's width and height. */
const RIM = { x: 0.4, y: 0.3 }
const CENTRE = { x: 0.5, y: 0.49 }
/** Where a bet would ideally go: this share of the way from the centre to its seat. */
const BET_REACH = 0.62

const PLATE = { width: 148, height: 57 }
/**
 * A bet's pill, sized for the longest amount ("999,9 BB") so its place never
 * shifts mid-Hand: one line for the amount, and maybe one more below it.
 * Three lines don't fit a 9-max table.
 */
export const BET = { width: 96, height: 24 }
const BET_LINE = 12

/** A bet's height with `lines` lines, 1 or 2. */
export function betHeight(lines: number): number {
  return BET.height + BET_LINE * (lines - 1)
}
/** The dealer button's diameter. */
export const DEALER = 22
/** The least room left between a bet or the button and anything else. */
const CLEARANCE = 4
/** The least room left between a bet or the button and the felt's edge. */
const FELT_MARGIN = 4
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

/** Whether `b` lies on the felt, `FELT_MARGIN` clear of its edge. The felt is convex, so its corners settle it. */
export function insideFelt(b: Box): boolean {
  const radius = FELT.height / 2 - FELT_MARGIN
  const cy = FELT.top + FELT.height / 2
  const onFelt = (x: number, y: number) => {
    const cx = Math.min(Math.max(x, FELT.left + FELT.height / 2), FELT.left + FELT.width - FELT.height / 2)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
  }
  return onFelt(b.left, b.top) && onFelt(b.right, b.top) && onFelt(b.left, b.bottom) && onFelt(b.right, b.bottom)
}

/** The board and pot, and every seat's plate, cards and status: what neither a bet nor the button may cover. */
function fixed(slots: number, seats: SeatPlace[]): Box[] {
  // The board's five community cards, and the pot below them with room for a
  // long value, or for a main pot and two side pots side by side.
  const found = [box(290, 222, 240, 60), box(280, 294, 260, 60)]
  for (const seat of seats) {
    const { x, y } = seatCentre(seat.slot, slots)
    const plate = centred({ x, y }, PLATE.width, PLATE.height)
    found.push(plate)
    // The Hero's cards hang below the plate and the status above; everyone else's the other way round.
    if (seat.hero) found.push(box(x - 42, plate.bottom + 5, 84, 56), box(x - 48, plate.top - 19, 96, 14))
    else found.push(box(x - 32, plate.top - 47, 64, 42), box(x - 48, plate.bottom + 5, 96, 14))
  }
  return found
}

/**
 * The free spot on the felt nearest `ideal` for a `width` × `height` box: it
 * covers nothing in `taken` and is nearer the seat in `slot` than any other.
 */
function freeSpot(
  ideal: Point,
  width: number,
  height: number,
  taken: Box[],
  slot: number,
  slots: number,
  seats: SeatPlace[],
): Point | null {
  const own = seatCentre(slot, slots)
  const others = seats.filter((seat) => seat.slot !== slot).map((seat) => seatCentre(seat.slot, slots))
  let best: { point: Point; distance: number } | null = null
  for (let x = FELT.left + width / 2; x <= FELT.left + FELT.width - width / 2; x += STEP) {
    for (let y = FELT.top + height / 2; y <= FELT.top + FELT.height - height / 2; y += STEP) {
      const distance = (x - ideal.x) ** 2 + (y - ideal.y) ** 2
      if (best && distance >= best.distance) continue
      const spot = centred({ x, y }, width, height)
      if (!insideFelt(spot) || taken.some((other) => overlaps(spot, other))) continue
      const mine = (x - own.x) ** 2 + (y - own.y) ** 2
      if (others.some((other) => (x - other.x) ** 2 + (y - other.y) ** 2 <= mine)) continue
      best = { point: { x, y }, distance }
    }
  }
  return best?.point ?? null
}

/** Where the dealer button is centred: on the felt, as close to its seat as it fits. Null when nobody has it. */
export function dealerCentre(slots: number, seats: SeatPlace[]): Point | null {
  const dealer = seats.find((seat) => seat.dealer)
  if (!dealer) return null
  // Beside the seat rather than in front of it, which is where its bet goes.
  const beside = seatCentre(dealer.slot + 0.3, slots, 0.8)
  return freeSpot(beside, DEALER, DEALER, fixed(slots, seats), dealer.slot, slots, seats) ?? seatCentre(dealer.slot, slots, 0.7)
}

/** What a bet must not cover: the board and pot, and every seat's plate, cards, status and dealer button. */
export function obstacles(slots: number, seats: SeatPlace[]): Box[] {
  const found = fixed(slots, seats)
  const dealer = dealerCentre(slots, seats)
  if (dealer) found.push(centred(dealer, DEALER, DEALER))
  return found
}

/**
 * Where each seat's bet is centred, by slot: the free spot on the felt
 * nearest its ideal place between the seat and the middle, nearer its own
 * seat than any other so it reads as theirs, and covering nothing else.
 * Seats are placed in slot order.
 */
export function betCentres(slots: number, seats: SeatPlace[], height = BET.height): Map<number, Point> {
  const taken = obstacles(slots, seats)
  const centres = new Map<number, Point>()
  for (const { slot } of [...seats].sort((a, b) => a.slot - b.slot)) {
    const ideal = seatCentre(slot, slots, BET_REACH)
    // A table with no room at all keeps the ideal place rather than losing the bet.
    const point = freeSpot(ideal, BET.width, height, taken, slot, slots, seats) ?? ideal
    centres.set(slot, point)
    taken.push(centred(point, BET.width, height))
  }
  return centres
}

const cache = new Map<string, { bets: Map<number, Point>; dealer: Point | null }>()

/** `betCentres` and `dealerCentre`, worked out once per table shape: they only change when another Hand is loaded. */
export function cachedPlaces(
  slots: number,
  seats: SeatPlace[],
  height = BET.height,
): { bets: Map<number, Point>; dealer: Point | null } {
  const key = `${slots}:${height}:${seats.map((s) => `${s.slot}${s.hero ? 'h' : ''}${s.dealer ? 'd' : ''}`).join(',')}`
  let places = cache.get(key)
  if (!places) {
    places = { bets: betCentres(slots, seats, height), dealer: dealerCentre(slots, seats) }
    cache.set(key, places)
  }
  return places
}
