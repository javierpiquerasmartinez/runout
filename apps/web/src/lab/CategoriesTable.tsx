import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { CategoryRow } from './board'

/**
 * How the Ranges hit the Board in one block of Categories: one row per
 * Category that can happen on it, with each side's Combos, weighted by
 * Frequency, and its % of that side's live Combos. A row is toggled in the
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
  return (
    <table className="analysis__categories">
      <caption className="analysis__categories-title">{title}</caption>
      <thead>
        {sides.length > 1 && (
          <tr>
            <td />
            {sides.map((side, index) => (
              <th key={index} scope="colgroup" colSpan={2} className="analysis__categories-side">
                {side.label}
              </th>
            ))}
          </tr>
        )}
        <tr>
          <th scope="col">{heading}</th>
          {sides.map((_, index) => [
            <th key={`combos-${index}`} scope="col">
              {t('lab.analysis.combos')}
            </th>,
            <th key={`share-${index}`} scope="col">
              {t('lab.analysis.share')}
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
              <td key={`combos-${index}`} className="ro-mono" data-side-start={index > 0 || undefined}>
                {oneDecimal(side.rows[at].combos)}
              </td>,
              <td key={`share-${index}`} className="ro-mono">
                {t('lab.analysis.sharePercent', { percent: oneDecimal(side.rows[at].share) })}
              </td>,
            ])}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
