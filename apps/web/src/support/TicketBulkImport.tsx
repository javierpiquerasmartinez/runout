import { useI18n } from '../i18n'
import { isFinished, stageOf } from '../library/bulkImports'
import { useMoment } from '../library/importWords'
import { Icon } from '../ui/Icon'
import type { TicketBulkImport } from './support'
import './Support.css'

/**
 * The Bulk Import a Support Ticket points at, as one card: its files, how
 * it stands, and its Hands, where a failed one stopped. The Account's side
 * says when it was started; the panel's says why it failed instead, given
 * its `failureCode`.
 */
export function TicketBulkImportCard({
  bulkImport,
  failureCode,
}: {
  bulkImport: TicketBulkImport
  /** The panel's: why it failed, a technical code. Leave it out on the Account's side. */
  failureCode?: string | null
}) {
  const { t, formatNumber } = useI18n()
  const moment = useMoment()
  const stage = stageOf(bulkImport.status)
  const files = bulkImport.files.map((file) => file.name).join(', ')
  // How far it got: while it runs, and where a failed one stopped.
  const showsProgress = (!isFinished(bulkImport.status) || stage === 'failed') && bulkImport.total !== null
  const hands =
    showsProgress && bulkImport.total !== null
      ? t('support.bulkImport.progress', {
          processed: formatNumber(bulkImport.processed),
          total: formatNumber(bulkImport.total),
        })
      : t(bulkImport.imported === 1 ? 'library.count.one' : 'library.count.other', { count: formatNumber(bulkImport.imported) })
  const detail =
    failureCode === undefined
      ? [moment(new Date(bulkImport.createdAt)), hands]
      : [hands, ...(failureCode ? [t('admin.imports.failedAfter', { code: failureCode })] : [])]
  return (
    <div className="support-import" role="group" aria-label={files}>
      <span className="support-import__icon" aria-hidden="true">
        <Icon name="file" size={18} />
      </span>
      <div className="support-import__body">
        <div className="support-import__head">
          <span className="support-import__name">{files}</span>
          <span className="support-badge" data-tone={stage === 'failed' ? 'alert' : stage === 'completed' ? 'sync' : undefined}>
            {t(`library.imports.stage.${stage}`)}
          </span>
        </div>
        <div className="support-import__detail">{detail.join(' · ')}</div>
      </div>
    </div>
  )
}
