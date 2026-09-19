import type { MessageKey } from '../i18n'
import type { Translator } from '../i18n/translator'
import type { Action, HandWithTimeline, MadeHand, PlayerState, Position, Street, TableState } from './hand'
import { streetProgress, type StreetProgress } from './streetProgress'

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
  /** What sits in front of the player on this Street: a bet, an all-in or a check. */
  chip: ChipView | null
  /** "all-in 62 BB", everything they put in, while they have nothing left behind. */
  allIn: string | null
  folded: boolean
  toAct: boolean
  dealer: boolean
  hero: boolean
  /** The cards to show face up; null draws them face down. */
  cards: string[] | null
  /** Turned face up at Showdown, so they flip as they appear. */
  revealed: boolean
  /** The player took something from a pot. */
  winner: boolean
  /** At the end of the Hand: their made hand, and what they won ("Trío de jotas · gana 214 BB"). */
  outcome: string | null
  /** What the Hand left them with, net: "+152 BB". Winners only. */
  won: string | null
}

export interface ChipView {
  kind: 'bet' | 'all-in' | 'check'
  label: string
  /** The bet as a share of the pot it went into: "33% bote". Not for blinds or all-ins. */
  potShare: string | null
}

export interface PotView {
  label: string
  amount: string
  /** "Marta vs grindr_22", or "3 jugadores" when more contest it. */
  contestants: string
}

export interface LogView {
  /** The Street, or Showdown. */
  label: string
  entries: { text: string; tone: 'past' | 'latest' | 'pending' | 'winner' }[]
  /** SPR and effective stack while the Hand is on; the pots once it is over. */
  aside: string | null
}

export interface PayoutView {
  label: string
  amount: string
  /** "Marta gana 186 BB", one per winner. */
  winners: string[]
}

export interface TableView {
  /** How many seats the table has, taken or not. */
  slots: number
  seats: SeatView[]
  /** Five slots: the cards dealt so far, then null for the ones to come. */
  board: (string | null)[]
  /** Everything in the middle, bets in play included. */
  pot: string
  /** "19,5 BB + 6,5 BB en juego" when some of the pot is still in play on this Street. */
  potDetail: string | null
  /** The main pot and each side pot, once there are side pots. */
  sidePots: PotView[] | null
  street: Street
  /** 0 at the Initial State. */
  actionIndex: number
  /** The Hand's Actions; blinds and antes don't count. */
  actionCount: number
  canGoBack: boolean
  canGoForward: boolean
  /** Where Playback is, Street by Street, and where the Street jumps go. */
  streets: StreetProgress
  /** What led here: "Flop · Marta apuesta 6,5 BB", or that the blinds are posted. */
  lastAction: string
  /** The latest Actions on this Street, or how the Hand ended. */
  log: LogView
  /** The cards that make each winning hand, hole cards and board, to outline. */
  winningCards: string[]
  /** How each pot was shared out, once the Hand is over. */
  payout: PayoutView[] | null
}

const LOG_LENGTH = 6

