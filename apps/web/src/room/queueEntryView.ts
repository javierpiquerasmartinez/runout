import type { Translator } from '../i18n/translator'
import type { QueueEntry } from './roomClient'

/*
 * What a Queue row reads, derived from the entry the server sends. Pure: the
 * row component only renders these strings. The import dialog's preview
 * reads a Hand the same way.
 */

/** The parts of a Queue Entry these labels read. */
type Described = Pick<QueueEntry, 'playedAt' | 'stake' | 'summary'>

/** The Positions involved, against each other: "BTN vs CO". */
export function positionsLabel(entry: Described, { t }: Translator): string {
  return entry.summary.positions.join(t('room.versus'))
}

/** The Final Street badge; a Hand that went to Showdown says so instead. */
export function streetLabel(entry: Described, { t }: Translator): string {
  return entry.summary.showdown
    ? t('room.queue.street.showdown')
    : t(`room.queue.street.${entry.summary.finalStreet}`)
}

const LIMIT_PREFIX = { 'no-limit': 'NL', 'pot-limit': 'PL', 'fixed-limit': 'FL' } as const

/** The game named by its big blind, the online-poker way: "NL10". */
export function stakeLabel(entry: Described): string {
  return `${LIMIT_PREFIX[entry.stake.limit]}${entry.stake.bigBlind}`
}

/** The Poker Site's display name: "PokerStars". */
export function siteLabel(entry: Pick<QueueEntry, 'site'>, { t }: Translator): string {
  return t(`pokerSite.${entry.site}`)
}

/** The final pot in big blinds, in the UI language: "Bote 10,5 BB". */
export function potLabel(entry: Described, { t, formatNumber }: Translator): string {
  const bigBlinds = entry.summary.finalPot / entry.stake.bigBlind
  return t('room.queue.pot', { value: formatNumber(bigBlinds, { maximumFractionDigits: 2 }) })
}

/** When the Hand was played, date and time in the UI language: "18 sept · 12:34". */
export function playedAtLabel(entry: Described, { formatDate, formatTime }: Translator, timeZone?: string): string {
  const at = new Date(entry.playedAt)
  const date = formatDate(at, { day: 'numeric', month: 'short', timeZone })
  const time = formatTime(at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
  return `${date} · ${time}`
}

/**
 * "Misma mano que Marta": the same real-world hand is in the Queue from other
 * Heroes' seats, named by those Hands' Authors. Null when it isn't.
 */
export function sameHandLabel(entry: QueueEntry, queue: QueueEntry[], { t, formatList }: Translator): string | null {
  const others = queue.filter(
    (other) => other.id !== entry.id && other.site === entry.site && other.siteHandId === entry.siteHandId,
  )
  if (others.length === 0) return null
  return t('room.queue.sameHand', { names: formatList(others.map((other) => other.author.displayName)) })
}

/** How many Hands in the Queue a Participant is Author of. */
export function authoredCount(queue: QueueEntry[], identityId: string): number {
  return queue.filter((entry) => entry.author.identityId === identityId).length
}
