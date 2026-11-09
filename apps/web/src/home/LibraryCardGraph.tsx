import { useI18n } from '../i18n'
import { LINE_COLOUR, formatValue, type GraphUnit, type LinesInBothUnits, type Results } from '../library/results'
import { usePreferences } from '../preferences/context'
import { graphColour } from '../preferences/preferences'

const WIDTH = 734
const HEIGHT = 250
const PLOT = { left: 44, right: 732, top: 16, bottom: 216 }
const LABEL_BASELINE = 246

/** The largest of 1, 2 or 5 times a power of ten that fits within `extent`. */
function roundFigure(extent: number): number {
  const power = 10 ** Math.floor(Math.log10(extent))
  return [5, 2, 1].map((step) => step * power).find((figure) => figure <= extent) ?? power
}

/**
 * The month's Result, Hand by Hand: the small version of the Results Graph,
 * drawn by hand because it needs none of that one's hover, Zoom or legend.
 */
export function LibraryCardGraph({
  results,
  unit,
  monthName,
  resultIn,
}: {
  results: Results
  unit: GraphUnit
  monthName: string
  resultIn: (lines: LinesInBothUnits) => number
}) {
  const i18n = useI18n()
  const { t, formatNumber, formatCurrency } = i18n
  const preferences = usePreferences()
  const line = [{ hand: 0, value: resultIn(results.start) }, ...results.points.map((point) => ({ hand: point.hand, value: resultIn(point) }))]
  const values = line.map(({ value }) => value)
  const lowest = Math.min(0, ...values)
  const highest = Math.max(0, ...values)
  const span = highest - lowest || 1
  const x = (hand: number) => PLOT.left + (hand / results.hands) * (PLOT.right - PLOT.left)
  const y = (value: number) => Number((PLOT.bottom - ((value - lowest) / span) * (PLOT.bottom - PLOT.top)).toFixed(1))
  const path = line.map(({ hand, value }, index) => `${index === 0 ? 'M' : 'L'}${x(hand).toFixed(1)} ${y(value)}`).join(' ')
  // On the side the line went furthest; a line that never left 0 has no figure to mark.
  const extent = Math.max(highest, -lowest)
  const figure = extent > 0 ? roundFigure(extent) * (highest >= -lowest ? 1 : -1) : null
  const tick = (value: number) =>
    unit === 'amount' && results.currency
      ? formatCurrency(value / 100, results.currency, { signDisplay: 'exceptZero', minimumFractionDigits: 0, maximumFractionDigits: 2 })
      : formatNumber(value, { signDisplay: 'exceptZero', maximumFractionDigits: 2 })
  return (
    <svg
      className="library-card__graph"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={t('home.library.graph', {
        month: monthName,
        result: formatValue(resultIn(results.totals), unit, results.currency, i18n),
      })}
    >
      <Rule y={y(0)} label="0" />
      {figure !== null && <Rule y={y(figure)} label={tick(figure)} dashed />}
      <path
        d={path}
        fill="none"
        stroke={graphColour(preferences[LINE_COLOUR.result])}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text className="library-card__tick" x={PLOT.left} y={LABEL_BASELINE}>
        {t('library.results.hand', { hand: 1 })}
      </text>
      <text className="library-card__tick" x={WIDTH} y={LABEL_BASELINE} textAnchor="end">
        {formatNumber(results.hands, { useGrouping: true })}
      </text>
    </svg>
  )
}

function Rule({ y, label, dashed = false }: { y: number; label: string; dashed?: boolean }) {
  return (
    <>
      <line className="library-card__rule" x1={PLOT.left} x2={WIDTH} y1={y} y2={y} strokeDasharray={dashed ? '3 4' : undefined} />
      <text className="library-card__tick" x={36} y={y + 4} textAnchor="end">
        {label}
      </text>
    </>
  )
}
