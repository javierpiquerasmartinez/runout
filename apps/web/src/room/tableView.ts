import type { Translator } from '../i18n/translator'
import type { Action, HandWithTimeline, Position, Street } from './hand'

/*
 * What the table draws at one point of Playback, derived from the Hand's
 * Timeline. Pure: the table components only render these values.
 */

export interface SeatView {
  screenName: string
  position: Position
  /** Where the seat sits: 0 is the bottom centre (the Hero), then clockwise. */
  slot: number
  /** The Stack in big blinds: "113,1 BB". */
  stack: string
  /** What the player has in front of them on this Street, or null. */
  bet: string | null
  folded: boolean
  toAct: boolean
  dealer: boolean
  hero: boolean
  /** The cards to show face up; null draws them face down. */
  cards: string[] | null
}

export interface TableView {
  /** How many seats the table has, taken or not. */
  slots: number
  seats: SeatView[]
  /** Five slots: the cards dealt so far, then null for the ones to come. */
  board: (string | null)[]
  pot: string
  street: Street
  /** 0 at the Initial State. */
  actionIndex: number
  /** The Hand's Actions; blinds and antes don't count. */
  actionCount: number
  canGoBack: boolean
  canGoForward: boolean
  /** What led here: "Flop · Marta apuesta 6,5 BB", or that the blinds are posted. */
  lastAction: string
}

export function tableView(hand: HandWithTimeline, actionIndex: number, i18n: Translator): TableView {
  const { seats, states, hero, buttonSeat } = hand.timeline
  const actionCount = states.length - 1
  const index = Math.min(Math.max(actionIndex, 0), actionCount)
  const state = states[index]
  const bigBlinds = (amount: number) => bigBlindsLabel(amount, hand.stake.bigBlind, i18n)
  const heroSeat = seats.find((seat) => seat.screenName === hero.screenName)?.seat ?? seats[0]?.seat ?? 1
  const slots = Math.max(hand.tableSize, ...seats.map((seat) => seat.seat))

  return {
    slots,
    seats: seats
      .map((seat) => {
        const player = state.players.find((p) => p.screenName === seat.screenName)
        const isHero = seat.screenName === hero.screenName
        return {
          screenName: seat.screenName,
          position: seat.position,
          slot: (seat.seat - heroSeat + slots) % slots,
          stack: bigBlinds(player?.stack ?? seat.startingStack),
          bet: player && player.bet > 0 ? bigBlinds(player.bet) : null,
          folded: player?.folded ?? false,
          toAct: state.toAct === seat.screenName,
          dealer: seat.seat === buttonSeat,
          hero: isHero,
          cards: isHero ? hero.cards : null,
        }
      })
      .sort((a, b) => a.slot - b.slot),
    board: Array.from({ length: 5 }, (_, i) => state.board[i] ?? null),
    pot: bigBlinds(state.pot),
    street: state.street,
    actionIndex: index,
    actionCount,
    canGoBack: index > 0,
    canGoForward: index < actionCount,
    lastAction: state.action
      ? `${i18n.t(`room.player.street.${state.action.street}`)} · ${actionLabel(state.action, bigBlinds, i18n)}`
      : i18n.t('room.player.blindsPosted'),
  }
}

function bigBlindsLabel(amount: number, bigBlind: number, { t, formatNumber }: Translator): string {
  return t('room.table.bigBlinds', { value: formatNumber(amount / bigBlind, { maximumFractionDigits: 1 }) })
}

function actionLabel(action: Action, bigBlinds: (amount: number) => string, { t }: Translator): string {
  const name = action.screenName
  switch (action.type) {
    case 'fold':
    case 'check':
      return t(`room.player.action.${action.type}`, { name })
    case 'call':
    case 'bet':
      return t(`room.player.action.${action.type}`, { name, amount: bigBlinds(action.amount) })
    case 'raise':
      return t('room.player.action.raise', { name, amount: bigBlinds(action.to) })
  }
}
