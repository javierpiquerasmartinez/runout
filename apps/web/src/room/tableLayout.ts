/*
 * Where things sit on the table: the seats around the felt, the dealer button
 * and each seat's bet. Pure, so the layout can be checked without a browser.
 *
 * There are two drawings of the table. The "Sala" boards' landscape one, at
 * 820 × 606, and the phone boards' portrait one ("Biblioteca · Una mano en el
 * móvil", "Sala · En el móvil"), 390 wide, where the felt stands on its
 * end with the Hero at the bottom. Sizes mirror RoomPage.css at each scale.
 */

export interface Size {
  width: number
  height: number
}

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

/** One drawing of the table: its size, its felt, where its seats go and what each takes up. */
export interface TableShape {
  name: 'landscape' | 'portrait'
  /** Whether bets keep to the felt. On a phone a seat's bet sits by its plate, on the felt's rim if need be. */
  betsOnFelt: boolean
  table: Size
  /** The felt: a stadium (a pill), lying down or standing up, as `.poker-table__felt` draws it. */
  felt: Box
  /** Where the seat in `slot` is centred, or `reach` of the way there from the middle. */
  seatCentre(slot: number, slots: number, reach?: number): Point
  /** What a bet or the button must be nearer to than any other seat's, to read as that seat's. */
  anchor(slot: number, slots: number): Point
  /** The board and the pot. */
  middle: Box[]
  /** What a seat centred on (x, y) takes up: its plate, cards and status. */
  seatBoxes(seat: SeatPlace, x: number, y: number): Box[]
  /** Where the bet of the seat in `slot` goes, when the drawing places it by hand rather than in the felt's free room. */
  placeBet?(slot: number, height: number): Point
  /** Where the button of the seat in `slot` goes, likewise. */
  placeDealer?(slot: number): Point
}

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
/** Where a bet would ideally go: this share of the way from the centre to its seat. */
const BET_REACH = 0.62

function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height }
}

export function centred({ x, y }: Point, width: number, height: number): Box {
  return box(x - width / 2, y - height / 2, width, height)
}

/* ---------- The landscape table: the "Sala" boards, 820 × 606 ---------- */

const LANDSCAPE_RIM = { x: 0.4, y: 0.3 }
const LANDSCAPE_CENTRE = { x: 0.5, y: 0.49 }
const LANDSCAPE_PLATE = { width: 148, height: 57 }

export const LANDSCAPE: TableShape = {
  name: 'landscape',
  betsOnFelt: true,
  table: { width: 820, height: 606 },
  felt: box(110, 148, 600, 300),
  // Slot 0 is the bottom centre; slots go clockwise, as players act.
  seatCentre(slot, slots, reach = 1) {
    const angle = Math.PI / 2 + (slot / slots) * 2 * Math.PI
    return {
      x: 820 * (LANDSCAPE_CENTRE.x + LANDSCAPE_RIM.x * reach * Math.cos(angle)),
      y: 606 * (LANDSCAPE_CENTRE.y + LANDSCAPE_RIM.y * reach * Math.sin(angle)),
    }
  },
  anchor(slot, slots) {
    return this.seatCentre(slot, slots)
  },
  // The board's five community cards, and the pot below them with room for a
  // long value, or for a main pot and two side pots side by side.
  middle: [box(290, 222, 240, 60), box(280, 294, 260, 60)],
  seatBoxes(seat, x, y) {
    const plate = centred({ x, y }, LANDSCAPE_PLATE.width, LANDSCAPE_PLATE.height)
    // The Hero's cards hang below the plate and the status above; everyone else's the other way round.
    return seat.hero
      ? [plate, box(x - 42, plate.bottom + 5, 84, 56), box(x - 48, plate.top - 19, 96, 14)]
      : [plate, box(x - 32, plate.top - 47, 64, 42), box(x - 48, plate.bottom + 5, 96, 14)]
  },
}

/* ---------- The portrait table: the phone boards, 390 wide ---------- */

const PORTRAIT_PLATE = { width: 124, height: 46 }
/** The Hero's plate holds their cards on its left. */
const PORTRAIT_HERO_PLATE = { width: 252, height: 64 }

