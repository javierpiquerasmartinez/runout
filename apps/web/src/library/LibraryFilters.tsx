import { useI18n } from '../i18n'
import { siteLabel, stakeLabel } from '../room/queueEntryView'
import { Dropdown } from '../ui/Dropdown'
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
 * Poker Site, Hero and Stake offering only what the Library holds, any
 * number of each ticked, and a way to clear them all. Marked only is the "Marcadas" collection beside it.
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
      <Dropdown<QuickRange | 'custom'>
        label={t('library.filter.period')}
        active={period !== DEFAULT_PERIOD}
        value={period}
        options={[
          ...QUICK_RANGES.map((range) => ({ value: range, label: t(`library.filter.period.${range}`) })),
          // Named only when the days match no quick range; it is picked by typing them.
          { value: 'custom' as const, label: t('library.filter.period.custom'), disabled: true },
        ]}
        onChange={(range) => range !== 'custom' && set(quickRange(range))}
      />
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
      <Dropdown
        multiple
        label={t('library.filter.site')}
        none={t('library.filter.site.all')}
        searchLabel={t('library.filter.search')}
        active={filter.sites.length > 0}
        value={filter.sites}
        options={options.sites.map((site) => ({ value: site, label: siteLabel({ site }, i18n) }))}
        onChange={(sites) => set({ sites })}
      />
      <Dropdown
        multiple
        label={t('library.filter.hero')}
        none={t('library.filter.hero.all')}
        searchLabel={t('library.filter.search')}
        active={filter.heroes.length > 0}
        value={filter.heroes}
        options={options.heroes.map((hero) => ({ value: hero, label: hero }))}
        onChange={(heroes) => set({ heroes })}
      />
      <Dropdown
        multiple
        label={t('library.filter.stake')}
        none={t('library.filter.stake.all')}
        searchLabel={t('library.filter.search')}
        active={filter.stakes.length > 0}
        value={filter.stakes}
        options={stakes.map((stake) => ({ value: stake.key, label: stakeName(stake) }))}
        onChange={(stakes) => set({ stakes })}
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
