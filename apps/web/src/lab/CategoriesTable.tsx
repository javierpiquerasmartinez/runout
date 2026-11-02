import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { CategoryRow } from './board'

/**
 * How the Ranges hit the Board in one block of Categories: one row per
 * Category that can happen on it, with each side's Combos, weighted by
 * Frequency, and its % of that side's live Combos; against another side, only
 * the % of each, so the table fits beside the matrices. A row is toggled in the
 * selection by clicking it, and lights up its Combos while hovered or focused.
 */
export function CategoriesTable<Category extends string>({
  title,
  heading,
  sides,
  nameOf,
  selected,
  onToggle,
  onHover,
}: {
  title: string
  /** The Category column's heading. */
  heading: string
  /**
   * Each side's rows, under what the side is called (a heading when there are
   * two): all for the same Categories, in the same order, as the Board alone
   * decides which can happen.
   */
  sides: readonly { label: string; rows: CategoryRow<Category>[] }[]
  nameOf: (category: Category) => ReactNode
  /** The Categories in the selection, of this table or any other. */
  selected: ReadonlySet<string>
  onToggle: (category: Category) => void
  /** The row under the pointer or the focus, or null once it leaves. */
  onHover: (category: Category | null) => void
}) {
  const { t, formatNumber } = useI18n()
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const [{ rows }] = sides
  /** Against another side, a Category's Combos are left to the matrices' own. */
  const alone = sides.length === 1
  return (
    <table className="analysis__categories">
      <caption className="analysis__categories-title">{title}</caption>
      <thead>
        <tr>
          <th scope="col">{heading}</th>
          {sides.map((side, index) => [
            alone && (
              <th key={`combos-${index}`} scope="col">
                {t('lab.analysis.combos')}
              </th>
            ),
            <th key={`share-${index}`} scope="col">
              {t('lab.analysis.share')}
              {/* The columns follow the matrices' order: heard as whose they are, not seen. */}
              {!alone && <span className="analysis__sr-only"> {side.label}</span>}
            </th>,
          ])}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, at) => (
          <tr
            key={row.category}
            className={sides.every((side) => side.rows[at].combos === 0) ? 'lab__muted' : undefined}
            data-selected={selected.has(row.category) || undefined}
            onMouseEnter={() => onHover(row.category)}
            onMouseLeave={() => onHover(null)}
            // Anywhere on the row, its button included, and Enter or Space on the button.
            onClick={() => onToggle(row.category)}
          >
            <th scope="row">
              <button
                type="button"
                className="analysis__category"
                aria-pressed={selected.has(row.category)}
                onFocus={() => onHover(row.category)}
                onBlur={() => onHover(null)}
              >
                {nameOf(row.category)}
              </button>
            </th>
            {sides.map((side, index) => [
              alone && (
                <td key={`combos-${index}`} className="ro-mono">
                  {oneDecimal(side.rows[at].combos)}
                </td>
              ),
              <td key={`share-${index}`} className="ro-mono" data-side-start={index > 0 || undefined}>
                {/* The share drawn beside its number, for the eye only: the number says it. */}
                <span className="analysis__share-bar" aria-hidden="true">
                  <span style={{ width: `${side.rows[at].share}%` }} />
                </span>
                {t('lab.analysis.sharePercent', { percent: oneDecimal(side.rows[at].share) })}
              </td>,
            ])}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
