import { useI18n } from '../i18n'
import type { DiscardReason } from '../room/importBatch'
import type { BulkImport } from './bulkImports'

/*
 * How the Library's Importaciones view and the Administration's
 * Importaciones tab word a Bulk Import alike.
 */

/** The reasons a Hand is not imported that the import dialog names, as `notImported` counts them. */
const NOT_IMPORTED: Exclude<DiscardReason, 'duplicate'>[] = [
  'unrecognised-format',
  'not-cash-holdem',
  'too-many-seats',
  'no-hero',
  'malformed',
  'run-it-twice',
]

/**
 * What was not added, each apart: "1.910 duplicadas", "42 no reconocidas",
 * then every other reason by the import dialog's name for it. Those that did
 * not fit a full Library are said where it ended, not here.
 */
export function useNotAdded(): (bulkImport: Pick<BulkImport, 'duplicates' | 'notImported'>) => string[] {
  const { t, formatNumber } = useI18n()
  return ({ duplicates, notImported }) => [
    ...(duplicates > 0
      ? [t(duplicates === 1 ? 'library.imports.duplicates.one' : 'library.imports.duplicates.other', { count: formatNumber(duplicates) })]
      : []),
    ...NOT_IMPORTED.flatMap((reason) => {
      const count = notImported[reason] ?? 0
      if (count === 0) return []
      if (reason === 'unrecognised-format') {
        return [t(count === 1 ? 'library.imports.notRecognised.one' : 'library.imports.notRecognised.other', { count: formatNumber(count) })]
      }
      return [t('library.imports.notImported', { reason: t(`import.discarded.reason.${reason}`), count: formatNumber(count) })]
    }),
  ]
}

/** "Hoy, 9:12", "Ayer, 22:05" when asked for, or "2 nov 2026", as the boards word a moment. */
export function useMoment(): (date: Date, options?: { yesterday?: boolean }) => string {
  const { t, formatDate, formatTime } = useI18n()
  return (date, { yesterday = false } = {}) => {
    const time = formatTime(date, { hour: 'numeric', minute: '2-digit' })
    const today = new Date()
    const dayBefore = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return t('library.imports.today', { time })
    if (yesterday && date.toDateString() === dayBefore.toDateString()) return t('admin.imports.yesterday', { time })
    return formatDate(date, { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
  }
}
