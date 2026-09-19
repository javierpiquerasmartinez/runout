import { api } from '../backend/api'

/*
 * A Hand with its Timeline, as the server's `GET /hands/:id` sends it. The
 * server computes everything; the web only indexes into it by Action. Shapes
 * mirror the server's (ADR 0001: no shared code).
 */

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type Position = 'UTG' | 'UTG+1' | 'MP' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB'

export type Action = { street: Street; screenName: string; allIn: boolean } & (
  | { type: 'fold' | 'check' }
  | { type: 'call' | 'bet'; amount: number }
  | { type: 'raise'; amount: number; to: number }
)

export type HandCategory =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'

/** A made hand from the server's evaluator; the web only localises it. */
export interface MadeHand {
  category: HandCategory
  /** The ranks that name the hand, most significant first ("10" for tens). */
  ranks: string[]
  /** The cards that make it, kickers left out. */
  cards: string[]
}

export interface Pot {
  amount: number
  /** Who can win it, in seat order. */
  contestants: string[]
}

export interface PlayerState {
  screenName: string
  stack: number
  /** What the player has put in on this Street. */
  bet: number
  folded: boolean
  allIn: boolean
  /** Everything put in the pot so far, net of bets returned. */
  committed: number
}

export interface TableState {
  street: Street
  board: string[]
  /** Everything in the middle, bets on this Street included. Amounts are integers in hundredths of the Hand's currency. */
  pot: number
  /** What has been gathered from earlier Streets: the main pot, then each side pot. */
  pots: Pot[]
  toAct: string | null
  players: PlayerState[]
  action: Action | null
  /** Read as this Street began; null with fewer than two players left. */
  effectiveStack: number | null
  /** Read as this Street began; null preflop. */
  spr: number | null
  /** How the Hand ended, on its last state only. */
  result: HandResult | null
}

export interface HandResult {
  /** Cards face up at Showdown: whoever showed, and the Hero if they got there. */
  revealed: { screenName: string; cards: string[]; madeHand: MadeHand }[]
  pots: (Pot & { winners: { screenName: string; amount: number }[] })[]
}

export interface HandWithTimeline {
  id: string
  stake: { limit: 'no-limit' | 'pot-limit' | 'fixed-limit'; smallBlind: number; bigBlind: number; currency: string }
  tableSize: number
  timeline: {
    seats: { seat: number; screenName: string; position: Position; startingStack: number }[]
    buttonSeat: number
    hero: { screenName: string; cards: string[] }
    /** `states[0]` is the Initial State; `states[n]` is the table after Action n. */
    states: TableState[]
    /** Whether the Hand reached Showdown after its last Action. */
    showdown: boolean
  }
}

/** A Hand's content never changes, so each one is fetched once per page. */
const cache = new Map<string, Promise<HandWithTimeline>>()

export function fetchHand(id: string, token: string): Promise<HandWithTimeline> {
  let hand = cache.get(id)
  if (!hand) {
    hand = api<HandWithTimeline>(`/hands/${encodeURIComponent(id)}`, { token })
    // A failed fetch is not remembered, so the next attempt goes to the server.
    hand.catch(() => cache.delete(id))
    cache.set(id, hand)
  }
  return hand
}
