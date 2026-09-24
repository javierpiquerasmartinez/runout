import type { MessageKey } from '../i18n'
import type { Translator } from '../i18n/translator'
import type { Preferences } from '../preferences/preferences'
import type { Action, HandWithTimeline, MadeHand, PlayerState, Position, Rank, Street, TableState } from './hand'
import { quantity, type Quantity } from './quantity'
import { streetProgress, type StreetProgress } from './streetProgress'

/*
 * What the table draws at one point of Playback, derived from the Hand's
 * Timeline. Pure: the table components only render these values.
 */

export interface SeatView {
  screenName: string
  /** What the seat is labelled: its Screen Name, or its Position under Hide Opponent Names. */
  name: string
  /** Hide Opponent Names has put the seat's Position where its Screen Name would go. */
  nameHidden: boolean
  position: Position
  /** Where the seat sits: 0 is the bottom centre (the Hero), then clockwise. */
  slot: number
  /** The Stack in the Display Unit: "113,1 BB". */
  stack: string
  /** The Stack as an Amount beside `stack`, when both units are shown: "11,31 €". */
  stackSecondary: string | null
  /** The chips in front of the player on this Street: a bet or an all-in. A check puts none. */
  chip: ChipView | null
  /** What they last did on this Street, next to them: "APUESTA", "PASA"… */
  move: string | null
  /** "all-in 62 BB", everything they put in, while they have nothing left behind. */
  allInLabel: string | null
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
  /** What the Hand left them with, net of what they put in: "+152 BB". Winners only. */
  netResult: string | null
}

export interface ChipView {
  kind: 'bet' | 'all-in'
  label: string
  /** The Amount beside `label`, when both units are shown. */
  secondary: string | null
  /**
   * A bet or raise as a share of the pot it went into: "33% bote". Not for
   * calls, blinds or all-ins, nor for a reader who turned it off.
   */
  potShare: string | null
}

export interface PotView {
  label: string
  amount: string
  /** The Amount beside `amount`, when both units are shown. */
  secondary: string | null
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
  pots: {
    label: string
    /** What the winners took from it, after rake. */
    amount: string
    /** "Marta gana 186 BB", one per winner. */
    winners: string[]
  }[]
  /** "Rake 6 BB", if the room kept any. */
  rake: string | null
}

export interface TableView {
  /** How many seats the table has, taken or not. */
  slots: number
  seats: SeatView[]
  /** Five slots: the cards dealt so far, then null for the ones to come. */
  board: (string | null)[]
  /** Everything in the middle, bets in play included. */
  pot: string
  /** The pot as an Amount beside `pot`, when both units are shown. */
  potSecondary: string | null
  /** "19,5 BB + 6,5 BB en juego" when some of the pot is still in play on this Street. */
  potDetail: string | null
  /** The main pot and each side pot, once there are side pots. */
  sidePots: PotView[] | null
  street: Street
  /** The step of the Timeline Playback is on, 0 at the Initial State: what to step from. */
  actionIndex: number
  /** How many of the Hand's Actions have been played; Streets dealt and the end don't count. */
  actionNumber: number
  /** The Hand's Actions; blinds and antes don't count. */
  actionCount: number
  canGoBack: boolean
  canGoForward: boolean
  /** Where Playback is, Street by Street, and where the Street jumps go. */
  streets: StreetProgress
  /** What led here: "Flop · Marta apuesta 6,5 BB", a Street dealt, the end of the Hand, or that the blinds are posted. */
  lastAction: string
  /** The latest Actions on this Street, or how the Hand ended. */
  log: LogView
  /** The cards that make each winning hand, hole cards and board, to outline. */
  winningCards: string[]
  /** How each pot was shared out, once the Hand is over. */
  payout: PayoutView | null
}

/** How the Room wants players named: the Playback switch, and whose Screen Names are its own. */
export interface SeatNaming {
  hideOpponentNames: boolean
  /** Every Screen Name of every Participant of the Room. */
  participantScreenNames: string[]
}

const NAMES_SHOWN: SeatNaming = { hideOpponentNames: false, participantScreenNames: [] }

const LOG_LENGTH = 6

