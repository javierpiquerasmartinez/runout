import { useState } from 'react'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import {
  EMPTY_RANGE,
  HAND_CLASS_KINDS,
  HAND_CLASSES,
  handClassFrequency,
  rangeStats,
  TOTAL_COMBOS,
  withHandClass,
  type HandClass,
  type Range,
  type RangeStats,
} from './range'
import './LabRangesPage.css'

/**
 * The Lab's Ranges (variant A of the prototype): a side column, the matrix in
 * the main column and the stats to its right. For now a click puts a Hand
 * Class in the Range at 100 % or takes it out, and nothing is saved.
 */
export function LabRangesPage() {
  const { t } = useI18n()
  const [range, setRange] = useState<Range>(EMPTY_RANGE)
  const toggle = (handClass: HandClass) =>
    setRange((current) => withHandClass(current, handClass, handClassFrequency(current, handClass).value === 100 ? 0 : 100))

  return (
    <div className="lab">
      <AppHeader current="lab" />
      <div className="lab__body">
        <aside className="lab__side">
          <Button variant="secondary" size="compact" onClick={() => setRange(EMPTY_RANGE)}>
            <Icon name="add" size={14} />
            {t('lab.ranges.new')}
          </Button>
        </aside>
        <main className="lab__main">
          <div className="lab__titlebar">
            <h1 className="lab__title ro-serif">{t('lab.ranges.title')}</h1>
            <span className="lab__spacer" />
            <Button variant="secondary" size="compact" onClick={() => setRange(EMPTY_RANGE)}>
              {t('lab.ranges.clear')}
            </Button>
          </div>
          <div className="lab__work">
            <RangeMatrix range={range} onToggle={toggle} />
            <Stats stats={rangeStats(range)} />
          </div>
        </main>
      </div>
    </div>
  )
}

/** The 13×13 matrix, each cell labelled with its Hand Class and filled when it is in the Range. */
function RangeMatrix({ range, onToggle }: { range: Range; onToggle: (handClass: HandClass) => void }) {
  const { t } = useI18n()
  return (
    <div className="lab__matrix" role="group" aria-label={t('lab.matrix')}>
      {HAND_CLASSES.map((handClass) => {
        const { value } = handClassFrequency(range, handClass)
        return (
          <button
            key={handClass.name}
            type="button"
            className="lab__cell ro-mono"
            data-kind={handClass.kind}
            data-in={value > 0 || undefined}
            aria-pressed={value > 0}
            onClick={() => onToggle(handClass)}
          >
            <span className="lab__cell-fill" style={{ width: `${value}%` }} />
            <span className="lab__cell-label">{handClass.name}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The Range's headline numbers and its split between pairs, suited and offsuit. */
function Stats({ stats }: { stats: RangeStats }) {
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
