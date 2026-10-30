import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { copyText } from '../ui/clipboard'
import { Icon } from '../ui/Icon'
import { SegmentedControl } from '../ui/SegmentedControl'
import {
  formatRange,
  HAND_CLASS_KINDS,
  HAND_CLASS_BY_NAME,
  HAND_CLASSES,
  handClassFrequency,
  parseRange,
  strokeFrequency,
  TOTAL_COMBOS,
  type HandClass,
  type Range,
  type RangeStats,
} from './range'
import './LabRangesPage.css'

/*
 * The pieces both Lab screens edit a Range with: the brush, the matrix, the
 * Range's width and the Range as text.
 */

/** The brush's shortcuts; any other whole Frequency from 1 to 100 is typed in its field. */
const BRUSH_PRESETS = [100, 75, 50, 25] as const

/** How far apart, in px, a drag's path is sampled between two pointer events, so a fast one skips no cell. */
const STROKE_STEP = 6

/** How long the copy button says it copied. */
const COPIED_FOR_MS = 2000

/** The brush's Frequency: a shortcut, or a whole number from 1 to 100 typed in its field. */
export function Brush({ brush, onChange }: { brush: number; onChange: (frequency: number) => void }) {
  const { t } = useI18n()
  /** The field while it is being typed in, which may not be a Frequency yet; null shows the brush's. */
  const [typed, setTyped] = useState<string | null>(null)
  const custom = !BRUSH_PRESETS.some((preset) => preset === brush)
  return (
    <div className="lab__brush" role="group" aria-label={t('lab.brush')}>
      <span className="lab__label">{t('lab.brush')}</span>
      <SegmentedControl
        label={t('lab.brush')}
        options={BRUSH_PRESETS.map((preset) => ({ value: String(preset), label: t('lab.brush.preset', { percent: preset }) }))}
        value={String(brush)}
        onChange={(value) => {
          setTyped(null)
          onChange(Number(value))
        }}
      />
      <label className="lab__brush-field" data-active={custom || undefined}>
        <input
          className="ro-mono"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          value={typed ?? String(brush)}
          aria-label={t('lab.brush.frequency')}
          onChange={(event) => {
            const value = event.target.value
            setTyped(value)
            if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100) onChange(Number(value))
          }}
          onBlur={() => setTyped(null)}
        />
        <span aria-hidden="true">%</span>
      </label>
    </div>
  )
}

/**
 * The 13×13 matrix, each cell labelled with its Hand Class and filled from the
 * left by its Frequency. Pressing a cell starts a stroke that paints, or takes
 * out, every cell the pointer then crosses until it is released anywhere. A
 * touch has no stroke: a tap paints the one cell, and a finger that moves
 * scrolls the page instead.
 */