/** The personal preferences the table is drawn with. */
export type TablePreferences = Pick<Preferences, 'displayUnit' | 'potPercentage'>

const DEFAULT_TABLE_PREFERENCES: TablePreferences = { displayUnit: 'big-blinds', potPercentage: true }

/**
 * Every quantity is in the reader's Display Unit. With both units the figures
 * standing on their own carry the Amount as well, beside the big blinds;
 * sentences (the log, the last Action, outcomes) keep to big blinds alone.
 */
export function tableView(
  hand: HandWithTimeline,
  actionIndex: number,
  i18n: Translator,
  naming: SeatNaming = NAMES_SHOWN,
  preferences: TablePreferences = DEFAULT_TABLE_PREFERENCES,
): TableView {
  const { t } = i18n
  const { seats, states, hero, buttonSeat } = hand.timeline
  const { nameOf, isHidden } = playerNames(hand, naming)
  const last = states.length - 1
  const index = Math.min(Math.max(actionIndex, 0), last)
  const state = states[index]
  const measure = (amount: number, options?: Intl.NumberFormatOptions) =>
    quantity(amount, hand.stake, preferences.displayUnit, i18n, options)
  const inUnit: InUnit = (amount, options) => measure(amount, options).primary
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
  const pot = measure(state.pot)

  return {
    slots,
    seats: seats
      .map((seat) => {
        const player = state.players.find((p) => p.screenName === seat.screenName)
        const isHero = seat.screenName === hero.screenName
        const stack = measure(player?.stack ?? seat.startingStack)
        const shown = revealed.get(seat.screenName)
        const won = winnings.get(seat.screenName)
        const outcome = [
          shown && madeHandLabel(shown.madeHand, i18n),
          won !== undefined && t('room.table.wins', { amount: inUnit(won) }),
        ].filter((part) => typeof part === 'string')
        return {
          screenName: seat.screenName,
          name: nameOf(seat.screenName),
          nameHidden: isHidden(seat.screenName),
          position: seat.position,
          slot: (seat.seat - heroSeat + slots) % slots,
          stack: stack.primary,
          stackSecondary: stack.secondary,
          chip: player && !result ? chipOf(player, states, index, measure, preferences.potPercentage, i18n) : null,
          move: result ? null : moveOf(seat.screenName, states, index, i18n),
          allInLabel:
            player?.allIn && won === undefined ? t('room.table.allIn', { amount: inUnit(player.committed) }) : null,
          folded: player?.folded ?? false,
          toAct: state.toAct === seat.screenName,
          dealer: seat.seat === buttonSeat,
          hero: isHero,
          cards: isHero ? hero.cards : (shown?.cards ?? null),
          revealed: !isHero && shown !== undefined,
          winner: won !== undefined,
          outcome: outcome.length > 0 ? outcome.join(' · ') : null,
          netResult:
            won !== undefined && player
              ? inUnit(won - player.committed, { signDisplay: 'always' })
              : null,
        }
      })
      .sort((a, b) => a.slot - b.slot),
    board: Array.from({ length: 5 }, (_, i) => state.board[i] ?? null),
    pot: pot.primary,
    potSecondary: pot.secondary,
    potDetail:
      gathered > 0 && inPlay > 0
        ? t('room.table.potInPlay', { gathered: inUnit(gathered), inPlay: inUnit(inPlay) })
        : null,
    sidePots:
      state.pots.length > 1
        ? state.pots.map((side, i) => {
            const { primary, secondary } = measure(side.amount)
            return {
              label: potName(i, state.pots.length, TABLE_POT_NAMES, i18n),
              amount: primary,
              secondary,
              contestants:
                side.contestants.length <= 2
                  ? side.contestants.map(nameOf).join(t('room.versus'))
                  : t('room.table.contestants', { count: side.contestants.length }),
            }
          })
        : null,
    street: state.street,
    actionIndex: index,
    actionNumber: states.slice(1, index + 1).filter((s) => s.action).length,
    actionCount: states.filter((s) => s.action).length,
    canGoBack: index > 0,
    canGoForward: index < last,
    streets: streetProgress(hand.timeline, index),
    lastAction: lastActionOf(hand, index, nameOf, inUnit, i18n),
    log: logOf(hand, index, winnings, nameOf, inUnit, i18n),
    winningCards: [
      ...new Set(
        (result?.revealed ?? []).filter((r) => winnings.has(r.screenName)).flatMap((r) => r.madeHand.cards),
      ),
    ],
    payout: result
      ? {
          pots: result.pots.map((pot, i) => ({
            label: potName(i, result.pots.length, PAYOUT_POT_NAMES, i18n),
            amount: inUnit(pot.winners.reduce((sum, winner) => sum + winner.amount, 0)),
            winners: pot.winners.map(({ screenName, amount }) =>
              t('room.log.wins', { name: nameOf(screenName), amount: inUnit(amount) }),
            ),
          })),
          rake: result.rake > 0 ? t('room.payout.rake', { amount: inUnit(result.rake) }) : null,
        }
      : null,
  }
}

