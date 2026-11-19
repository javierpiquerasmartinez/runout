import type { MessageKey } from '../i18n/catalogue'

/*
 * The catalogue of Stats, and the Hero's Stats over the Hands a Library
 * filter keeps, as the server's `GET /library/stats` sends them (ADR 0001:
 * no shared code).
 */

/** The bands of the Stats view, top to bottom. */
export const STAT_BANDS = ['preflop', 'postflop', 'showdown'] as const
export type StatBand = (typeof STAT_BANDS)[number]

/** The columns of the Postflop band, left to right. */
export const STAT_STREETS = ['flop', 'turn', 'river'] as const
export type StatStreet = (typeof STAT_STREETS)[number]

/**
 * One Stat of the catalogue. A postflop Stat belongs to a Street, whose
 * column holds it; every other Stat belongs to a band alone.
 */
type StatEntry<Key extends string = string> = {
  key: Key
  /** As players write it, the same in every language, leaving out the Street a column heading already says. */
  short: string
  /** Whether a person who hasn't chosen their Stats sees it. */
  shownByDefault: boolean
} & ({ band: 'preflop' | 'showdown'; street?: never } | { band: 'postflop'; street: StatStreet })

/**
 * Every Stat, in the catalogue's order: the order the Stats view, its
 * Street columns and the Stat criterion show them in. A Stat's full name,
 * translated, is the message `library.stats.name.<key>`.
 *
 * Adding a Stat is adding its entry here, in its place, with its full name in
 * every language (`library.stats.name.<key>`); the view, the Stat criterion
 * and the address of a filter take it from here.
 */
export const STAT_CATALOGUE = [
  { key: 'vpip', band: 'preflop', short: 'VPIP', shownByDefault: true },
  { key: 'pfr', band: 'preflop', short: 'PFR', shownByDefault: true },
  { key: 'steal', band: 'preflop', short: 'ATS', shownByDefault: true },
  { key: 'three-bet', band: 'preflop', short: '3-bet', shownByDefault: true },
  { key: 'fold-to-three-bet', band: 'preflop', short: 'Fold to 3-bet', shownByDefault: true },
  { key: 'squeeze', band: 'preflop', short: 'Squeeze', shownByDefault: true },
  { key: 'cold-call', band: 'preflop', short: 'Cold Call', shownByDefault: true },
  { key: 'four-bet', band: 'preflop', short: '4-bet', shownByDefault: true },
  { key: 'fold-to-four-bet', band: 'preflop', short: 'Fold to 4-bet', shownByDefault: true },
  { key: 'fold-bb-to-steal', band: 'preflop', short: 'Fold BB to Steal', shownByDefault: true },

  { key: 'cbet-flop', band: 'postflop', street: 'flop', short: 'C-bet', shownByDefault: true },
  { key: 'fold-to-cbet-flop', band: 'postflop', street: 'flop', short: 'Fold to C-bet', shownByDefault: true },
  { key: 'raise-cbet-flop', band: 'postflop', street: 'flop', short: 'Raise C-bet', shownByDefault: false },
  { key: 'check-raise-flop', band: 'postflop', street: 'flop', short: 'Check-raise', shownByDefault: true },
  { key: 'fold-to-check-raise-flop', band: 'postflop', street: 'flop', short: 'Fold to Check-raise', shownByDefault: false },
  { key: 'check-call-flop', band: 'postflop', street: 'flop', short: 'Check-call', shownByDefault: false },
  { key: 'check-fold-flop', band: 'postflop', street: 'flop', short: 'Check-fold', shownByDefault: false },
  { key: 'bet-fold-flop', band: 'postflop', street: 'flop', short: 'Bet-fold', shownByDefault: false },
  /** Counted per Action on the flop, not per Hand, as the total AFq. */
  { key: 'afq-flop', band: 'postflop', street: 'flop', short: 'AFq', shownByDefault: false },

  { key: 'cbet-turn', band: 'postflop', street: 'turn', short: 'C-bet', shownByDefault: true },
  { key: 'fold-to-cbet-turn', band: 'postflop', street: 'turn', short: 'Fold to C-bet', shownByDefault: true },
  { key: 'raise-cbet-turn', band: 'postflop', street: 'turn', short: 'Raise C-bet', shownByDefault: false },
  { key: 'check-raise-turn', band: 'postflop', street: 'turn', short: 'Check-raise', shownByDefault: false },
  { key: 'fold-to-check-raise-turn', band: 'postflop', street: 'turn', short: 'Fold to Check-raise', shownByDefault: false },
  { key: 'check-call-turn', band: 'postflop', street: 'turn', short: 'Check-call', shownByDefault: false },
  { key: 'check-fold-turn', band: 'postflop', street: 'turn', short: 'Check-fold', shownByDefault: false },
  { key: 'bet-fold-turn', band: 'postflop', street: 'turn', short: 'Bet-fold', shownByDefault: false },
  /** Counted per Action on the turn, not per Hand, as the total AFq. */
  { key: 'afq-turn', band: 'postflop', street: 'turn', short: 'AFq', shownByDefault: false },

  { key: 'cbet-river', band: 'postflop', street: 'river', short: 'C-bet', shownByDefault: true },
  { key: 'fold-to-cbet-river', band: 'postflop', street: 'river', short: 'Fold to C-bet', shownByDefault: true },
  { key: 'raise-cbet-river', band: 'postflop', street: 'river', short: 'Raise C-bet', shownByDefault: false },
  { key: 'check-raise-river', band: 'postflop', street: 'river', short: 'Check-raise', shownByDefault: false },
  { key: 'fold-to-check-raise-river', band: 'postflop', street: 'river', short: 'Fold to Check-raise', shownByDefault: false },
  { key: 'check-call-river', band: 'postflop', street: 'river', short: 'Check-call', shownByDefault: false },
  { key: 'check-fold-river', band: 'postflop', street: 'river', short: 'Check-fold', shownByDefault: false },
  { key: 'bet-fold-river', band: 'postflop', street: 'river', short: 'Bet-fold', shownByDefault: false },
  /** Counted per Action on the river, not per Hand, as the total AFq. */
  { key: 'afq-river', band: 'postflop', street: 'river', short: 'AFq', shownByDefault: false },

  { key: 'wwsf', band: 'showdown', short: 'WWSF', shownByDefault: true },
  { key: 'wtsd', band: 'showdown', short: 'WTSD', shownByDefault: true },
  { key: 'wsd', band: 'showdown', short: 'W$SD', shownByDefault: true },
  /** Counted per postflop Action, not per Hand: its opportunities can outnumber the Hands. */
  { key: 'afq', band: 'showdown', short: 'AFq', shownByDefault: true },
] as const satisfies readonly StatEntry[]

