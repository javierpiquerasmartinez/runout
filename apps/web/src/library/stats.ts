import type { MessageKey } from '../i18n/catalogue'

/*
 * The Hero's Stats over the Hands a Library filter keeps, as the server's
 * `GET /library/stats` sends them (ADR 0001: no shared code).
 */

/** Every Stat's stable key, in the order the server sends and the Stats view shows them. */
export const STAT_KEYS = [
  'vpip',
  'pfr',
  'three-bet',
  'fold-to-three-bet',
  'four-bet',
  'fold-to-four-bet',
  'squeeze',
  'cold-call',
  'fold-bb-to-steal',
  'steal',
  'cbet-flop',
  'fold-to-cbet-flop',
  'check-raise-flop',
  'cbet-turn',
  'fold-to-cbet-turn',
  'cbet-river',
  'fold-to-cbet-river',
  'afq',
  'wwsf',
  'wtsd',
  'wsd',
] as const

export type StatKey = (typeof STAT_KEYS)[number]

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
}

export type StatGroup = 'preflop' | 'postflop' | 'showdown'

export const STAT_GROUPS: StatGroup[] = ['preflop', 'postflop', 'showdown']

export interface StatTile {
  key: StatKey
  /** As players write it, the same in every language. */
  abbreviation: string
  group: StatGroup
  /** Its full name, translated, for the tooltip. */
  name: MessageKey
}

/** The Stats the view shows, in its order. A Stat the server doesn't work out yet has no tile. */
export const STAT_TILES: StatTile[] = [
  { key: 'vpip', abbreviation: 'VPIP', group: 'preflop', name: 'library.stats.name.vpip' },
  { key: 'pfr', abbreviation: 'PFR', group: 'preflop', name: 'library.stats.name.pfr' },
  { key: 'three-bet', abbreviation: '3-bet', group: 'preflop', name: 'library.stats.name.three-bet' },
  {
    key: 'fold-to-three-bet',
    abbreviation: 'Fold to 3-bet',
    group: 'preflop',
    name: 'library.stats.name.fold-to-three-bet',
  },
  { key: 'four-bet', abbreviation: '4-bet', group: 'preflop', name: 'library.stats.name.four-bet' },
  {
    key: 'fold-to-four-bet',
    abbreviation: 'Fold to 4-bet',
    group: 'preflop',
    name: 'library.stats.name.fold-to-four-bet',
  },
  { key: 'squeeze', abbreviation: 'Squeeze', group: 'preflop', name: 'library.stats.name.squeeze' },
  { key: 'cold-call', abbreviation: 'Cold Call', group: 'preflop', name: 'library.stats.name.cold-call' },
  { key: 'fold-bb-to-steal', abbreviation: 'Fold BB to Steal', group: 'preflop', name: 'library.stats.name.fold-bb-to-steal' },
  { key: 'steal', abbreviation: 'ATS', group: 'preflop', name: 'library.stats.name.steal' },
  { key: 'cbet-flop', abbreviation: 'Flop C-bet', group: 'postflop', name: 'library.stats.name.cbet-flop' },
  { key: 'fold-to-cbet-flop', abbreviation: 'Fold to Flop C-bet', group: 'postflop', name: 'library.stats.name.fold-to-cbet-flop' },
  {
    key: 'check-raise-flop',
    abbreviation: 'Flop Check-raise',
    group: 'postflop',
    name: 'library.stats.name.check-raise-flop',
  },
  { key: 'cbet-turn', abbreviation: 'Turn C-bet', group: 'postflop', name: 'library.stats.name.cbet-turn' },
  { key: 'fold-to-cbet-turn', abbreviation: 'Fold to Turn C-bet', group: 'postflop', name: 'library.stats.name.fold-to-cbet-turn' },
  { key: 'cbet-river', abbreviation: 'River C-bet', group: 'postflop', name: 'library.stats.name.cbet-river' },
  { key: 'fold-to-cbet-river', abbreviation: 'Fold to River C-bet', group: 'postflop', name: 'library.stats.name.fold-to-cbet-river' },
  /** Counted per postflop Action, not per Hand: its opportunities can outnumber the Hands. */
  { key: 'afq', abbreviation: 'AFq', group: 'postflop', name: 'library.stats.name.afq' },
  { key: 'wwsf', abbreviation: 'WWSF', group: 'showdown', name: 'library.stats.name.wwsf' },
  { key: 'wtsd', abbreviation: 'WTSD', group: 'showdown', name: 'library.stats.name.wtsd' },
  { key: 'wsd', abbreviation: 'W$SD', group: 'showdown', name: 'library.stats.name.wsd' },
]