/** A quantity in the Display Unit, for a sentence: its primary figure alone. */
type InUnit = (amount: number, options?: Intl.NumberFormatOptions) => string
type Measure = (amount: number, options?: Intl.NumberFormatOptions) => Quantity

/** What the table calls a player: their Screen Name, or their Position when it is to be hidden. */
type NameOf = (screenName: string) => string

/**
 * Under Hide Opponent Names, a player whose Screen Name belongs to no
 * Participant of the Room is called by their Position. Screen Names match
 * whatever their case, as they do when a Hand's Author is found.
 */
function playerNames(
  hand: HandWithTimeline,
  { hideOpponentNames, participantScreenNames }: SeatNaming,
): { nameOf: NameOf; isHidden: (screenName: string) => boolean } {
  const own = new Set(participantScreenNames.map((name) => name.toLowerCase()))
  const positions = new Map(hand.timeline.seats.map((seat) => [seat.screenName, seat.position]))
  const isHidden = (screenName: string) =>
    hideOpponentNames && !own.has(screenName.toLowerCase()) && positions.has(screenName)
  return { nameOf: (screenName) => (isHidden(screenName) ? positions.get(screenName)! : screenName), isHidden }
}

interface PotNames {
  /** The only pot, when there are no side pots. */
  only: MessageKey
  main: MessageKey
  /** The one side pot. */
  side: MessageKey
  /** One of several side pots, with its number. */
  numbered: MessageKey
}

const TABLE_POT_NAMES: PotNames = {
  only: 'room.table.pot',
  main: 'room.table.mainPot',
  side: 'room.table.sidePot',
  numbered: 'room.table.sidePotNumbered',
}

const PAYOUT_POT_NAMES: PotNames = {
  only: 'room.payout.pot',
  main: 'room.payout.main',
  side: 'room.payout.side',
  numbered: 'room.payout.sideNumbered',
}

/** A pot's name among `count`: the pot, the main pot, the side pot, or side pot n. */
function potName(index: number, count: number, names: PotNames, { t }: Translator): string {
  if (count === 1) return t(names.only)
  if (index === 0) return t(names.main)
  return count === 2 ? t(names.side) : t(names.numbered, { n: index })
}

/** The indices of the states reached by this Street's Actions, up to `index`, in order. */
function streetActions(states: TableState[], index: number): number[] {
  const street = states[index].street
  const found: number[] = []
  for (let i = index; i > 0 && states[i].action?.street === street; i--) found.unshift(i)
  return found
}

/** What led to this step, for the line under the Action counter. */
function lastActionOf(
  hand: HandWithTimeline,
  index: number,
  nameOf: NameOf,
  inUnit: InUnit,
  i18n: Translator,
): string {
  const { t } = i18n
  const state = hand.timeline.states[index]
  const street = t(`room.playback.street.${state.street}`)
  if (state.action) {
    return `${t(`room.playback.street.${state.action.street}`)} · ${actionLabel(state.action, nameOf, inUnit, i18n)}`
  }
  if (state.result) {
    return `${hand.timeline.showdown ? t('room.playback.showdown') : street} · ${t('room.playback.handOver')}`
  }
  return index === 0 ? t('room.playback.blindsPosted') : `${street} · ${t('room.playback.dealt')}`
}

