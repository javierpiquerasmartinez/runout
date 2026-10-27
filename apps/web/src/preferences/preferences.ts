import type { Locale } from '../i18n'

/**
 * How one person reads the table, kept by the server with their identity.
 * Personal: nobody else in the Room sees it. Mirrors the server's shape.
 */
export interface Preferences {
  deckStyle: DeckStyle
  /** The classic deck in four colours; the full-suit deck always has them. */
  fourColour: boolean
  /** A bet's share of the pot, next to the bet. */
  potPercentage: boolean
  displayUnit: DisplayUnit
  theme: Theme
  language: Locale
  /** Graph Colours: each Results Graph line's colour; two lines may share one. */
  resultColour: GraphColour
  allInEvColour: GraphColour
  showdownColour: GraphColour
  nonShowdownColour: GraphColour
}

export type DeckStyle = 'classic' | 'full-suit'

/** Big blinds, the Hand History's own Amounts, or big blinds with the Amount beside them. */
export type DisplayUnit = 'big-blinds' | 'amount' | 'both'

export type Theme = 'dark' | 'light' | 'system'

/** The palette Graph Colours are picked from, as the server names them; the tokens give each a value per Theme. */
export const GRAPH_COLOURS = ['teal', 'amber', 'blue', 'red', 'violet', 'pink', 'lime', 'grey'] as const

export type GraphColour = (typeof GRAPH_COLOURS)[number]

/** The Preference holding each Results Graph line's colour. */
export type GraphColourPreference = 'resultColour' | 'allInEvColour' | 'showdownColour' | 'nonShowdownColour'

/** Each line's colour on the board, until the person picks another. */
export const DEFAULT_GRAPH_COLOURS: Pick<Preferences, GraphColourPreference> = {
  resultColour: 'teal',
  allInEvColour: 'amber',
  showdownColour: 'blue',
  nonShowdownColour: 'red',
}

/** A palette colour as CSS, for the current Theme. */
export function graphColour(colour: GraphColour): string {
  return `var(--graph-${colour})`
}

/** Same defaults as the server's: what a first visit, and anything outside a session, reads. */
export const DEFAULT_PREFERENCES: Preferences = {
  deckStyle: 'classic',
  fourColour: true,
  potPercentage: true,
  displayUnit: 'big-blinds',
  theme: 'dark',
  language: 'es',
  ...DEFAULT_GRAPH_COLOURS,
}