/**
 * A seat on the phone's table, and which way its plate faces the felt: from
 * the left or right edge of the screen, or from the top (the seat opposite
 * the Hero, and the top corners of a big table).
 */
interface PortraitSeat extends Point {
  side: 'left' | 'right' | 'top' | 'hero'
}

/**
 * Where everyone but the Hero sits on a phone, by table size, clockwise from
 * the Hero's left as players act: up the left side, across the top and down
 * the right. Hand-placed, as the boards draw them: a side seat never shares
 * a height with the board, which spans the felt.
 */
const left = (y: number): PortraitSeat => ({ x: 64, y, side: 'left' })
const right = (y: number): PortraitSeat => ({ x: 326, y, side: 'right' })
const top = (x: number): PortraitSeat => ({ x, y: 64, side: 'top' })
const SHORT_SEATS: Record<number, PortraitSeat[]> = {
  2: [top(195)],
  3: [left(170), right(170)],
  4: [left(170), top(195), right(170)],
  5: [left(440), left(170), right(170), right(440)],
  6: [left(440), left(170), top(195), right(170), right(440)],
}
const TALL_SEATS: Record<number, PortraitSeat[]> = {
  7: [left(560), left(330), left(200), right(200), right(330), right(560)],
  8: [left(560), left(330), left(200), top(195), right(200), right(330), right(560)],
  9: [left(560), left(330), left(200), top(64), top(326), right(200), right(330), right(560)],
  10: [left(560), left(330), left(200), top(64), top(195), top(326), right(200), right(330), right(560)],
}

/** The least room between a seat's plate and its own bet or button. */
const BESIDE = 4
/** How far a side seat's bet sits above (left) or below (right) its plate's middle, so facing seats' bets never meet. */
const STAGGER = 20

/** A short drawing (390 × 640) up to 6-max, a tall one (390 × 780) for 7 to 10 seats. */
function portraitShape(slots: number): TableShape {
  const tall = slots > 6
  const height = tall ? 780 : 640
  const centre = { x: 195, y: tall ? 460 : 300 }
  const hero: PortraitSeat = { x: 195, y: height - 64, side: 'hero' }
  const others = (tall ? TALL_SEATS : SHORT_SEATS)[Math.min(Math.max(slots, 2), 10)]
  // The Hero's seat, then everyone else's; slot `slots` is the Hero's again, coming round.
  const seats = [hero, ...others]
  const seatAt = (slot: number) => seats[(((Math.round(slot) % slots) + slots) % slots) % seats.length]
  const plateOf = (seat: PortraitSeat) =>
    seat.side === 'hero'
      ? centred(seat, PORTRAIT_HERO_PLATE.width, PORTRAIT_HERO_PLATE.height)
      : centred(seat, PORTRAIT_PLATE.width, PORTRAIT_PLATE.height)

  return {
    name: 'portrait',
    betsOnFelt: false,
    table: { width: 390, height },
    felt: box(65, 48, 260, height - 128),
    seatCentre(slot, count, reach = 1) {
      const wrapped = ((slot % count) + count) % count
      const below = Math.floor(wrapped)
      const a = seats[below % seats.length]
      const b = seats[(below + 1) % seats.length]
      const t = wrapped - below
      const at = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
      return { x: centre.x + reach * (at.x - centre.x), y: centre.y + reach * (at.y - centre.y) }
    },
    // A side seat's plate reaches from the screen's edge to the felt: what is theirs sits by its inner edge.
    anchor(slot) {
      const seat = seatAt(slot)
      const plate = plateOf(seat)
      if (seat.side === 'left') return { x: plate.right, y: seat.y }
      if (seat.side === 'right') return { x: plate.left, y: seat.y }
      return { x: seat.x, y: seat.side === 'hero' ? plate.top : plate.bottom }
    },
    // The pot above the board, and the board's five cards across the felt's middle.
    middle: [box(130, centre.y - 86, 130, 54), box(85, centre.y - 28, 220, 56)],
    seatBoxes(seat, x, y) {
      if (seat.hero) {
        const plate = centred({ x, y }, PORTRAIT_HERO_PLATE.width, PORTRAIT_HERO_PLATE.height)
        // Their cards are inside the plate, whose turn it is above it.
        return [plate, box(x - 48, plate.top - 19, 96, 14)]
      }
      // Everyone else's cards above the plate. No status line: the plate's border says whose turn it is,
      // and the bet what they did. How the Hand ended goes below, once the bets are gone.
      const plate = centred({ x, y }, PORTRAIT_PLATE.width, PORTRAIT_PLATE.height)
      return [plate, box(x - 26, plate.top - 39, 52, 34)]
    },
    placeBet(slot, height) {
      const seat = seatAt(slot)
      const plate = plateOf(seat)
      if (seat.side === 'left') return { x: plate.right + BESIDE + BET.width / 2, y: seat.y - STAGGER }
      if (seat.side === 'right') return { x: plate.left - BESIDE - BET.width / 2, y: seat.y + STAGGER }
      // Above the Hero's status; below anyone else's plate.
      if (seat.side === 'hero') return { x: seat.x, y: plate.top - 19 - BESIDE - height / 2 }
      return { x: seat.x, y: plate.bottom + BESIDE + height / 2 }
    },
    placeDealer(slot) {
      const seat = seatAt(slot)
      const plate = plateOf(seat)
      const r = DEALER / 2
      // Beside the plate, on the other side of its bet.
      if (seat.side === 'left') return { x: plate.right + BESIDE + r, y: seat.y + 16 }
      if (seat.side === 'right') return { x: plate.left - BESIDE - r, y: seat.y - 16 }
      if (seat.side === 'hero') return { x: plate.right + BESIDE + r, y: seat.y }
      // Over a top seat's plate, at its outer corner beside the cards: under it go the bet, then how the Hand ended.
      const outer = seat.x > 195 ? plate.right - r : plate.left + r
      return { x: outer, y: plate.top - BESIDE - r }
    },
  }
}