export function RangeMatrix({
  range,
  brush,
  onPaint,
}: {
  range: Range
  brush: number
  onPaint: (handClass: HandClass, frequency: number) => void
}) {
  const { t } = useI18n()
  /** The stroke under way: the Frequency its first cell decided, where the pointer last was and the Hand Class last painted. */
  const stroke = useRef<{ frequency: number; x: number; y: number; lastHandClass: string } | null>(null)
  /** Whether the last press was a finger's, which paints on its click instead. */
  const pressedByTouch = useRef(false)
  // Read by the window's listeners, which outlive this render.
  const onPaintRef = useRef(onPaint)
  useEffect(() => {
    onPaintRef.current = onPaint
  })

  // Moves are followed on the whole window, so a pointer that leaves the
  // matrix and comes back is walked from where it really was.
  useEffect(() => {
    // Pointer events come further apart than a cell on a fast drag: walk the path between them.
    const move = (event: globalThis.PointerEvent) => {
      const current = stroke.current
      if (!current) return
      const { x, y } = current
      const steps = Math.ceil(Math.hypot(event.clientX - x, event.clientY - y) / STROKE_STEP)
      for (let step = 1; step <= steps; step++) {
        const point = document.elementFromPoint(x + ((event.clientX - x) * step) / steps, y + ((event.clientY - y) * step) / steps)
        const name = point?.closest<HTMLElement>('[data-hand-class]')?.dataset.handClass
        const handClass = name !== undefined ? HAND_CLASS_BY_NAME.get(name) : undefined
        if (handClass && handClass.name !== current.lastHandClass) {
          current.lastHandClass = handClass.name
          onPaintRef.current(handClass, current.frequency)
        }
      }
      current.x = event.clientX
      current.y = event.clientY
    }
    const end = () => (stroke.current = null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  /** What a stroke starting on this Hand Class sets every cell it crosses to. */
  const frequencyFrom = (handClass: HandClass) => strokeFrequency(range, handClass, brush)

  const start = (event: PointerEvent, handClass: HandClass) => {
    pressedByTouch.current = event.pointerType === 'touch'
    // Painting on press would paint the cell under every scroll that starts on the matrix.
    if (pressedByTouch.current || event.button !== 0) return
    const frequency = frequencyFrom(handClass)
    stroke.current = { frequency, x: event.clientX, y: event.clientY, lastHandClass: handClass.name }
    onPaint(handClass, frequency)
  }

  return (
    <div className="lab__matrix" role="group" aria-label={t('lab.matrix')}>
      {HAND_CLASSES.map((handClass) => {
        const frequency = handClassFrequency(range, handClass)
        const { mixed } = frequency
        // A mixed cell holds some Combos, however low its average rounds.
        const value = mixed ? Math.max(1, Math.round(frequency.value)) : frequency.value
        return (
          <button
            key={handClass.name}
            type="button"
            className="lab__cell ro-mono"
            data-kind={handClass.kind}
            data-hand-class={handClass.name}
            data-in={value > 0 || undefined}
            data-full={(value === 100 && !mixed) || undefined}
            data-mixed={mixed || undefined}
            aria-pressed={value > 0}
            aria-label={handClass.name}
            title={t(mixed ? 'lab.cell.mixedTitle' : 'lab.cell.title', {
              handClass: handClass.name,
              combos: handClass.combos.length,
              frequency: value,
            })}
            onPointerDown={(event) => start(event, handClass)}
            // A mouse or pen paints on press; a tap, or a click from the keyboard (no pointer, detail 0), paints here.
            onClick={(event) => (event.detail === 0 || pressedByTouch.current) && onPaint(handClass, frequencyFrom(handClass))}
          >
            <span className="lab__cell-fill" style={{ width: `${value}%` }} />
            <span className="lab__cell-label">{handClass.name}</span>
            {(mixed || (value > 0 && value < 100)) && (
              <span className="lab__cell-frequency">
                {/* A mixed cell's number is its Combos' average. */}
                {mixed && '≈'}
                {value}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** The Range's headline numbers and its split between pairs, suited and offsuit. */
export function Stats({ stats }: { stats: RangeStats }) {
  const { t, formatNumber } = useI18n()
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <section className="lab__stats" aria-label={t('lab.stats')}>
      <div className="lab__headline">
        <p className="lab__figure">
          <span className="lab__figure-value ro-mono">{t('lab.stats.percent', { percent: oneDecimal(stats.percent) })}</span>
          <span className="lab__label"> {t('lab.stats.percentOf')}</span>
        </p>
        <p className="lab__figure">
          <span className="lab__figure-value ro-mono">{oneDecimal(stats.combos)}</span>
          <span className="lab__label"> {t('lab.stats.combosOf', { total: TOTAL_COMBOS })}</span>
        </p>
      </div>
      <dl className="lab__breakdown">
        {HAND_CLASS_KINDS.map((kind) => {
          const { combos, of } = stats.byKind[kind]
          return (
            <div key={kind} className="lab__breakdown-row">
              <dt>{t(`lab.stats.kind.${kind}`)} </dt>
              <dd className="ro-mono">
                {oneDecimal(combos)} <span className="lab__muted">/ {of}</span>{' '}
              </dd>
              <dd className="lab__muted ro-mono">
                {stats.combos > 0 ? t('lab.stats.shareOfRange', { percent: oneDecimal((combos / stats.combos) * 100) }) : '—'}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

/**
 * The Range as text: a box to paste one from another tool and import it over
 * the matrix, refused whole at the first piece not understood, and the Range
 * in PioSolver / GTO Wizard notation, to copy.
 */
export function RangeText({ range, onImport }: { range: Range; onImport: (range: Range) => void }) {
  const { t } = useI18n()
  const [pasted, setPasted] = useState('')
  /** The piece that refused the last import, until the paste is edited. */
  const [unknown, setUnknown] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(copiedTimer.current), [])
  const exported = formatRange(range)

  const importPasted = () => {
    const parsed = parseRange(pasted)
    if ('unknown' in parsed) {
      setUnknown(parsed.unknown)
      return
    }
    onImport(parsed.range)
    setPasted('')
  }

  const copy = () =>
    void copyText(exported).then((done) => {
      // If copying is impossible the text stays on screen to copy by hand.
      if (!done) return
      setCopied(true)
      clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS)
    })

  return (
    <section className="lab__text" aria-label={t('lab.text')}>
      <span className="lab__label">{t('lab.text')}</span>
      <textarea
        className="lab__text-field ro-mono"
        rows={3}
        spellCheck={false}
        value={pasted}
        placeholder={t('lab.text.placeholder')}
        aria-label={t('lab.text.paste')}
        onChange={(event) => {
          setPasted(event.target.value)
          setUnknown(null)
        }}
      />
      {unknown !== null && (
        <p className="lab__failure" role="alert">
          {t('lab.text.unknown', { piece: unknown })}
        </p>
      )}
      <div className="lab__text-actions">
        <Button
          variant="secondary"
          size="compact"
          aria-label={t('lab.text.import')}
          disabledReason={pasted.trim() ? undefined : t('lab.text.nothingToImport')}
          onClick={importPasted}
        >
          <Icon name="import" size={14} />
          {t('lab.text.import')}
        </Button>
      </div>
      <textarea
        className="lab__text-field lab__text-export ro-mono"
        rows={3}
        readOnly
        spellCheck={false}
        value={exported}
        placeholder="—"
        aria-label={t('lab.text')}
      />
      <div className="lab__text-actions">
        <Button
          variant="secondary"
          size="compact"
          aria-label={t(copied ? 'lab.text.copied' : 'lab.text.copy')}
          disabledReason={exported ? undefined : t('lab.text.nothingToCopy')}
          onClick={copy}
        >
          <Icon name={copied ? 'success' : 'copy'} size={14} />
          {t(copied ? 'lab.text.copied' : 'lab.text.copy')}
        </Button>
      </div>
    </section>
  )
}
