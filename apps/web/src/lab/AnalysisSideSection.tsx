import { useEffect, useRef, useState } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { Button } from '../ui/Button'
import { liveCombos, removedCombos } from './board'
import type { AnalysisSide } from './lab'
import { EMPTY_RANGE, rangeStats, sameRange, withHandClass, type HandClass, type Range } from './range'
import { RangeMatrix, Stats } from './RangeControls'

/** A saved Range as the server opens it, as far as the Analysis reads it. */
interface SavedRange {
  id: string
  name: string
  combos: Range
}

/** A saved Range as the server lists it. */
export interface RangeSummary {
  id: string
  name: string
}

/**
 * One side of the Analysis: its Range's matrix, with the saved Range it came
 * from, loading and clearing it, and its width (only when it is alone on the
 * screen). Its Combos are the Analysis's, never written to the saved Range:
 * Ranges are built and kept on the Rangos screen.
 */
export function AnalysisSideSection({
  side,
  narrowed,
  lockedReason,
  label,
  compact,
  saved,
  brush,
  out,
  highlighted,
  onChange,
  onRemove,
  onHover,
}: {
  side: AnalysisSide
  /** Its Range on this Street, after its Narrowings: what its matrix and numbers show. */
  narrowed: Range
  /** Why it cannot be painted, if it cannot: a Narrowing would hide the cells painted. */
  lockedReason?: string
  /** What the side is called: the whole Analysis's Range, or "Range 1" or "Range 2" against another. */
  label: string
  /** Whether it shares the screen with another side: no label above its matrix, and only its live Combos under it. */
  compact: boolean
  /** The Account's saved Ranges, to load one. */
  saved: RangeSummary[]
  brush: number
  /** The cards out of the deck: the Board's and the Dead Cards. */
  out: readonly string[]
  /** The Combos a selection of Categories lights up. */
  highlighted: Range
  onChange: (next: (side: AnalysisSide) => AnalysisSide) => void
  /** Takes the side away; none for the first. */
  onRemove?: () => void
  /** The Hand Class under the pointer or the focus in this side's matrix, and null once it leaves. */
  onHover?: (handClass: HandClass | null) => void
}) {
  const { t, formatNumber } = useI18n()
  const { token } = useIdentity()
  const { range, sourceId } = side
  /** The saved Range the address names, once read: its name and Combos, never written from here. */
  const [source, setSource] = useState<SavedRange | null>(null)
  // Read by the source's effect, which outlives this render.
  const sourceRef = useRef(source)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    sourceRef.current = source
    onChangeRef.current = onChange
  })
  /** Why the last load, or reading the source, failed; until the Range changes. */
  const [failure, setFailure] = useState<FailureReason | null>(null)

  const change = (next: (side: AnalysisSide) => AnalysisSide) => {
    setFailure(null)
    onChange(next)
  }
  const setCombos = (combos: (current: Range) => Range) => change((current) => ({ ...current, range: combos(current.range) }))
  const paint = (handClass: HandClass, frequency: number) => setCombos((combos) => withHandClass(combos, handClass, frequency))

  useEffect(() => {
    // Already read, as a Range just loaded is.
    if (sourceId === null || sourceId === sourceRef.current?.id) return
    let cancelled = false
    api<SavedRange>(`/lab/ranges/${encodeURIComponent(sourceId)}`, { token })
      .then((range) => !cancelled && setSource(range))
      .catch((error: unknown) => {
        if (cancelled) return
        const reason = reasonOf(error)
        // No longer this Account's: the Combos stay, without a name to compare them with.
        if (reason === 'range-not-found')
          onChangeRef.current((current) => (current.sourceId === sourceId ? { ...current, sourceId: null } : current))
        else setFailure(reason)
      })
    return () => {
      cancelled = true
    }
  }, [sourceId, token])

  const load = async (id: string) => {
    setFailure(null)
    try {
      const range = await api<SavedRange>(`/lab/ranges/${encodeURIComponent(id)}`, { token })
      sourceRef.current = range
      setSource(range)
      // A Range loaded starts the Street by Street reading over.
      change(() => ({ range: range.combos, sourceId: range.id, narrowings: [] }))
    } catch (error) {
      setFailure(reasonOf(error))
    }
  }

  const shownSource = source !== null && source.id === sourceId ? source : null
  const changed = shownSource !== null && !sameRange(range, shownSource.combos)
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  return (
    <section className="analysis__side" aria-label={label}>
      <div className="analysis__side-name">
        <h2 className="analysis__source">{sourceId === null ? t('lab.analysis.unsaved') : (shownSource?.name ?? '…')}</h2>
        {changed && <span className="lab__unsaved">{t('lab.analysis.changed')}</span>}
      </div>
      <div className="analysis__side-actions">
        <select className="analysis__load" value="" aria-label={t('lab.analysis.load')} onChange={(event) => void load(event.target.value)}>
          <option value="" disabled>
            {t('lab.analysis.loadPlaceholder')}
          </option>
          {saved.map((each) => (
            <option key={each.id} value={each.id}>
              {each.name}
            </option>
          ))}
        </select>
        <span className="lab__spacer" />
        <Button variant="secondary" size="compact" onClick={() => change((current) => ({ ...current, range: EMPTY_RANGE, narrowings: [] }))}>
          {t('lab.ranges.clear')}
        </Button>
        {onRemove && (
          <Button variant="secondary" size="compact" onClick={onRemove}>
            {t('lab.analysis.removeSide')}
          </Button>
        )}
      </div>
      {failure && (
        <p className="lab__failure" role="alert">
          {failure === 'range-not-found' ? t('lab.ranges.unavailable') : t(`reason.${failure}`)}
        </p>
      )}
      <RangeMatrix
        range={narrowed}
        brush={brush}
        onPaint={lockedReason === undefined ? paint : () => undefined}
        removed={(handClass) => removedCombos(handClass, out)}
        highlighted={highlighted}
        onHover={onHover}
      />
      <p className="analysis__live ro-mono">{t('lab.analysis.live', { combos: oneDecimal(liveCombos(narrowed, out)) })}</p>
      {!compact && <Stats stats={rangeStats(narrowed)} />}
    </section>
  )
}