const portraits = new Map<number, TableShape>()

/** The phone's drawing of a table with `slots` seats. */
export function portrait(slots: number): TableShape {
  let shape = portraits.get(slots)
  if (!shape) {
    shape = portraitShape(slots)
    portraits.set(slots, shape)
  }
  return shape
}

/* ---------- Either table ---------- */

/** The landscape drawing's size and felt, which most of the app still means by "the table". */
export const TABLE = LANDSCAPE.table
export const FELT = { left: LANDSCAPE.felt.left, top: LANDSCAPE.felt.top, width: 600, height: 300 }

/** Slot 0 is the bottom centre; slots go clockwise, as players act. */
export function seatCentre(slot: number, slots: number, reach = 1, shape: TableShape = LANDSCAPE): Point {
  return shape.seatCentre(slot, slots, reach)
}

/** A point as the CSS position of something centred on it. */
export function asPercent({ x, y }: Point, shape: TableShape = LANDSCAPE): { left: string; top: string } {
  return { left: `${(x / shape.table.width) * 100}%`, top: `${(y / shape.table.height) * 100}%` }
}

export function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right + CLEARANCE && b.left < a.right + CLEARANCE && a.top < b.bottom + CLEARANCE && b.top < a.bottom + CLEARANCE
  )
}

/** Whether `b` lies on the felt, `FELT_MARGIN` clear of its edge. The felt is convex, so its corners settle it. */
export function insideFelt(b: Box, shape: TableShape = LANDSCAPE): boolean {
  const { felt } = shape
  const width = felt.right - felt.left
  const height = felt.bottom - felt.top
  const radius = Math.min(width, height) / 2 - FELT_MARGIN
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)
  const onFelt = (x: number, y: number) => {
    // The nearest point on the line its two round ends are centred on.
    const cx = width >= height ? clamp(x, felt.left + height / 2, felt.right - height / 2) : (felt.left + felt.right) / 2
    const cy = width >= height ? (felt.top + felt.bottom) / 2 : clamp(y, felt.top + width / 2, felt.bottom - width / 2)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
  }
  return onFelt(b.left, b.top) && onFelt(b.right, b.top) && onFelt(b.left, b.bottom) && onFelt(b.right, b.bottom)
}

