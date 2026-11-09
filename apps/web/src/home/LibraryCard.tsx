import { useCallback, useState } from 'react'
import { api } from '../backend/api'
import { firstOfMonth, intlDate, monthOf, todayOf, type CalendarDate } from '../calendar/calendar'
import { useI18n } from '../i18n'
import { libraryPath, type LibraryPage } from '../library/library'
import { EMPTY_LIBRARY_FILTER, libraryFilterQuery, librarySearch } from '../library/libraryFilter'
import { graphUnit, linesIn, winRate, type Results } from '../library/results'
import { usePreferences } from '../preferences/context'
import { ImportDialog } from '../room/ImportDialog'
import { quantityOf } from '../room/quantity'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { HomeCard, HomeCardLink, HomeCardMessage } from './HomeCard'
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

/** How the current month is going: its Hands, Result, Win Rate and a small graph of the Result. Read again only when the month changes. */
export function LibraryCard({ today }: { today: CalendarDate }) {
  const { t, formatDate, locale } = useI18n()
  const firstDay = firstOfMonth(monthOf(today))
  const read = useCallback((token: string) => readMonth(token, firstDay), [firstDay])
  const { status, data: month, reload } = useCardRead(read)
  const [importing, setImporting] = useState(false)
  const monthName = formatDate(intlDate(firstDay), { month: 'long', timeZone: 'UTC' })
  return (
    <>
      <HomeCard
        title={t('header.nav.library')}
        href={libraryPath + librarySearch(monthSoFar(firstDay))}
        status={status}
        onRetry={reload}
        subtitle={`${monthName.charAt(0).toLocaleUpperCase(locale)}${monthName.slice(1)}`}
        action={
          month?.anyHands && (
            <Button size="compact" onClick={() => setImporting(true)}>
              <Icon name="import" size={14} />
              {t('home.library.import')}
            </Button>
          )
        }
      >
        {month && month.results.hands > 0 && <MonthResults results={month.results} monthName={monthName} />}
        {month && month.results.hands === 0 && month.anyHands && (
          <HomeCardMessage title={t('home.library.noneThisMonth.title', { month: monthName })} text={t('home.library.noneThisMonth.text')}>
            <HomeCardLink href={libraryPath + librarySearch(EMPTY_LIBRARY_FILTER)}>{t('home.library.noneThisMonth.link')}</HomeCardLink>
          </HomeCardMessage>
        )}
        {month && !month.anyHands && (
          <HomeCardMessage title={t('home.library.empty.title')} text={t('home.library.empty.text')}>
            <Button variant="primary" size="compact" onClick={() => setImporting(true)}>
              <Icon name="import" size={14} />
              {t('library.import')}
            </Button>
          </HomeCardMessage>
        )}
      </HomeCard>
      {importing && <ImportDialog destination={{ kind: 'library' }} onClose={() => setImporting(false)} onImported={reload} />}
    </>
  )
}

function MonthResults({ results, monthName }: { results: Results; monthName: string }) {
  const i18n = useI18n()
  const { t, formatNumber } = i18n
  const { displayUnit } = usePreferences()
  const { currency, totals } = results
  const unit = graphUnit(displayUnit === 'amount', results)
  const money = currency && totals.amounts ? { amount: totals.amounts.result, currency } : null
  const result = quantityOf(totals.bigBlinds.result, money, displayUnit, i18n, { maximumFractionDigits: 2, signDisplay: 'exceptZero' })
  return (
    <>
      <div className="library-card__figures">
        <MonthFigure label={t('home.library.hands')} value={formatNumber(results.hands, { useGrouping: true })} />
        <MonthFigure label={t('home.library.result')} value={result.primary} secondary={result.secondary} sign={Math.sign(linesIn(unit, totals).result)} />
        <MonthFigure
          label={t('home.library.winRate')}
          value={formatNumber(winRate(results, 'result'), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        />
      </div>
      <LibraryCardGraph results={results} unit={unit} monthName={monthName} />
    </>
  )
}

/** One of the month's figures, and the Amount beside it when the reader shows both. */
function MonthFigure({ label, value, secondary, sign }: { label: string; value: string; secondary?: string | null; sign?: number }) {
  return (
    <div className="library-card__figure">
      <span className="library-card__label">{label}</span>
      <span className="library-card__amounts">
        <span className="library-card__value ro-mono" data-sign={sign}>
          {value}
        </span>
        {secondary && <span className="library-card__secondary ro-mono">{secondary}</span>}
      </span>
    </div>
  )
}
