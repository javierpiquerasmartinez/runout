import { useMemo } from 'react'
import { useI18n } from '../i18n'
import { Card } from '../ui/Card'
import { IconButton } from '../ui/IconButton'
import { CATEGORIES, categoryNameKey, FLOP_CARDS, formatBoard, liveCombos, streetsBefore, tenAs10, type Category, type Narrowing } from './board'
import type { Range } from './range'

/** The Streets a Narrowing can be made on: every one but the river, the last. */
const STREETS = ['flop', 'turn'] as const

interface Step {
  street: (typeof STREETS)[number]
  cards: readonly string[]
  kept: readonly Category[]
  combos: number
  share: number
}

/**
 * One side's Narrowings so far, one step per Street before the Board's own:
 * the Board on that Street, the Categories kept (or everything, for a Street
 * dealt with nothing selected) and the Combos and % kept of the step before,
 * counted on that Street. Each step can be removed: that Street then keeps the
 * whole Range. Nothing is shown while the side has no Narrowing.
 */
export function NarrowingTrail({
  ranges,
  narrowings,
  board,
  dead,
  label,
  side,
  onRemove,
}: {
  /** The side's Range on each Street up to the Board's own, the flop's first: its rangesOnStreets. */
  ranges: readonly Range[]
  narrowings: readonly Narrowing[]
  board: readonly string[]
  dead: readonly string[]
  label: string
  /** The side's name, with two: it tells the two trails' remove buttons apart. */
  side?: string
  /** Removes the Narrowing of the Street at this index, the flop's first. */
  onRemove: (street: number) => void
}) {
  const { t, formatNumber } = useI18n()
  const streets = Math.min(streetsBefore(board.length), STREETS.length)
  const narrowed = narrowings.slice(0, streets).some((kept) => kept.length > 0)
  const steps = useMemo<Step[]>(() => {
    if (!narrowed) return []
    return STREETS.slice(0, streets).map((street, index) => {
      const cards = board.slice(0, FLOP_CARDS + index)
      // The Range on this Street, and on the next, which this Street's Narrowing made; counted with this Street's cards out.
      const out = [...cards, ...dead]
      const before = liveCombos(ranges[index], out)
      const after = liveCombos(ranges[index + 1], out)
      const kept = CATEGORIES.filter((category) => (narrowings[index] ?? []).includes(category))
      return { street, cards, kept, combos: after, share: before > 0 ? (after / before) * 100 : 0 }
    })
  }, [narrowed, streets, ranges, board, dead, narrowings])

  if (steps.length === 0) return null
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <section className="analysis__trail" aria-label={label}>
      <span className="lab__label">{label}</span>
      <ol className="analysis__trail-steps">
        {steps.map(({ street, cards, kept, combos, share }, index) => (
          <li key={street} className="analysis__trail-step">
            <span className="analysis__trail-board" role="img" aria-label={formatBoard(cards)}>
              {cards.map((card) => (
                <Card key={card} card={tenAs10(card)} size="list" />
              ))}
            </span>
            <div className="analysis__trail-text">
              <p className="lab__label">{t(`lab.analysis.trail.street.${street}`)}</p>
              <p className="analysis__trail-kept">
                {kept.length > 0 ? kept.map((category) => t(categoryNameKey(category))).join(', ') : t('lab.analysis.trail.everything')}
              </p>
              <p className="analysis__trail-share ro-mono">
                {t('lab.analysis.trail.share', { combos: oneDecimal(combos), percent: oneDecimal(share) })}
              </p>
            </div>
            {/* A Street that kept everything has nothing to remove. */}
            {kept.length > 0 && (
              <IconButton
                icon="close"
                size="compact"
                label={
                  side === undefined
                    ? t(`lab.analysis.trail.remove.${street}`)
                    : t('lab.analysis.trail.remove.side', { remove: t(`lab.analysis.trail.remove.${street}`), side })
                }
                onClick={() => onRemove(index)}
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
