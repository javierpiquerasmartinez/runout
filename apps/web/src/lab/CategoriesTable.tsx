import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { CategoryRow } from './board'

/**
 * How the Range hits the Board in one block of Categories: one row per
 * Category that can happen on it, with its Combos, weighted by Frequency, and
 * its % of the live Combos. A row is toggled in the selection by clicking it,
 * and lights up its Combos while hovered or focused.
 */
export function CategoriesTable<Category extends string>({
  title,
  heading,
  rows,
  nameOf,
  selected,
  onToggle,
  onHover,
}: {
  title: string
  /** The Category column's heading. */
  heading: string
  rows: CategoryRow<Category>[]
  nameOf: (category: Category) => ReactNode
  /** The Categories in the selection, of this table or any other. */
  selected: ReadonlySet<string>
  onToggle: (category: Category) => void
  /** The row under the pointer or the focus, or null once it leaves. */
  onHover: (category: Category | null) => void
}) {
  const { t, formatNumber } = useI18n()
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <table className="analysis__categories">
      <caption className="analysis__categories-title">{title}</caption>
      <thead>
        <tr>
          <th scope="col">{heading}</th>
          <th scope="col">{t('lab.analysis.combos')}</th>
          <th scope="col">{t('lab.analysis.share')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.category}
            className={row.combos === 0 ? 'lab__muted' : undefined}
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
            <td className="ro-mono">{oneDecimal(row.combos)}</td>
            <td className="ro-mono">{t('lab.analysis.sharePercent', { percent: oneDecimal(row.share) })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
