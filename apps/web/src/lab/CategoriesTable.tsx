import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { CategoryRow } from './board'

/**
 * How the Range hits the Board in one block of Categories: one row per
 * Category that can happen on it, with its Combos, weighted by Frequency, and
 * its % of the live Combos.
 */
export function CategoriesTable<Category extends string>({
  title,
  heading,
  rows,
  nameOf,
}: {
  title: string
  /** The Category column's heading. */
  heading: string
  rows: CategoryRow<Category>[]
  nameOf: (category: Category) => ReactNode
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
          <tr key={row.category} className={row.combos === 0 ? 'lab__muted' : undefined}>
            <th scope="row">{nameOf(row.category)}</th>
            <td className="ro-mono">{oneDecimal(row.combos)}</td>
            <td className="ro-mono">{t('lab.analysis.sharePercent', { percent: oneDecimal(row.share) })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
