import type { Locale } from '../i18n'

/**
 * How one person reads the table, kept by the server with their identity.
 * Personal: nobody else in the Room sees it. Mirrors the server's shape.
 */
export interface Preferences {
  deckStyle: DeckStyle
  /** The classic deck in four colours; the full-suit deck always has them. */
  fourColour: boolean
  /** A bet's share of the pot, next to its chips. */
  potPercentage: boolean
  displayUnit: DisplayUnit
  theme: Theme
  language: Locale
}

export type DeckStyle = 'classic' | 'full-suit'

/** Big blinds, the Hand History's own Amounts, or big blinds with the Amount beside them. */
export type DisplayUnit = 'big-blinds' | 'amount' | 'both'

export type Theme = 'dark' | 'light' | 'system'

/** Same defaults as the server's: what a first visit, and anything outside a session, reads. */
export const DEFAULT_PREFERENCES: Preferences = {
  deckStyle: 'classic',
  fourColour: true,
  potPercentage: true,
  displayUnit: 'big-blinds',
  theme: 'dark',
  language: 'es',
}
