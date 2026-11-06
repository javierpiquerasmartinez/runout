import { useId, useState, type FocusEvent, type MouseEvent } from 'react'
import { useI18n } from '../i18n'
import { isPlainClick, navigate } from '../routing'
import type { StatCriterion, StatSide } from './libraryFilter'
import { STAT_GROUPS, STAT_TILES, type LibraryStats, type StatCount, type StatHands, type StatTile } from './stats'
import './StatsView.css'

/**
 * The Library's Estadísticas view: the Hero's Stats over the Hands the
 * Library filter keeps, a band of tiles per group (Preflop, Postflop,
 * Showdown), every tile alike whatever its sample. Hovering or focusing a
 * tile names the Stat in full and gives its count, so the person judges the
 * sample themselves, and links to the Hands behind its opportunities and
 * behind the times it was taken, at the address `statHref` writes.
 */
export function StatsView({ stats, statHref }: { stats: LibraryStats; statHref: (criterion: StatCriterion) => string }) {
  const { t, formatNumber } = useI18n()
  return (
    <section className="stats" aria-label={t('library.stats.title')}>
      <span className="stats__hands">
        {t(stats.hands === 1 ? 'library.count.one' : 'library.count.other', { count: formatNumber(stats.hands) })}
      </span>
      {STAT_GROUPS.map((group) => {
        const tiles = STAT_TILES.filter((tile) => tile.group === group)
        if (tiles.length === 0) return null
        return <StatBand key={group} title={t(`library.stats.group.${group}`)} tiles={tiles} stats={stats} statHref={statHref} />
      })}
    </section>
  )
}

function StatBand({
  title,
  tiles,
  stats,
  statHref,
}: {
  title: string
  tiles: StatTile[]
  stats: LibraryStats
  statHref: (criterion: StatCriterion) => string
}) {
  const titleId = useId()
  return (
    <div className="stats__band" role="group" aria-labelledby={titleId}>
      <h2 id={titleId} className="stats__group ro-mono">
        {title}
      </h2>
      <div className="stats__tiles">
        {tiles.map((tile) => (
          <StatTileView key={tile.key} tile={tile} count={stats.stats[tile.key]} handsWith={stats.handsWith[tile.key]} statHref={statHref} />
        ))}
      </div>
    </div>
  )
}

/** One Stat: its abbreviation and percentage, with its tooltip under it on hover or focus. */
function StatTileView({
  tile,
  count,
  handsWith,
  statHref,
}: {
  tile: StatTile
  count: StatCount
  handsWith: StatHands
  statHref: (criterion: StatCriterion) => string
}) {
  const { t, formatNumber } = useI18n()
  const tipId = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const open = hovered || focused
  const none = count.opportunities === 0
  const value = none
    ? '—'
    : formatNumber(count.taken / count.opportunities, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
  // Focus moving from the tile to the tooltip's links keeps it open.
  const leave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
  }
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return
    event.preventDefault()
    navigate(event.currentTarget.getAttribute('href')!)
  }
  // The links count Hands, as the list behind them does, not the Stat's own counts.
  const link = (side: StatSide) => (
    <a className="stats__tip-link" href={statHref({ key: tile.key, side })} onClick={follow}>
      {t(`library.stats.link.${side}`, { count: formatNumber(handsWith[side]) })}
    </a>
  )
  return (
    <div
      className="stats__stat"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={leave}
    >
      <button type="button" className="stats__tile" data-empty={none || undefined} aria-describedby={open ? tipId : undefined}>
        <span className="stats__abbr ro-mono">{tile.abbreviation}</span>{' '}
        <span className="stats__value ro-serif">{value}</span>
      </button>
      {open && (
        <div id={tipId} className="stats__tip" role="tooltip">
          <div className="stats__tip-card">
            <span className="stats__tip-name">{t(tile.name)}</span>
            <span className="stats__tip-count ro-mono">
              {none
                ? t('library.stats.noChance')
                : t('library.stats.count', { taken: formatNumber(count.taken), opportunities: formatNumber(count.opportunities) })}
            </span>
            {!none && (
              <span className="stats__tip-links">
                {link('opportunity')}
                {link('taken')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
