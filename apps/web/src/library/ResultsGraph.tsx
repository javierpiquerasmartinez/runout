import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { useI18n } from '../i18n'
import type { Translator } from '../i18n/translator'
import { usePreferences } from '../preferences/context'
import type { DisplayUnit } from '../preferences/preferences'
import { SegmentedControl } from '../ui/SegmentedControl'
import { RESULT_LINES, type ResultLine, type ResultLines, type Results } from './results'
import './ResultsGraph.css'

/** What the graph adds up in: big blinds always, Amounts only in one currency. */
type GraphUnit = Exclude<DisplayUnit, 'both'>

type Point = { hand: number } & ResultLines

/*
 * Recharts draws the shapes; everything it would style on its own (colours,
 * fonts, strokes, the hover box) comes from the design tokens here and in
 * ResultsGraph.css, so the graph follows the Theme.
 */
const STROKE: Record<ResultLine, string> = {
  result: 'var(--graph-result)',
  allInEv: 'var(--graph-all-in-ev)',
  showdown: 'var(--graph-showdown)',
  nonShowdown: 'var(--graph-non-showdown)',
}
const AXIS_TICK = { fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }

/**
 * The Results Graph: the running Result, All-in EV, Showdown and Non-showdown Results
 * over the filtered Hands, with a legend that shows each line's total and
 * hides or shows it. Draws only Results that hold Hands.
 */
export function ResultsGraph({ results }: { results: Results }) {
  const i18n = useI18n()
  const { t } = i18n
  const { displayUnit } = usePreferences()
  const [hidden, setHidden] = useState<ReadonlySet<ResultLine>>(new Set())
  // Amounts when the reader reads them first, as long as the Hands allow it.
  const [wantsAmounts, setWantsAmounts] = useState(displayUnit === 'amount')
  const unit: GraphUnit = wantsAmounts && results.currency && results.totals.amounts ? 'amount' : 'big-blinds'
  const format = (value: number) => formatValue(value, unit, results.currency, i18n)
  const linesOf = (point: Omit<Results['points'][number], 'hand'>): ResultLines =>
    unit === 'amount' && point.amounts ? point.amounts : point.bigBlinds

  // Every line starts from nothing before the first Hand.
  const data: Point[] = [
    { hand: 0, result: 0, allInEv: 0, showdown: 0, nonShowdown: 0 },
    ...results.points.map((point) => ({ hand: point.hand, ...linesOf(point) })),
  ]
  const totals = linesOf(results.totals)
  const toggle = (line: ResultLine) =>
    setHidden((current) => {
      const next = new Set(current)
      if (!next.delete(line)) next.add(line)
      return next
    })

  return (
    <section className="results" aria-label={t('library.results.title')}>
      <div className="results__head">
        <h2 className="results__title ro-mono">{t('library.results.title')}</h2>
        <span className="results__hands">
          {t(results.hands === 1 ? 'library.count.one' : 'library.count.other', { count: i18n.formatNumber(results.hands) })}
        </span>
        {/* The Win Rate is in big blinds by definition, whichever unit draws the lines. */}
        <span className="results__win-rate ro-mono" title={t('library.results.winRate')}>
          {t('library.results.winRateValue', {
            value: i18n.formatNumber((results.totals.bigBlinds.result / results.hands) * 100, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
              signDisplay: 'exceptZero',
            }),
          })}
        </span>
        <span className="results__spacer" />
        <SegmentedControl<GraphUnit>
          label={t('library.results.unit')}
          options={[
            { value: 'big-blinds', label: t('library.results.unit.big-blinds') },
            { value: 'amount', label: t('library.results.unit.amount') },
          ]}
          value={unit}
          onChange={(value) => setWantsAmounts(value === 'amount')}
          disabledReason={results.currency ? undefined : t('library.results.mixedCurrencies')}
        />
      </div>
      <div className="results__body">
        <div className="results__plot">
          <LineChart data={data} responsive style={{ width: '100%', height: '100%' }} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-divider)" />
            <XAxis
              dataKey="hand"
              type="number"
              domain={[0, 'dataMax']}
              allowDecimals={false}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickFormatter={(hand: number) => i18n.formatNumber(hand)}
            />
            <YAxis
              width={56}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatTick(value, unit, results.currency, i18n)}
            />
            <ReferenceLine y={0} stroke="var(--color-border-strong)" />
            <Tooltip
              cursor={{ stroke: 'var(--color-border-hover)', strokeDasharray: '3 3' }}
              isAnimationActive={false}
              content={({ active, payload }) =>
                active && payload?.[0] ? <Readout point={payload[0].payload as Point} format={format} hidden={hidden} /> : null
              }
            />
            {RESULT_LINES.map((line) => (
              <Line
                key={line}
                dataKey={line}
                className={`results__line results__line--${line}`}
                stroke={STROKE[line]}
                strokeWidth={line === 'result' ? 2 : 1.5}
                dot={false}
                activeDot={{ r: 3, stroke: 'var(--color-panel)', strokeWidth: 1.5, fill: STROKE[line] }}
                hide={hidden.has(line)}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </div>
        <ul className="results__legend" aria-label={t('library.results.lines')}>
          {RESULT_LINES.map((line) => (
            <li key={line} className="results__entry" data-hidden={hidden.has(line) || undefined}>
              <button type="button" className="results__toggle" aria-pressed={!hidden.has(line)} onClick={() => toggle(line)}>
                <span className="results__swatch" style={{ background: STROKE[line] }} aria-hidden="true" />
                {t(`library.results.line.${line}`)}
              </button>
              <span className="results__total ro-mono">{format(totals[line])}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** What hovering the graph reads: the Hand and each shown line's value there. */
function Readout({
  point,
  format,
  hidden,
}: {
  point: Point
  format: (value: number) => string
  hidden: ReadonlySet<ResultLine>
}) {
  const { t, formatNumber } = useI18n()
  return (
    <div className="results__readout">
      <span className="results__readout-hand ro-mono">{t('library.results.hand', { hand: formatNumber(point.hand) })}</span>
      {RESULT_LINES.filter((line) => !hidden.has(line)).map((line) => (
        <span key={line} className="results__readout-line">
          <span className="results__swatch" style={{ background: STROKE[line] }} aria-hidden="true" />
          {t(`library.results.line.${line}`)}
          <span className="results__readout-value ro-mono">{format(point[line])}</span>
        </span>
      ))}
    </div>
  )
}

/** A line's value, signed: "+4.9 BB", "-€0.09". */
function formatValue(value: number, unit: GraphUnit, currency: string | null, i18n: Translator): string {
  if (unit === 'amount' && currency) return i18n.formatCurrency(value / 100, currency, { signDisplay: 'exceptZero' })
  return i18n.t('room.table.bigBlinds', {
    value: i18n.formatNumber(value, { maximumFractionDigits: 2, signDisplay: 'exceptZero' }),
  })
}

/** An axis tick, short: "120", "€1.5K". */
function formatTick(value: number, unit: GraphUnit, currency: string | null, i18n: Translator): string {
  if (unit === 'amount' && currency) {
    return i18n.formatCurrency(value / 100, currency, { notation: 'compact', maximumFractionDigits: 1 })
  }
  return i18n.formatNumber(value, { notation: 'compact', maximumFractionDigits: 1 })
}
