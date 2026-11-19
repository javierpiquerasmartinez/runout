import { useId, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useNarrowScreen } from '../calendar/narrowScreen'
import { useI18n } from '../i18n'
import { useSession } from '../identity/context'
import { usePreferences } from '../preferences/context'
import { isPlainClick, navigate } from '../routing'
import { Button } from '../ui/Button'
import type { StatCriterion, StatSide } from './libraryFilter'
import {
  STAT_BANDS,
  STAT_CATALOGUE,
  STAT_KEYS,
  STAT_STREETS,
  statName,
  statSideName,
  type LibraryStats,
  type Stat,
  type StatCount,
  type StatHands,
  type StatKey,
  type StatRatio,
} from './stats'
import './StatsView.css'

/** The Stats a person who hasn't chosen theirs sees. */
const DEFAULT_SHOWN: readonly StatKey[] = STAT_CATALOGUE.filter((stat) => stat.shownByDefault).map((stat) => stat.key)

/**
 * The Library's Estadísticas view: the Hero's Stats over the Hands the
 * Library filter keeps, in the catalogue's bands (Preflop, Postflop,
 * Showdown y totales) and order, Postflop as a column per Street, every tile
 * alike whatever its sample. Hovering or focusing a tile names the Stat in
 * full and gives its count, so the person judges the sample themselves, and
 * links to the Hands behind its opportunities and behind the times it was
 * taken, at the address `statHref` writes.
 *
 * It shows the Stats the person chose (their `shownStats` Preference), or
 * the default ones. Editar, on a computer only, shows every Stat of the
 * catalogue, the chosen ones marked, and a click shows or hides one, kept at
 * once; tooltips and links are off meanwhile. A band or Street column with
 * nothing shown isn't drawn.
 */
export function StatsView({ stats, statHref }: { stats: LibraryStats; statHref: (criterion: StatCriterion) => string }) {
  const { t, formatNumber } = useI18n()
  const { shownStats } = usePreferences()
  const { changePreferences } = useSession()
  // A phone stays a reading screen: the Stats are chosen on a computer.
  const narrow = useNarrowScreen()
  const [editing, setEditing] = useState(false)
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const choosing = editing && !narrow
  const chosen = new Set<StatKey>(shownStats ?? DEFAULT_SHOWN)
  const visible: Stat[] = choosing ? [...STAT_CATALOGUE] : STAT_CATALOGUE.filter((stat) => chosen.has(stat.key))

  const change = (next: StatKey[] | null) => {
    setFailure(null)
    changePreferences({ shownStats: next }).catch((error: unknown) => setFailure(reasonOf(error)))
  }
  // The choice is a set; it is kept in the catalogue's order only to read well.
  const toggle = (key: StatKey) =>
    change(STAT_KEYS.filter((each) => (each === key ? !chosen.has(each) : chosen.has(each))))

  const tiles = (of: Stat[]) => (
    <div className="stats__tiles">
      {of.map((stat) => (
        <StatTileView
          key={stat.key}
          stat={stat}
          count={stats.stats[stat.key]}
          handsWith={stats.handsWith[stat.key]}
          statHref={statHref}
          choice={choosing ? { shown: chosen.has(stat.key), toggle: () => toggle(stat.key) } : null}
        />
      ))}
    </div>
  )
  return (
    <section className="stats" aria-label={t('library.stats.title')}>
      <div className="stats__head">
        {choosing ? (
          <>
            <span className="stats__hint">{t('library.stats.edit.hint')}</span>
            <span className="stats__actions">
              <Button variant="ghost" size="compact" onClick={() => change(null)}>
                {t('library.stats.edit.reset')}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                {t('library.stats.edit.done')}
              </Button>
            </span>
          </>
        ) : (
          <>
            <span className="stats__hands">
              {t(stats.hands === 1 ? 'library.count.one' : 'library.count.other', { count: formatNumber(stats.hands) })}
            </span>
            {!narrow && (
              <Button variant="ghost" size="compact" onClick={() => setEditing(true)}>
                {t('library.stats.edit')}
              </Button>
            )}
          </>
        )}
      </div>
      {failure && (
        <p className="stats__failure" role="alert">
          {t('library.stats.edit.failed', { reason: t(`reason.${failure}`) })}
        </p>
      )}
      {visible.length === 0 && (
        <p className="stats__none">
          {narrow ? t('library.stats.none') : `${t('library.stats.none')} ${t('library.stats.none.edit')}`}
        </p>
      )}
      {STAT_BANDS.map((band) => {
        const inBand = visible.filter((stat) => stat.band === band)
        if (inBand.length === 0) return null
        if (band !== 'postflop') {
          return (
            <Titled key={band} level={2} title={t(`library.stats.band.${band}`)}>
              {tiles(inBand)}
            </Titled>
          )
        }
        return (
          <Titled key={band} level={2} title={t('library.stats.band.postflop')}>
            <div className="stats__streets">
              {STAT_STREETS.map((street) => {
                const inStreet = inBand.filter((stat) => stat.street === street)
                if (inStreet.length === 0) return null
                return (
                  <Titled key={street} level={3} title={t(`library.stats.street.${street}`)}>
                    {tiles(inStreet)}
                  </Titled>
                )
              })}
            </div>
          </Titled>
        )
      })}
      {narrow && <p className="stats__elsewhere">{t('library.stats.phone')}</p>}
    </section>
  )
}