/** A player's latest move on this Street, as a word next to them; folds say so already. */
function moveOf(screenName: string, states: TableState[], index: number, { t }: Translator): string | null {
  const latest = streetActions(states, index).findLast((i) => states[i].action?.screenName === screenName)
  const move = latest === undefined ? null : states[latest].action
  if (!move || move.type === 'fold') return null
  return move.allIn ? t('room.table.move.all-in') : t(`room.table.move.${move.type}`)
}

/** The chips in front of a player: their bet on this Street, sized against the pot it went into. */
function chipOf(
  player: PlayerState,
  states: TableState[],
  index: number,
  measure: Measure,
  potPercentage: boolean,
  { t, formatNumber }: Translator,
): ChipView | null {
  const latest = streetActions(states, index).findLast((i) => states[i].action?.screenName === player.screenName)
  const move = latest === undefined ? null : states[latest].action

  if (player.bet === 0) return null
  const { primary, secondary } = measure(player.bet)
  if (player.allIn) {
    return { kind: 'all-in', label: t('room.table.allIn', { amount: primary }), secondary, potShare: null }
  }
  if (!potPercentage || latest === undefined || (move?.type !== 'bet' && move?.type !== 'raise')) {
    // Calls follow someone else's sizing; blinds and straddles are posted.
    return { kind: 'bet', label: primary, secondary, potShare: null }
  }
  // The pot the player faced, their own chips on this Street left out.
  const before = states[latest - 1]
  const own = before.players.find((p) => p.screenName === player.screenName)?.bet ?? 0
  const faced = before.pot - own
  return {
    kind: 'bet',
    label: primary,
    secondary,
    potShare: t('room.table.potShare', {
      percent: formatNumber((player.bet / faced) * 100, { maximumFractionDigits: 0 }),
    }),
  }
}

function logOf(
  hand: HandWithTimeline,
  index: number,
  winnings: Map<string, number>,
  nameOf: NameOf,
  inUnit: InUnit,
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
      entries.push({ text: t('room.log.shows', { name: nameOf(screenName), cards: cards.map(cardText).join('') }), tone: 'past' })
    }
  } else {
    for (const i of streetActions(states, index).slice(-LOG_LENGTH)) {
      entries.push({ text: actionLabel(states[i].action!, nameOf, inUnit, i18n), tone: i === index ? 'latest' : 'past' })
    }
  }
  if (state.toAct) entries.push({ text: t('room.log.pending', { name: nameOf(state.toAct) }), tone: 'pending' })
  for (const [screenName, amount] of winnings) {
    entries.push({ text: t('room.log.wins', { name: nameOf(screenName), amount: inUnit(amount) }), tone: 'winner' })
  }

  let aside: string | null = null
  if (result) {
    const [main, ...sides] = result.pots.map((pot) => inUnit(pot.amount))
    aside =
      sides.length === 0
        ? t('room.log.pot', { amount: inUnit(state.pot) })
        : sides.length === 1
          ? t('room.log.potWithSide', { main, side: sides[0] })
          : t('room.log.potWithSides', { main, sides: sides.join(' + ') })
  } else if (state.effectiveStack !== null) {
    const stack = inUnit(state.effectiveStack)
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

type Suit = 's' | 'h' | 'd' | 'c'

const LOW_TO_HIGH: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

/** A made hand in the UI language, from the category and ranks the server's evaluator gives. */
function madeHandLabel({ category, ranks, cards }: MadeHand, { t }: Translator): string {
  const [rank, second] = ranks
  const one = (r: Rank) => t(`room.rank.one.${r}`)
  const many = (r: Rank) => t(`room.rank.many.${r}`)
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

function actionLabel(action: Action, nameOf: NameOf, inUnit: InUnit, { t }: Translator): string {
  const name = nameOf(action.screenName)
  switch (action.type) {
    case 'fold':
    case 'check':
      return t(`room.playback.action.${action.type}`, { name })
    case 'call':
    case 'bet':
      return t(`room.playback.action.${action.type}`, { name, amount: inUnit(action.amount) })
    case 'raise':
      return t('room.playback.action.raise', { name, amount: inUnit(action.to) })
  }
}
