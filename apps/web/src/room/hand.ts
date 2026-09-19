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

export interface TableState {
  street: Street
  board: string[]
  /** Amounts are integers in hundredths of the Hand's currency. */
  pot: number
  toAct: string | null
  players: { screenName: string; stack: number; bet: number; folded: boolean }[]
  action: Action | null
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
