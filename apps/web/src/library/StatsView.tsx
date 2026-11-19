import { useId, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { isPlainClick, navigate } from '../routing'
import type { StatCriterion, StatSide } from './libraryFilter'
import {
  STAT_BANDS,
  STAT_CATALOGUE,
  STAT_STREETS,
  statName,
  type LibraryStats,
  type Stat,
  type StatCount,
  type StatHands,
} from './stats'
import './StatsView.css'

/**
 * The Library's Estadísticas view: the Hero's Stats over the Hands the
 * Library filter keeps, in the catalogue's bands (Preflop, Postflop,
 * Showdown y totales) and order, Postflop as a column per Street, every tile
 * alike whatever its sample. Hovering or focusing a tile names the Stat in
 * full and gives its count, so the person judges the sample themselves, and
 * links to the Hands behind its opportunities and behind the times it was
 * taken, at the address `statHref` writes.
 */
export function StatsView({ stats, statHref }: { stats: LibraryStats; statHref: (criterion: StatCriterion) => string }) {
  const { t, formatNumber } = useI18n()
  const shown: Stat[] = STAT_CATALOGUE.filter((stat) => stat.shownByDefault)
  const tiles = (of: Stat[]) => (
    <div className="stats__tiles">
      {of.map((stat) => (
        <StatTileView key={stat.key} stat={stat} count={stats.stats[stat.key]} handsWith={stats.handsWith[stat.key]} statHref={statHref} />
      ))}
    </div>
  )
  return (
    <section className="stats" aria-label={t('library.stats.title')}>
      <span className="stats__hands">
        {t(stats.hands === 1 ? 'library.count.one' : 'library.count.other', { count: formatNumber(stats.hands) })}
      </span>
      {STAT_BANDS.map((band) => {
        const inBand = shown.filter((stat) => stat.band === band)
        if (inBand.length === 0) return null
        if (band !== 'postflop') {
          return (
            <Group key={band} level={2} title={t(`library.stats.group.${band}`)}>
              {tiles(inBand)}
            </Group>
          )
        }
        return (
          <Group key={band} level={2} title={t('library.stats.group.postflop')}>
            <div className="stats__streets">
              {STAT_STREETS.map((street) => {
                const inStreet = inBand.filter((stat) => stat.street === street)
                if (inStreet.length === 0) return null
                return (
                  <Group key={street} level={3} title={t(`library.stats.street.${street}`)}>
                    {tiles(inStreet)}
                  </Group>
                )
              })}
            </div>
          </Group>
        )
      })}
    </section>
  )
}

/** A band, or a Street's column within Postflop, named by its heading. */
function Group({ level, title, children }: { level: 2 | 3; title: string; children: ReactNode }) {
  const titleId = useId()
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <div className={level === 2 ? 'stats__band' : 'stats__street'} role="group" aria-labelledby={titleId}>
      <Heading id={titleId} className={`${level === 2 ? 'stats__group' : 'stats__street-title'} ro-mono`}>
        {title}
      </Heading>
      {children}
    </div>
  )
}

/** One Stat: its abbreviation and percentage, with its tooltip under it on hover or focus. */
function StatTileView({
  stat,
  count,
  handsWith,
  statHref,
}: {
  stat: Stat
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
    <a className="stats__tip-link" href={statHref({ key: stat.key, side })} onClick={follow}>
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
        <span className="stats__abbr ro-mono">{stat.short}</span>{' '}
        <span className="stats__value ro-serif">{value}</span>
      </button>
      {open && (
        <div id={tipId} className="stats__tip" role="tooltip">
          <div className="stats__tip-card">
            <span className="stats__tip-name">{t(statName(stat))}</span>
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
