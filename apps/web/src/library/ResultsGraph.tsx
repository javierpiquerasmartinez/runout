import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  usePlotArea,
  useXAxisInverseDataSnapScale,
  XAxis,
  YAxis,
} from 'recharts'
import { useI18n } from '../i18n'
import type { Translator } from '../i18n/translator'
import { usePreferences } from '../preferences/context'
import { graphColour, type DisplayUnit, type Preferences } from '../preferences/preferences'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { SegmentedControl } from '../ui/SegmentedControl'
import { CLICK_THRESHOLD, graphGesture } from './graphGesture'
import { libraryHandPath } from './library'
import { LINE_COLOUR, RESULT_LINES, type ResultLine, type ResultLines, type Results, type LinesInBothUnits, type Zoom } from './results'
import './ResultsGraph.css'

/** What the graph adds up in: big blinds always, Amounts only in one currency. */
type GraphUnit = Exclude<DisplayUnit, 'both'>

/** A point as drawn; the start point stands for no Hand, so it has no cards. */
type Point = { hand: number; handId?: string; holeCards?: string[] } & ResultLines

/** The stretch a drag spans so far: from the Hand it was pressed on to the one it is over, either way round. */
type DragBand = { pressed: number; over: number }

/** Where the pointer is, as a press, move or release gives it. */
type PointerAt = Pick<MouseEvent, 'clientX' | 'clientY'>

/**
 * The x-axis value of the point nearest the pointer, or undefined. Only
 * inside the plot unless `anywhere`, when the pointer counts as at the
 * plot's nearest edge.
 */
type PointUnder = (pointer: PointerAt, anywhere: boolean) => unknown

/*
 * Recharts draws the shapes; everything it would style on its own (colours,
 * fonts, strokes, the hover box) comes from the design tokens here and in
 * ResultsGraph.css, so the graph follows the Theme. Each line's colour is the
 * reader's Graph Colours.
 */
/** Each line's colour as CSS, from the reader's Graph Colours. */
function strokes(preferences: Preferences): Record<ResultLine, string> {
  return Object.fromEntries(
    RESULT_LINES.map((line) => [line, graphColour(preferences[LINE_COLOUR[line]])]),
  ) as Record<ResultLine, string>
}
const AXIS_TICK = { fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10.5 }

/** How wide the y-axis' labels are; the line under the chart starts past them. */
const Y_AXIS_WIDTH = 56

/** The lines whose Win Rate the graph shows. */
const WIN_RATE_LINES = ['result', 'allInEv'] as const satisfies readonly ResultLine[]

/**
 * The Results Graph: the running Result, All-in EV, Showdown and Non-showdown Results
 * over the filtered Hands, with a legend that shows each line's total and
 * hides or shows it. Draws only Results that hold Hands. Clicking a point
 * with the mouse opens its Hand through `onOpenHand`, or in a new tab with
 * Cmd/Ctrl. Dragging across it with the mouse asks for a Zoom into that
 * stretch through `onZoom`. With a Zoom, it draws only that stretch, says so,
 * and leaves it with `onLeaveZoom`.
 */
