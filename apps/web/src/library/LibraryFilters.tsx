import { useI18n } from '../i18n'
import { siteLabel, stakeLabel } from '../room/queueEntryView'
import type { LibraryPage } from './library'
import {
  DEFAULT_PERIOD,
  defaultLibraryFilter,
  differsFromDefault,
  periodOf,
  QUICK_RANGES,
  quickRange,
  stakeKey,
  type LibraryFilter,
  type QuickRange,
} from './libraryFilter'
import './LibraryFilters.css'

/**
 * The "Biblioteca" board's filters bar: the period, then one filter per
 * Poker Site, Hero and Stake offering only what the Library holds, and a
 * way to clear them all. Marked only is the "Marcadas" collection beside it.
 */
export function LibraryFilters({
  filter,
  options,
  onChange,
}: {
  filter: LibraryFilter
  options: LibraryPage['options']
  onChange: (filter: LibraryFilter) => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const period = periodOf(filter)
  const set = (part: Partial<LibraryFilter>) => onChange({ ...filter, ...part })
  const stakes = options.stakes.map((stake) => ({ key: stakeKey(stake), label: stakeLabel({ stake }), stake }))
  // Two Stakes read alike when only their currency tells them apart.
  const stakeName = ({ label, stake }: (typeof stakes)[number]) =>
    stakes.filter((other) => other.label === label).length > 1 ? `${label} ${stake.currency}` : label

  return (
    <div className="library-filters" role="group" aria-label={t('library.filters')}>
      <label className="library-filters__field" data-active={period !== DEFAULT_PERIOD || undefined}>
        <span className="library-filters__label">{t('library.filter.period')}</span>
        <select
          value={period}
          onChange={(event) => {
            const range = event.target.value as QuickRange | 'custom'
            if (range !== 'custom') set(quickRange(range))
          }}
        >
          {QUICK_RANGES.map((range) => (
            <option key={range} value={range}>
              {t(`library.filter.period.${range}`)}
            </option>
          ))}
          <option value="custom" disabled={period !== 'custom'}>
            {t('library.filter.period.custom')}
          </option>
        </select>
      </label>
      <label className="library-filters__date">
        <span className="library-filters__label">{t('library.filter.from')}</span>
        <input
          type="date"
          value={filter.from ?? ''}
          max={filter.to ?? undefined}
          onChange={(event) => set({ from: event.target.value || null })}
        />
      </label>
      <label className="library-filters__date">
        <span className="library-filters__label">{t('library.filter.to')}</span>
        <input
          type="date"
          value={filter.to ?? ''}
          min={filter.from ?? undefined}
          onChange={(event) => set({ to: event.target.value || null })}
        />
      </label>
      <Choice
        label={t('library.filter.site')}
        all={t('library.filter.site.all')}
        value={filter.site}
        choices={options.sites.map((site) => ({ value: site, label: siteLabel({ site }, i18n) }))}
        onChange={(site) => set({ site })}
      />
      <Choice
        label={t('library.filter.hero')}
        all={t('library.filter.hero.all')}
        value={filter.hero}
        choices={options.heroes.map((hero) => ({ value: hero, label: hero }))}
        onChange={(hero) => set({ hero })}
      />
      <Choice
        label={t('library.filter.stake')}
        all={t('library.filter.stake.all')}
        value={filter.stake}
        choices={stakes.map((stake) => ({ value: stake.key, label: stakeName(stake) }))}
        onChange={(stake) => set({ stake })}
      />
      <span className="library-filters__spacer" />
      {/* Always there, as on the board; it does nothing while the filter is the default. */}
      <button
        type="button"
        className="library-filters__clear"
        onClick={() => differsFromDefault(filter) && onChange(defaultLibraryFilter())}
      >
        {t('library.filter.clear')}
      </button>
    </div>
  )
}

/** One filter: everything, or one of the values the Library holds. */
function Choice({
  label,
  all,
  value,
  choices,
  onChange,
}: {
  label: string
  all: string
  value: string | null
  choices: { value: string; label: string }[]
  onChange: (value: string | null) => void
}) {
  return (
    <label className="library-filters__field" data-active={value !== null || undefined}>
      <span className="library-filters__label">{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">{all}</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  )
}
