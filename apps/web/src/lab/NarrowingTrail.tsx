import { useMemo } from 'react'
import { useI18n, type MessageKey } from '../i18n'
import { Card } from '../ui/Card'
import { IconButton } from '../ui/IconButton'
import {
  COMBINATION_DRAWS,
  DRAWS,
  FLOP_CARDS,
  formatBoard,
  liveCombos,
  MADE_HANDS,
  rangeOnStreet,
  tenAs10,
  type CombinationDraw,
  type Draw,
  type DrawOptions,
  type MadeHand,
  type Narrowing,
} from './board'
import type { Range } from './range'

/** Every Category id in the tables' order, each with the key of its name. */
const CATEGORY_NAMES = new Map<string, MessageKey>([
  ...MADE_HANDS.map((id: MadeHand) => [id, `lab.analysis.madeHand.${id}`] as const),
  ...DRAWS.map((id: Draw) => [id, `lab.analysis.draw.${id}`] as const),
  ...COMBINATION_DRAWS.map((id: CombinationDraw) => [id, `lab.analysis.combinationDraw.${id}`] as const),
])
const CATEGORY_ORDER = [...CATEGORY_NAMES.keys()]

/** The Streets a Narrowing can be made on: every one but the river, the last. */
const STREETS = ['flop', 'turn'] as const

interface Step {
  street: (typeof STREETS)[number]
  cards: readonly string[]
  kept: Narrowing
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
  range,
  narrowings,
  board,
  dead,
  options,
  label,
  side,
  onRemove,
}: {
  /** The side's Range, before any Narrowing. */
  range: Range
  narrowings: readonly Narrowing[]
  board: readonly string[]
  dead: readonly string[]
  options: DrawOptions
  label: string
  /** The side's name, with two: it tells the two trails' remove buttons apart. */
  side?: string
  /** Removes the Narrowing of the Street at this index, the flop's first. */
  onRemove: (street: number) => void
}) {
  const { t, formatNumber } = useI18n()
  const streets = Math.max(0, Math.min(board.length - FLOP_CARDS, STREETS.length))
  const narrowed = narrowings.slice(0, streets).some((kept) => kept.length > 0)
  const steps = useMemo<Step[]>(() => {
    if (!narrowed) return []
    return STREETS.slice(0, streets).map((street, index) => {
      const cards = board.slice(0, FLOP_CARDS + index)
      // Measured on the next Street's Board, which applies every Narrowing given; counted with this Street's cards out.
      const next = board.slice(0, FLOP_CARDS + index + 1)
      const out = [...cards, ...dead]
      const before = liveCombos(rangeOnStreet(range, next, dead, narrowings.slice(0, index), options), out)
      const after = liveCombos(rangeOnStreet(range, next, dead, narrowings.slice(0, index + 1), options), out)
      const kept = [...(narrowings[index] ?? [])].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))
      return { street, cards, kept, combos: after, share: before > 0 ? (after / before) * 100 : 0 }
    })
  }, [narrowed, streets, range, board, dead, narrowings, options])

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
                {kept.length > 0
                  ? kept.flatMap((category) => {
                      const name = CATEGORY_NAMES.get(category)
                      return name ? [t(name)] : []
                    }).join(', ')
                  : t('lab.analysis.trail.everything')}
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