export function ResultsGraph({
  results,
  onOpenHand,
  onZoom,
  onLeaveZoom,
}: {
  results: Results
  onOpenHand: (handId: string) => void
  onZoom: (zoom: Zoom) => void
  onLeaveZoom: () => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const preferences = usePreferences()
  const { displayUnit } = preferences
  const stroke = strokes(preferences)
  const [hidden, setHidden] = useState<ReadonlySet<ResultLine>>(new Set())
  // Amounts when the reader reads them first, as long as the Hands allow it.
  const [wantsAmounts, setWantsAmounts] = useState(displayUnit === 'amount')
  const unit: GraphUnit = wantsAmounts && results.currency && results.totals.amounts ? 'amount' : 'big-blinds'
  const format = (value: number) => formatValue(value, unit, results.currency, i18n)
  const linesOf = (point: LinesInBothUnits): ResultLines =>
    unit === 'amount' && point.amounts ? point.amounts : point.bigBlinds

  // Every line starts where it stood before the first Hand drawn: nothing, unless zoomed.
  const data: Point[] = [
    { hand: results.zoom ? results.zoom.from - 1 : 0, ...linesOf(results.start) },
    ...results.points.map((point) => ({ hand: point.hand, handId: point.handId, holeCards: point.holeCards, ...linesOf(point) })),
  ]
  const totals = linesOf(results.totals)
  // Reads the Hand under the pointer the moment it is asked, the way the hover box picks it. Recharts moves
  // the hover box a frame after the mouse, so a press right after a move would otherwise read the Hand before.
  const chart = useRef<HTMLDivElement>(null)
  const pointUnder = useRef<PointUnder | null>(null)
  const handUnder = (pointer: PointerAt, anywhere = false): number | null => {
    const value = pointUnder.current?.(pointer, anywhere)
    const point = data.find((candidate) => candidate.hand === value)
    return point?.handId ? point.hand : null
  }
  // From the press until the release, wherever the mouse goes: `over` is the last Hand it was over.
  const pressed = useRef<{ hand: number | null; over: number | null; x: number; y: number } | null>(null)
  // The stretch a drag spans so far, shaded while the mouse is down.
  const [band, setBand] = useState<DragBand | null>(null)
  const movedSince = (start: { x: number; y: number }, pointer: PointerAt) =>
    Math.hypot(pointer.clientX - start.x, pointer.clientY - start.y)
  const drag = (event: globalThis.PointerEvent) => {
    const start = pressed.current
    if (!start || event.pointerType !== 'mouse') return
    start.over = handUnder(event, true) ?? start.over
    if (start.hand === null || start.over === null || movedSince(start, event) < CLICK_THRESHOLD) return
    setBand({ pressed: start.hand, over: start.over })
  }
  const cancel = () => {
    pressed.current = null
    setBand(null)
  }
  const release = (event: globalThis.PointerEvent) => {
    const start = pressed.current
    cancel()
    if (!start || event.pointerType !== 'mouse') return
    const gesture = graphGesture({
      press: start.hand,
      release: handUnder(event, true) ?? start.over,
      moved: movedSince(start, event),
    })
    if (gesture.kind === 'zoom') {
      onZoom({ from: gesture.from, to: gesture.to })
      return
    }
    if (gesture.kind !== 'open') return
    const handId = data.find((point) => point.hand === gesture.hand)?.handId
    if (!handId) return
    if (event.metaKey || event.ctrlKey) window.open(libraryHandPath(handId), '_blank', 'noopener')
    else onOpenHand(handId)
  }
  // A drag goes on past the chart's edges until the button comes up, so the window follows it; Escape drops it.
  // The listeners call the latest render's handlers, which know the latest points.
  const gesture = useRef({ drag, release, cancel })
  useLayoutEffect(() => {
    gesture.current = { drag, release, cancel }
  })
  const [following, setFollowing] = useState(false)
  useEffect(() => {
    if (!following) return
    const onMove = (event: globalThis.PointerEvent) => gesture.current.drag(event)
    const onUp = (event: globalThis.PointerEvent) => {
      gesture.current.release(event)
      setFollowing(false)
    }
    const onCancel = () => {
      gesture.current.cancel()
      setFollowing(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
    }
  }, [following])
  const press = (event: PointerEvent<HTMLDivElement>) => {
    // Mouse only: touch and pen keep the graph as it was (a tap shows the hover box).
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    const hand = handUnder(event)
    pressed.current = { hand, over: hand, x: event.clientX, y: event.clientY }
    setFollowing(true)
  }
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
        <div className="results__plot" style={{ '--results-y-axis-width': `${Y_AXIS_WIDTH}px` } as CSSProperties}>
          <div ref={chart} className="results__chart" onPointerDown={press}>
            <LineChart
              data={data}
              responsive
              style={{ width: '100%', height: '100%' }}
              margin={{ top: 8, right: 20, bottom: 0, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--color-divider)" />
              <XAxis
                dataKey="hand"
                type="number"
                domain={['dataMin', 'dataMax']}
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickFormatter={(hand: number) => i18n.formatNumber(hand)}
              />
              <YAxis
                width={Y_AXIS_WIDTH}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => formatTick(value, unit, results.currency, i18n)}
              />
              <PointReader
                chart={chart}
                onReader={(read) => {
                  pointUnder.current = read
                }}
              />
              <ReferenceLine y={0} stroke="var(--color-border-strong)" />
              {band && band.pressed !== band.over && (
                <ReferenceArea
                  x1={Math.min(band.pressed, band.over)}
                  x2={Math.max(band.pressed, band.over)}
                  fill="var(--color-selected)"
                  fillOpacity={0.7}
                  stroke="var(--color-border-hover)"
                  strokeOpacity={1}
                  ifOverflow="hidden"
                />
              )}
              <Tooltip
                cursor={{ stroke: 'var(--color-border-hover)', strokeDasharray: '3 3' }}
                isAnimationActive={false}
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <Readout point={payload[0].payload as Point} format={format} hidden={hidden} stroke={stroke} />
                  ) : null
                }
              />
              {RESULT_LINES.map((line) => (
                <Line
                  key={line}
                  dataKey={line}
                  className={`results__line results__line--${line}`}
                  stroke={stroke[line]}
                  strokeWidth={line === 'result' ? 2 : 1.5}
                  dot={false}
                  activeDot={{ r: 3, stroke: 'var(--color-panel)', strokeWidth: 1.5, fill: stroke[line] }}
                  hide={hidden.has(line)}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </div>
          {results.zoom && (
            <p className="results__zoom">
              {t('library.results.zoom', {
                from: i18n.formatNumber(results.zoom.from),
                to: i18n.formatNumber(results.zoom.to),
              })}
              <Button variant="ghost" size="compact" onClick={onLeaveZoom}>
                {t('library.results.zoom.leave')}
              </Button>
            </p>
          )}
        </div>
        <div className="results__side">
          <ul className="results__legend" aria-label={t('library.results.lines')}>
            {RESULT_LINES.map((line) => (
              <li key={line} className="results__entry" data-hidden={hidden.has(line) || undefined}>
                <button type="button" className="results__toggle" aria-pressed={!hidden.has(line)} onClick={() => toggle(line)}>
                  <span className="results__swatch" style={{ background: stroke[line] }} aria-hidden="true" />
                  {t(`library.results.line.${line}`)}
                </button>
                <span className="results__total ro-mono">{format(totals[line])}</span>
              </li>
            ))}
          </ul>
          {/* The Win Rate is in big blinds by definition, whichever unit draws the lines. */}
          <div className="results__win-rates" role="group" aria-label={t('library.results.winRate')} title={t('library.results.winRateHint')}>
            <span className="results__win-rates-title ro-mono">{t('library.results.winRate')}</span>
            <dl>
              {WIN_RATE_LINES.map((line) => (
                <div key={line} className="results__win-rate">
                  <dt>
                    <span className="results__swatch" style={{ background: stroke[line] }} aria-hidden="true" />
                    {t(`library.results.line.${line}`)}
                  </dt>
                  <dd className="ro-mono">
                    {i18n.formatNumber((results.totals.bigBlinds[line] / results.hands) * 100, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                      signDisplay: 'exceptZero',
                    })}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Inside the chart, hands the graph a way to read which point is nearest the
 * pointer from the chart's own axis, as the hover box picks it, at once.
 */
function PointReader({ chart, onReader }: { chart: RefObject<HTMLDivElement | null>; onReader: (read: PointUnder) => void }) {
  const snap = useXAxisInverseDataSnapScale()
  const plot = usePlotArea()
  useLayoutEffect(() => {
    onReader((pointer, anywhere) => {
      const box = chart.current?.getBoundingClientRect()
      if (!snap || !plot || !box) return undefined
      const x = pointer.clientX - box.left
      const y = pointer.clientY - box.top
      const inside = x >= plot.x && x <= plot.x + plot.width && y >= plot.y && y <= plot.y + plot.height
      if (!inside && !anywhere) return undefined
      return snap(Math.min(Math.max(x, plot.x), plot.x + plot.width))
    })
  })
  return null
}

/** What hovering the graph reads: the Hand and each shown line's value there. */
function Readout({
  point,
  format,
  hidden,
  stroke,
}: {
  point: Point
  format: (value: number) => string
  hidden: ReadonlySet<ResultLine>
  stroke: Record<ResultLine, string>
}) {
  const { t, formatNumber } = useI18n()
  return (
    <div className="results__readout">
      <span className="results__readout-hand ro-mono">{t('library.results.hand', { hand: formatNumber(point.hand) })}</span>
      {point.holeCards && (
        <span className="results__readout-cards">
          {point.holeCards.map((card) => (
            <Card key={card} card={card} size="list" />
          ))}
        </span>
      )}
      {RESULT_LINES.filter((line) => !hidden.has(line)).map((line) => (
        <span key={line} className="results__readout-line">
          <span className="results__swatch" style={{ background: stroke[line] }} aria-hidden="true" />
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