/** The board and pot, and every seat's plate, cards and status: what neither a bet nor the button may cover. */
export function fixedPieces(slots: number, seats: SeatPlace[], shape: TableShape = LANDSCAPE): Box[] {
  const found = [...shape.middle]
  for (const seat of seats) {
    const { x, y } = shape.seatCentre(seat.slot, slots)
    found.push(...shape.seatBoxes(seat, x, y))
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
  shape: TableShape,
): Point | null {
  const { felt } = shape
  const own = shape.anchor(slot, slots)
  const others = seats.filter((seat) => seat.slot !== slot).map((seat) => shape.anchor(seat.slot, slots))
  let best: { point: Point; distance: number } | null = null
  for (let x = felt.left + width / 2; x <= felt.right - width / 2; x += STEP) {
    for (let y = felt.top + height / 2; y <= felt.bottom - height / 2; y += STEP) {
      const distance = (x - ideal.x) ** 2 + (y - ideal.y) ** 2
      if (best && distance >= best.distance) continue
      const spot = centred({ x, y }, width, height)
      if (!insideFelt(spot, shape) || taken.some((other) => overlaps(spot, other))) continue
      const mine = (x - own.x) ** 2 + (y - own.y) ** 2
      if (others.some((other) => (x - other.x) ** 2 + (y - other.y) ** 2 <= mine)) continue
      best = { point: { x, y }, distance }
    }
  }
  return best?.point ?? null
}

/** Where the dealer button is centred: on the felt, as close to its seat as it fits. Null when nobody has it. */
export function dealerCentre(slots: number, seats: SeatPlace[], shape: TableShape = LANDSCAPE): Point | null {
  const dealer = seats.find((seat) => seat.dealer)
  if (!dealer) return null
  if (shape.placeDealer) return shape.placeDealer(dealer.slot)
  // Beside the seat rather than in front of it, which is where its bet goes.
  const beside = shape.seatCentre(dealer.slot + 0.3, slots, 0.8)
  return (
    freeSpot(beside, DEALER, DEALER, fixedPieces(slots, seats, shape), dealer.slot, slots, seats, shape) ??
    shape.seatCentre(dealer.slot, slots, 0.7)
  )
}

/** What a bet must not cover: the board and pot, and every seat's plate, cards, status and dealer button. */
export function obstacles(slots: number, seats: SeatPlace[], shape: TableShape = LANDSCAPE): Box[] {
  const found = fixedPieces(slots, seats, shape)
  const dealer = dealerCentre(slots, seats, shape)
  if (dealer) found.push(centred(dealer, DEALER, DEALER))
  return found
}

/**
 * Where each seat's bet is centred, by slot: the free spot on the felt
 * nearest its ideal place between the seat and the middle, nearer its own
 * seat than any other so it reads as theirs, and covering nothing else.
 * Seats are placed in slot order.
 */
export function betCentres(
  slots: number,
  seats: SeatPlace[],
  height = BET.height,
  shape: TableShape = LANDSCAPE,
): Map<number, Point> {
  const taken = obstacles(slots, seats, shape)
  const centres = new Map<number, Point>()
  for (const { slot } of [...seats].sort((a, b) => a.slot - b.slot)) {
    if (shape.placeBet) {
      centres.set(slot, shape.placeBet(slot, height))
      continue
    }
    const ideal = shape.seatCentre(slot, slots, BET_REACH)
    // A table with no room at all keeps the ideal place rather than losing the bet.
    const point = freeSpot(ideal, BET.width, height, taken, slot, slots, seats, shape) ?? ideal
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
  shape: TableShape = LANDSCAPE,
): { bets: Map<number, Point>; dealer: Point | null } {
  const key = `${shape.name}:${shape.table.height}:${slots}:${height}:${seats.map((s) => `${s.slot}${s.hero ? 'h' : ''}${s.dealer ? 'd' : ''}`).join(',')}`
  let places = cache.get(key)
  if (!places) {
    places = { bets: betCentres(slots, seats, height, shape), dealer: dealerCentre(slots, seats, shape) }
    cache.set(key, places)
  }
  return places
}