export type StatKey = (typeof STAT_CATALOGUE)[number]['key']
export type Stat = StatEntry<StatKey>

/** Every Stat's stable key, in the catalogue's order. */
export const STAT_KEYS: readonly StatKey[] = STAT_CATALOGUE.map((stat) => stat.key)

/**
 * A Stat's full name, with its Street, in the person's language: its
 * tooltip. A Stat added without the message fails to compile here.
 */
export function statName(stat: Stat): MessageKey {
  return `library.stats.name.${stat.key}` as const
}

/** The Streets as players write them, the same in every language. */
const STREET_ABBREVIATION: Record<StatStreet, string> = { flop: 'Flop', turn: 'Turn', river: 'River' }

/** A Stat's abbreviation where no column heading names its Street, as in the Stat criterion: "Turn C-bet". */
export function statLabel(stat: Stat): string {
  return stat.street ? `${STREET_ABBREVIATION[stat.street]} ${stat.short}` : stat.short
}

/** Where no column splits Postflop, as in the Stat criterion's list, each Street is a group of its own. */
export const STAT_SECTIONS = ['preflop', ...STAT_STREETS, 'showdown'] as const
export type StatSection = (typeof STAT_SECTIONS)[number]

export function statSection(stat: Stat): StatSection {
  return stat.street ?? stat.band
}

/** A band's or a Street's heading. */
export function sectionTitle(section: StatSection): MessageKey {
  return section === 'preflop' || section === 'showdown' ? `library.stats.group.${section}` : `library.stats.street.${section}`
}

/** The Stat of a key. */
export function statOf(key: StatKey): Stat {
  return STAT_CATALOGUE.find((stat) => stat.key === key)!
}

/** How many times the Hero had the chance to make a Stat's decision, and how many times they made it. */
export interface StatCount {
  opportunities: number
  taken: number
}

export interface LibraryStats {
  /** How many Hands the Stats cover: as many as the list and the Results Graph count. */
  hands: number
  /** Every Stat, zero opportunities where the Hero never had the chance. */
  stats: Record<StatKey, StatCount>
  /**
   * Every Stat, with how many of those Hands had its opportunity and how many
   * had it taken: what the list holds behind each of the Stat's links. Apart
   * from the counts because AFq counts several Actions per Hand.
   */
  handsWith: Record<StatKey, StatHands>
}

/** How many Hands had a Stat's opportunity, and how many had it taken. */
export interface StatHands {
  opportunity: number
  taken: number
}
