import type { Translator } from '../i18n/translator'
import type { QueueEntry } from './roomClient'

/*
 * What a Queue row reads, derived from the entry the server sends. Pure: the
 * row component only renders these strings.
 */

/** The Positions involved, against each other: "BTN vs CO". */
export function positionsLabel(entry: QueueEntry): string {
  return entry.summary.positions.join(' vs ')
}

/** The Final Street badge; a Hand that went to Showdown says so instead. */
export function streetLabel(entry: QueueEntry, { t }: Translator): string {
  return entry.summary.showdown
    ? t('room.queue.street.showdown')
    : t(`room.queue.street.${entry.summary.finalStreet}`)
}

const LIMIT_PREFIX = { 'no-limit': 'NL', 'pot-limit': 'PL', 'fixed-limit': 'FL' } as const

/** The game named by its big blind, the online-poker way: "NL10". */
export function stakeLabel(entry: QueueEntry): string {
  return `${LIMIT_PREFIX[entry.stake.limit]}${entry.stake.bigBlind}`
}

/** The final pot in big blinds, in the UI language: "Bote 10,5 BB". */
export function potLabel(entry: QueueEntry, { t, formatNumber }: Translator): string {
  const bigBlinds = entry.summary.finalPot / entry.stake.bigBlind
  return t('room.queue.pot', { value: formatNumber(bigBlinds, { maximumFractionDigits: 2 }) })
}

/** When the Hand was played, date and time in the UI language: "18 sept · 12:34". */
export function playedAtLabel(entry: QueueEntry, { formatDate, formatTime }: Translator, timeZone?: string): string {
  const at = new Date(entry.playedAt)
  const date = formatDate(at, { day: 'numeric', month: 'short', timeZone })
  const time = formatTime(at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
  return `${date} · ${time}`
}
