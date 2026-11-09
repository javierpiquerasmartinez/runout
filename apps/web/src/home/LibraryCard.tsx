import { useCallback } from 'react'
import { api } from '../backend/api'
import { firstOfMonth, intlDate, monthOf, todayOf, type CalendarDate } from '../calendar/calendar'
import { useI18n } from '../i18n'
import { libraryPath, type LibraryPage } from '../library/library'
import { EMPTY_LIBRARY_FILTER, libraryFilterQuery, librarySearch } from '../library/libraryFilter'
import { formatValue, winRate, type GraphUnit, type LinesInBothUnits, type Results } from '../library/results'
import { usePreferences } from '../preferences/context'
import { followLink } from '../routing'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { HomeCard, HomeCardMessage } from './HomeCard'
import { LibraryCardGraph } from './LibraryCardGraph'
import { useCardRead } from './useCardRead'
import './LibraryCard.css'

/** The month that begins on this day, up to today: the Library's quick period for the month. */
const monthSoFar = (firstDay: CalendarDate) => ({ ...EMPTY_LIBRARY_FILTER, from: firstDay, to: todayOf() })

/** The small graph only needs enough points to draw. */
const GRAPH_POINTS = 200

interface Month {
  results: Results
  /** Whether the Library holds any Hand at all; only looked up for a month without Hands. */
  anyHands: boolean
}

async function readMonth(token: string, firstDay: CalendarDate): Promise<Month> {
  const query = libraryFilterQuery(monthSoFar(firstDay))
  query.set('points', String(GRAPH_POINTS))
  const results = await api<Results>(`/library/results?${query}`, { token })
  if (results.hands > 0) return { results, anyHands: true }
  const library = await api<LibraryPage>('/library/hands?page=1&pageSize=1', { token })
  return { results, anyHands: library.total > 0 }
}

/** The Result where these lines stand, in big blinds or, when the unit is Amounts, as an Amount. */
const resultIn = (unit: GraphUnit, lines: LinesInBothUnits): number =>
  unit === 'amount' && lines.amounts ? lines.amounts.result : lines.bigBlinds.result

/** How the current month is going: its Hands, Result, Win Rate and a small graph of the Result. Read again only when the month changes. */
export function LibraryCard({ today }: { today: CalendarDate }) {
  const { t, formatDate, locale } = useI18n()
  const firstDay = firstOfMonth(monthOf(today))
  const read = useCallback((token: string) => readMonth(token, firstDay), [firstDay])
  const { status, data: month, reload } = useCardRead(read)
  const monthName = formatDate(intlDate(firstDay), { month: 'long', timeZone: 'UTC' })
  return (
    <HomeCard
      title={t('header.nav.library')}
      href={libraryPath + librarySearch(monthSoFar(firstDay))}
      status={status}
      onRetry={reload}
      subtitle={`${monthName.charAt(0).toLocaleUpperCase(locale)}${monthName.slice(1)}`}
      action={
        month?.anyHands && (
          <Button size="compact">
            <Icon name="import" size={14} />
            {t('home.library.import')}
          </Button>
        )
      }
    >
      {month && month.results.hands > 0 && <MonthResults results={month.results} monthName={monthName} />}
      {month && month.results.hands === 0 && month.anyHands && (
        <HomeCardMessage title={t('home.library.noneThisMonth.title', { month: monthName })} text={t('home.library.noneThisMonth.text')}>
          <a className="library-card__way" href={libraryPath + librarySearch(EMPTY_LIBRARY_FILTER)} onClick={followLink}>
            {t('home.library.noneThisMonth.link')}
          </a>
        </HomeCardMessage>
      )}
      {month && !month.anyHands && (
        <HomeCardMessage title={t('home.library.empty.title')} text={t('home.library.empty.text')}>
          <Button variant="primary" size="compact">
            <Icon name="import" size={14} />
            {t('library.import')}
          </Button>
        </HomeCardMessage>
      )}
    </HomeCard>
  )
}

function MonthResults({ results, monthName }: { results: Results; monthName: string }) {
  const i18n = useI18n()
  const { t, formatNumber } = i18n
  const { displayUnit } = usePreferences()
  const unit: GraphUnit = displayUnit === 'amount' && results.currency && results.totals.amounts ? 'amount' : 'big-blinds'
  const result = resultIn(unit, results.totals)
  return (
    <>
      <div className="library-card__stats">
        <Stat label={t('home.library.hands')} value={formatNumber(results.hands, { useGrouping: true })} />
        <Stat label={t('home.library.result')} value={formatValue(result, unit, results.currency, i18n)} sign={Math.sign(result)} />
        <Stat
          label={t('home.library.winRate')}
          value={formatNumber(winRate(results, 'result'), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        />
      </div>
      <LibraryCardGraph results={results} unit={unit} monthName={monthName} resultIn={(lines) => resultIn(unit, lines)} />
    </>
  )
}

function Stat({ label, value, sign }: { label: string; value: string; sign?: number }) {
  return (
    <div className="library-card__stat">
      <span className="library-card__label">{label}</span>
      <span className="library-card__value ro-mono" data-sign={sign}>
        {value}
      </span>
    </div>
  )
}
