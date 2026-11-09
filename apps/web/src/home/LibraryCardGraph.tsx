import { useNarrowScreen } from '../calendar/narrowScreen'
import { useI18n } from '../i18n'
import { LINE_COLOUR, formatTick, formatValue, linesIn, type GraphUnit, type LinesInBothUnits, type Results } from '../library/results'
import { usePreferences } from '../preferences/context'
import { graphColour } from '../preferences/preferences'

/** Two drawings and not one scaled: scaled to a phone, the figures would shrink with it. */
const WIDE = { width: 734, height: 250, plot: { left: 44, right: 732, top: 16, bottom: 216 }, labelBaseline: 246 }
const NARROW = { width: 320, height: 130, plot: { left: 44, right: 318, top: 12, bottom: 98 }, labelBaseline: 126 }

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
}: {
  results: Results
  unit: GraphUnit
  monthName: string
}) {
  const i18n = useI18n()
  const { t, formatNumber } = i18n
  const preferences = usePreferences()
  const { width, height, plot, labelBaseline } = useNarrowScreen() ? NARROW : WIDE
  const resultIn = (lines: LinesInBothUnits) => linesIn(unit, lines).result
  const line = [{ hand: 0, value: resultIn(results.start) }, ...results.points.map((point) => ({ hand: point.hand, value: resultIn(point) }))]
  const values = line.map(({ value }) => value)
  const lowest = Math.min(0, ...values)
  const highest = Math.max(0, ...values)
  const span = highest - lowest || 1
  const x = (hand: number) => plot.left + (hand / results.hands) * (plot.right - plot.left)
  const y = (value: number) => Number((plot.bottom - ((value - lowest) / span) * (plot.bottom - plot.top)).toFixed(1))
  const path = line.map(({ hand, value }, index) => `${index === 0 ? 'M' : 'L'}${x(hand).toFixed(1)} ${y(value)}`).join(' ')
  // On the side the line went furthest; a line that never left 0 has no figure to mark.
  const extent = Math.max(highest, -lowest)
  const figure = extent > 0 ? roundFigure(extent) * (highest >= -lowest ? 1 : -1) : null
  const tick = (value: number) => formatTick(value, unit, results.currency, i18n, { signDisplay: 'exceptZero', maximumFractionDigits: 2 })
  return (
    <svg
      className="library-card__graph"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t('home.library.graph', {
        month: monthName,
        result: formatValue(resultIn(results.totals), unit, results.currency, i18n),
      })}
    >
      <Rule from={plot.left} to={width} y={y(0)} label="0" />
      {figure !== null && <Rule from={plot.left} to={width} y={y(figure)} label={tick(figure)} dashed />}
      <path
        d={path}
        fill="none"
        stroke={graphColour(preferences[LINE_COLOUR.result])}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text className="library-card__tick" x={plot.left} y={labelBaseline}>
        {t('library.results.hand', { hand: 1 })}
      </text>
      <text className="library-card__tick" x={width} y={labelBaseline} textAnchor="end">
        {formatNumber(results.hands, { useGrouping: true })}
      </text>
    </svg>
  )
}

function Rule({ from, to, y, label, dashed = false }: { from: number; to: number; y: number; label: string; dashed?: boolean }) {
  return (
    <>
      <line className="library-card__rule" x1={from} x2={to} y1={y} y2={y} strokeDasharray={dashed ? '3 4' : undefined} />
      <text className="library-card__tick" x={36} y={y + 4} textAnchor="end">
        {label}
      </text>
    </>
  )
}