/**
 * A band, or a Street's column within Postflop, named by its heading. The
 * view says band for its three rows; the Stat criterion's `STAT_SECTIONS`
 * split Postflop by Street instead.
 */
function Titled({ level, title, children }: { level: 2 | 3; title: string; children: ReactNode }) {
  const titleId = useId()
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <div className={level === 2 ? 'stats__band' : 'stats__street'} role="group" aria-labelledby={titleId}>
      <Heading id={titleId} className={`${level === 2 ? 'stats__band-title' : 'stats__street-title'} ro-mono`}>
        {title}
      </Heading>
      {children}
    </div>
  )
}

/**
 * A Stat's value as its tile shows it, whether there is nothing to count,
 * and its counts as its tooltip gives them. A frequency reads as a
 * percentage; a ratio (AF) reads as one decimal with no percent sign, "∞"
 * with aggressive Actions and no calls.
 */
function useStatReading(count: StatCount | StatRatio) {
  const { t, formatNumber } = useI18n()
  if ('ratio' in count) {
    const none = count.aggressive === 0 && count.calls === 0
    return {
      none,
      value: none
        ? '—'
        : count.calls === 0
          ? '∞'
          : formatNumber(count.aggressive / count.calls, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      counts: none
        ? t('library.stats.ratio.none')
        : t('library.stats.ratio.count', { aggressive: formatNumber(count.aggressive), calls: formatNumber(count.calls) }),
    }
  }
  const none = count.opportunities === 0
  return {
    none,
    value: none
      ? '—'
      : formatNumber(count.taken / count.opportunities, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    counts: none
      ? t('library.stats.noChance')
      : t('library.stats.count', { taken: formatNumber(count.taken), opportunities: formatNumber(count.opportunities) }),
  }
}

/**
 * One Stat: its abbreviation and percentage (or ratio), with its tooltip under it on
 * hover or focus. While the person chooses their Stats (`choice`), it has no
 * tooltip: a click shows or hides it instead, and it is marked shown or faded.
 */
function StatTileView({
  stat,
  count,
  handsWith,
  statHref,
  choice,
}: {
  stat: Stat
  count: StatCount | StatRatio
  handsWith: StatHands
  statHref: (criterion: StatCriterion) => string
  choice: { shown: boolean; toggle: () => void } | null
}) {
  const { t, formatNumber } = useI18n()
  const tipId = useId()
  const nameId = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const open = !choice && (hovered || focused)
  const { none, value, counts } = useStatReading(count)
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
      {t(statSideName(stat, side, 'link'), { count: formatNumber(handsWith[side]) })}
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
      <button
        type="button"
        className="stats__tile"
        data-empty={none || undefined}
        data-choice={choice ? (choice.shown ? 'shown' : 'hidden') : undefined}
        aria-pressed={choice ? choice.shown : undefined}
        aria-describedby={open ? tipId : choice ? nameId : undefined}
        onClick={choice?.toggle}
      >
        <span className="stats__abbr ro-mono">{stat.short}</span>{' '}
        <span className="stats__value ro-serif">{value}</span>
      </button>
      {/* While choosing there is no tooltip, so the full name, Street and all, describes the tile:
          under a Street column the short names repeat ("AF" four times). */}
      {choice && (
        <span id={nameId} hidden>
          {t(statName(stat))}
        </span>
      )}
      {choice && (
        <span className="stats__mark ro-mono" data-shown={choice.shown || undefined} aria-hidden="true">
          {choice.shown ? '✓' : '+'}
        </span>
      )}
      {open && (
        <div id={tipId} className="stats__tip" role="tooltip">
          <div className="stats__tip-card">
            <span className="stats__tip-name">{t(statName(stat))}</span>
            <span className="stats__tip-count ro-mono">{counts}</span>
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