export function tableView(hand: HandWithTimeline, actionIndex: number, i18n: Translator): TableView {
  const { t } = i18n
  const { seats, states, hero, buttonSeat } = hand.timeline
  const actionCount = states.length - 1
  const index = Math.min(Math.max(actionIndex, 0), actionCount)
  const state = states[index]
  const bigBlinds = (amount: number, options?: Intl.NumberFormatOptions) =>
    bigBlindsLabel(amount, hand.stake.bigBlind, i18n, options)
  const heroSeat = seats.find((seat) => seat.screenName === hero.screenName)?.seat ?? seats[0]?.seat ?? 1
  const slots = Math.max(hand.tableSize, ...seats.map((seat) => seat.seat))
  const result = state.result
  const winnings = new Map<string, number>()
  for (const pot of result?.pots ?? []) {
    for (const { screenName, amount } of pot.winners) {
      winnings.set(screenName, (winnings.get(screenName) ?? 0) + amount)
    }
  }
  const revealed = new Map(result?.revealed.map((r) => [r.screenName, r]))

  const gathered = state.pots.reduce((sum, pot) => sum + pot.amount, 0)
  const inPlay = state.players.reduce((sum, p) => sum + p.bet, 0)

  return {
    slots,
    seats: seats
      .map((seat) => {
        const player = state.players.find((p) => p.screenName === seat.screenName)
        const isHero = seat.screenName === hero.screenName
        const shown = revealed.get(seat.screenName)
        const won = winnings.get(seat.screenName)
        const outcome = [
          shown && madeHandLabel(shown.madeHand, i18n),
          won !== undefined && t('room.table.wins', { amount: bigBlinds(won) }),
        ].filter((part) => typeof part === 'string')
        return {
          screenName: seat.screenName,
          position: seat.position,
          slot: (seat.seat - heroSeat + slots) % slots,
          stack: bigBlinds(player?.stack ?? seat.startingStack),
          chip: player && !result ? chipOf(player, states, index, bigBlinds, i18n) : null,
          allIn:
            player?.allIn && won === undefined ? t('room.table.allIn', { amount: bigBlinds(player.committed) }) : null,
          folded: player?.folded ?? false,
          toAct: state.toAct === seat.screenName,
          dealer: seat.seat === buttonSeat,
          hero: isHero,
          cards: isHero ? hero.cards : (shown?.cards ?? null),
          revealed: !isHero && shown !== undefined,
          winner: won !== undefined,
          outcome: outcome.length > 0 ? outcome.join(' · ') : null,
          won:
            won !== undefined && player
              ? bigBlinds(won - player.committed, { signDisplay: 'always' })
              : null,
        }
      })
      .sort((a, b) => a.slot - b.slot),
    board: Array.from({ length: 5 }, (_, i) => state.board[i] ?? null),
    pot: bigBlinds(state.pot),
    potDetail:
      gathered > 0 && inPlay > 0
        ? t('room.table.potInPlay', { gathered: bigBlinds(gathered), inPlay: bigBlinds(inPlay) })
        : null,
    sidePots:
      state.pots.length > 1
        ? state.pots.map((pot, i) => ({
            label:
              i === 0
                ? t('room.table.mainPot')
                : state.pots.length === 2
                  ? t('room.table.sidePot')
                  : t('room.table.sidePotNumbered', { n: i }),
            amount: bigBlinds(pot.amount),
            contestants:
              pot.contestants.length <= 2
                ? pot.contestants.join(' vs ')
                : t('room.table.contestants', { count: pot.contestants.length }),
          }))
        : null,
    street: state.street,
    actionIndex: index,
    actionCount,
    canGoBack: index > 0,
    canGoForward: index < actionCount,
    streets: streetProgress(hand.timeline, index),
    lastAction: state.action
      ? `${t(`room.playback.street.${state.action.street}`)} · ${actionLabel(state.action, bigBlinds, i18n)}`
      : t('room.playback.blindsPosted'),
    log: logOf(hand, index, winnings, bigBlinds, i18n),
    winningCards: [
      ...new Set(
        (result?.revealed ?? []).filter((r) => winnings.has(r.screenName)).flatMap((r) => r.madeHand.cards),
      ),
    ],
    payout: result
      ? result.pots.map((pot, i) => ({
          label:
            result.pots.length === 1
              ? t('room.payout.pot')
              : i === 0
                ? t('room.payout.main')
                : result.pots.length === 2
                  ? t('room.payout.side')
                  : t('room.payout.sideNumbered', { n: i }),
          amount: bigBlinds(pot.amount),
          winners: pot.winners.map(({ screenName, amount }) =>
            t('room.log.wins', { name: screenName, amount: bigBlinds(amount) }),
          ),
        }))
      : null,
  }
}

type BigBlinds = (amount: number, options?: Intl.NumberFormatOptions) => string

function bigBlindsLabel(
  amount: number,
  bigBlind: number,
  { t, formatNumber }: Translator,
  options?: Intl.NumberFormatOptions,
): string {
  return t('room.table.bigBlinds', {
    value: formatNumber(amount / bigBlind, { maximumFractionDigits: 1, ...options }),
  })
}

/**
 * What sits in front of a player: their bet on this Street, sized against the
 * pot it went into, or a check if that was their last move on it.
 */
function chipOf(
  player: PlayerState,
  states: TableState[],
  index: number,
  bigBlinds: BigBlinds,
  { t, formatNumber }: Translator,
): ChipView | null {
  const street = states[index].street
  // This Street's Actions so far, the latest first.
  const onStreet: number[] = []
  for (let i = index; i > 0 && states[i].action?.street === street; i--) onStreet.push(i)
  const latest = onStreet.find((i) => states[i].action?.screenName === player.screenName)
  const move = latest === undefined ? null : states[latest].action

  if (player.bet === 0) {
    return move?.type === 'check' ? { kind: 'check', label: t('room.table.check'), potShare: null } : null
  }
  const amount = bigBlinds(player.bet)
  if (player.allIn) return { kind: 'all-in', label: t('room.table.allIn', { amount }), potShare: null }
  if (latest === undefined || move?.type === 'fold' || move?.type === 'check') {
    // Blinds and straddles are posted, not sized.
    return { kind: 'bet', label: amount, potShare: null }
  }
  // The pot the player faced, their own chips on this Street left out.
  const before = states[latest - 1]
  const own = before.players.find((p) => p.screenName === player.screenName)?.bet ?? 0
  const faced = before.pot - own
  return {
    kind: 'bet',
    label: amount,
    potShare: t('room.table.potShare', {
      percent: formatNumber((player.bet / faced) * 100, { maximumFractionDigits: 0 }),
    }),
  }
}

function logOf(
  hand: HandWithTimeline,
  index: number,
  winnings: Map<string, number>,
  bigBlinds: BigBlinds,
  i18n: Translator,
): LogView {
  const { t, formatNumber } = i18n
  const { states, showdown, hero } = hand.timeline
  const state = states[index]
  const result = state.result
  const entries: LogView['entries'] = []

  if (result && showdown) {
    for (const { screenName, cards } of result.revealed) {
      if (screenName === hero.screenName) continue
      entries.push({ text: t('room.log.shows', { name: screenName, cards: cards.map(cardText).join('') }), tone: 'past' })
    }
  } else {
    const onStreet: number[] = []
    for (let i = index; i > 0 && states[i].action?.street === state.street; i--) onStreet.unshift(i)
    for (const i of onStreet.slice(-LOG_LENGTH)) {
      entries.push({ text: actionLabel(states[i].action!, bigBlinds, i18n), tone: i === index ? 'latest' : 'past' })
    }
  }
  if (state.toAct) entries.push({ text: t('room.log.pending', { name: state.toAct }), tone: 'pending' })
  for (const [name, amount] of winnings) {
    entries.push({ text: t('room.log.wins', { name, amount: bigBlinds(amount) }), tone: 'winner' })
  }

  let aside: string | null = null
  if (result) {
    const [main, ...sides] = result.pots.map((pot) => bigBlinds(pot.amount))
    aside =
      sides.length === 0
        ? t('room.log.pot', { amount: bigBlinds(state.pot) })
        : sides.length === 1
          ? t('room.log.potWithSide', { main, side: sides[0] })
          : t('room.log.potWithSides', { main, sides: sides.join(' + ') })
  } else if (state.effectiveStack !== null) {
    const stack = bigBlinds(state.effectiveStack)
    aside =
      state.spr === null
        ? t('room.log.effective', { stack })
        : t('room.log.spr', { spr: formatNumber(state.spr, { maximumFractionDigits: 1 }), stack })
  }

  return {
    label: t(result && showdown ? 'room.playback.showdown' : `room.playback.street.${state.street}`),
    entries,
    aside,
  }
}

const SUIT_SYMBOLS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

/** "Js" → "J♠", for text that names cards. */
function cardText(card: string): string {
  return `${card.slice(0, -1)}${SUIT_SYMBOLS[card.slice(-1)]}`
}

type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2'
type Suit = 's' | 'h' | 'd' | 'c'

const LOW_TO_HIGH: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

/** A made hand in the UI language, from the category and ranks the server's evaluator gives. */
function madeHandLabel({ category, ranks, cards }: MadeHand, { t }: Translator): string {
  const [rank, second] = ranks as Rank[]
  const one = (r: Rank) => t(`room.rank.one.${r}` as MessageKey)
  const many = (r: Rank) => t(`room.rank.many.${r}` as MessageKey)
  // A straight's lowest card: four below the top, or the ace of a wheel.
  const low = () => one(LOW_TO_HIGH[LOW_TO_HIGH.lastIndexOf(rank) - 4])
  switch (category) {
    case 'high-card':
      return t('room.hand.high-card', { rank: one(rank) })
    case 'pair':
    case 'three-of-a-kind':
    case 'four-of-a-kind':
      return t(`room.hand.${category}`, { rank: many(rank) })
    case 'two-pair':
    case 'full-house':
      return t(`room.hand.${category}`, { rank: many(rank), second: many(second) })
    case 'straight':
      return t('room.hand.straight', { rank: one(rank), low: low() })
    case 'straight-flush':
      return rank === 'A' ? t('room.hand.royal-flush') : t('room.hand.straight-flush', { rank: one(rank), low: low() })
    case 'flush':
      return t('room.hand.flush', { rank: one(rank), suit: t(`room.card.suit.${cards[0].slice(-1) as Suit}`) })
  }
}

function actionLabel(action: Action, bigBlinds: BigBlinds, { t }: Translator): string {
  const name = action.screenName
  switch (action.type) {
    case 'fold':
    case 'check':
      return t(`room.playback.action.${action.type}`, { name })
    case 'call':
    case 'bet':
      return t(`room.playback.action.${action.type}`, { name, amount: bigBlinds(action.amount) })
    case 'raise':
      return t('room.playback.action.raise', { name, amount: bigBlinds(action.to) })
  }
}
