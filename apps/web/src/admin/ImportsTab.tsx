import { useCallback, useEffect, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { isFinished, stageOf } from '../library/bulkImports'
import { ImportProgress, Wrapped } from '../library/ImportParts'
import { useMoment, useNotAdded } from '../library/importWords'
import { RoomDialog } from '../room/RoomDialog'
import { Button } from '../ui/Button'
import { SegmentedControl } from '../ui/SegmentedControl'
import { BULK_IMPORT_FILTERS, nameOf, type AdminBulkImport, type BulkImportFilter, type BulkImportsPage } from './admin'
import { Badge } from './AdminPage'
import { AdminPagination } from './AdminPagination'
import { useAdminApi } from './useAdminApi'

type Tone = 'brass' | 'sync' | 'muted' | 'alert'

/**
 * The Importaciones tab: every Account's Bulk Imports, newest first, with
 * the failed and stalled ones a filter away. One not yet ended can be
 * cancelled, as its Importer would; one failed retried while its files are
 * kept. The text of Hands is never here.
 */
export function ImportsTab() {
  const { t } = useI18n()
  const admin = useAdminApi()
  const [filter, setFilter] = useState<BulkImportFilter>('all')
  const [pageNumber, setPageNumber] = useState(1)
  const [page, setPage] = useState<BulkImportsPage | null>(null)
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const [cancelling, setCancelling] = useState<AdminBulkImport | null>(null)

  const reload = useCallback(() => {
    const query = new URLSearchParams({ status: filter, page: String(pageNumber) })
    admin<BulkImportsPage>(`/bulk-imports?${query}`)
      .then((found) => {
        setPage(found)
        setFailure(null)
      })
      .catch((error: unknown) => setFailure(reasonOf(error)))
  }, [admin, filter, pageNumber])
  useEffect(reload, [reload])

  async function retry(bulkImport: AdminBulkImport) {
    try {
      await admin(`/bulk-imports/${encodeURIComponent(bulkImport.id)}/retry`, { method: 'POST' })
      reload()
    } catch (error) {
      setFailure(reasonOf(error))
    }
  }

  async function cancel(bulkImport: AdminBulkImport) {
    setCancelling(null)
    try {
      await admin(`/bulk-imports/${encodeURIComponent(bulkImport.id)}/cancel`, { method: 'POST' })
      reload()
    } catch (error) {
      setFailure(reasonOf(error))
    }
  }

  return (
    <section className="admin-section" aria-label={t('admin.tab.imports')}>
      <div className="admin-toolbar">
        <SegmentedControl
          label={t('admin.imports.filter')}
          options={BULK_IMPORT_FILTERS.map((value) => ({ value, label: t(`admin.imports.filter.${value}`) }))}
          value={filter}
          onChange={(value) => {
            setFilter(value)
            setPageNumber(1)
          }}
        />
        {page && <StorageGauge used={page.storage.used} threshold={page.storage.threshold} />}
      </div>
      {failure && (
        <p className="admin-notice" data-tone="alert" role="alert">
          {t(`reason.${failure}`)}
        </p>
      )}
      {page && page.imports.length === 0 && <p className="admin-notice">{t('admin.imports.none')}</p>}
      {page && page.imports.length > 0 && (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table admin-imports">
              <thead>
                <tr>
                  <th>{t('admin.imports.accountAndFile')}</th>
                  <th>{t('admin.imports.status')}</th>
                  <th>{t('admin.imports.hands')}</th>
                  <th>{t('admin.imports.started')}</th>
                  <th>{t('admin.imports.lastActivity')}</th>
                  <th>{t('admin.imports.reason')}</th>
                  <th>
                    <span className="ro-visually-hidden">{t('admin.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.imports.map((bulkImport) => (
                  <ImportRow
                    key={bulkImport.id}
                    bulkImport={bulkImport}
                    onCancel={() => setCancelling(bulkImport)}
                    onRetry={() => void retry(bulkImport)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={page.page}
            pageSize={page.pageSize}
            shown={page.imports.length}
            total={page.total}
            onGoTo={setPageNumber}
          />
        </>
      )}
      {cancelling && (
        <RoomDialog
          title={t('admin.imports.confirm.title')}
          body={t('admin.imports.confirm.body', { email: nameOf(cancelling.account) })}
          onClose={() => setCancelling(null)}
          actions={
            <Button variant="destructive" onClick={() => void cancel(cancelling)}>
              {t('admin.imports.confirm.cancel')}
            </Button>
          }
        />
      )}
    </section>
  )
}

function ImportRow({
  bulkImport,
  onCancel,
  onRetry,
}: {
  bulkImport: AdminBulkImport
  onCancel: () => void
  onRetry: () => void
}) {
  const { t, formatNumber, formatRelative } = useI18n()
  const moment = useMoment()
  const notAdded = useNotAdded()
  const finished = isFinished(bulkImport.status)
  const stalled = bulkImport.stalled && !finished
  const stage = stageOf(bulkImport.status)
  const tone: Tone = stalled || stage === 'failed' ? 'alert' : toneOf[stage]
  // How far it got: while it runs, and where a failed one stopped.
  const showsProgress = (!finished || stage === 'failed') && bulkImport.total !== null
  const lastActivity = new Date(bulkImport.lastActivityAt)
  const notAddedParts = notAdded(bulkImport)
  return (
    <tr>
      <td>
        <div className="admin-imports__primary">{nameOf(bulkImport.account)}</div>
        <div className="admin-imports__secondary">{bulkImport.files.map((file) => file.name).join(', ')}</div>
      </td>
      <td>
        <Badge tone={tone}>{stalled ? t('admin.imports.status.stalled') : t(`library.imports.stage.${stage}`)}</Badge>
      </td>
      <td className="admin-imports__hands">
        {showsProgress && bulkImport.total !== null ? (
          <ImportProgress
            className="admin-imports__primary"
            processed={bulkImport.processed}
            total={bulkImport.total}
            tone={tone === 'alert' || tone === 'brass' ? tone : 'muted'}
          />
        ) : finished ? (
          <>
            <div className="admin-imports__primary ro-mono">
              {t(bulkImport.imported === 1 ? 'library.count.one' : 'library.count.other', {
                count: formatNumber(bulkImport.imported),
              })}
            </div>
            {notAddedParts.length > 0 && <div className="admin-imports__secondary">{notAddedParts.join(' · ')}</div>}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="ro-mono">{moment(new Date(bulkImport.createdAt), { yesterday: true })}</td>
      {/* Still moving: how long ago. Ended or paused: when. */}
      <td className="ro-mono">
        {finished || stage === 'paused' ? moment(lastActivity, { yesterday: true }) : formatRelative(lastActivity)}
      </td>
      <td className="admin-imports__reason">
        <Reason bulkImport={bulkImport} stalled={stalled} />
      </td>
      <td className="admin-imports__actions">
        {!finished && (
          <Button size="compact" variant="ghost" onClick={onCancel}>
            {t('admin.imports.cancel')}
          </Button>
        )}
        {bulkImport.retryable && (
          <Button size="compact" variant="ghost" className="admin-imports__retry" onClick={onRetry}>
            {t('admin.imports.retry')}
          </Button>
        )}
      </td>
    </tr>
  )
}

const toneOf: Record<ReturnType<typeof stageOf>, Tone> = {
  uploading: 'brass',
  inProgress: 'brass',
  paused: 'muted',
  completed: 'sync',
  failed: 'alert',
  cancelled: 'muted',
}

/** Why it is where it is: no advance since when, storage, or the server's technical code. */
function Reason({ bulkImport, stalled }: { bulkImport: AdminBulkImport; stalled: boolean }) {
  const { t, formatTime } = useI18n()
  if (stalled) {
    return (
      <>
        {t('admin.imports.noProgressSince', {
          time: formatTime(new Date(bulkImport.lastActivityAt), { hour: 'numeric', minute: '2-digit' }),
        })}
      </>
    )
  }
  if (bulkImport.status === 'paused') return <>{t('admin.imports.storageFull')}</>
  if (bulkImport.status === 'failed' && bulkImport.failureCode) {
    // The import service gives up on a batch only after its last attempt.
    return (
      <Wrapped write={(code) => t('admin.imports.failedAfter', { code })}>
        <span className="ro-mono">{bulkImport.failureCode}</span>
      </Wrapped>
    )
  }
  if (bulkImport.reason) return <span className="ro-mono">{bulkImport.reason}</span>
  return <>—</>
}

const MB = 1024 * 1024

/**
 * The database's size against the threshold at which the storage guard
 * pauses Bulk Imports. At or past it, in the alert colour.
 */
function StorageGauge({ used, threshold }: { used: number; threshold: number }) {
  const { t, formatNumber } = useI18n()
  const sizes = t('admin.imports.storageOf', {
    used: formatNumber(Math.round(used / MB)),
    threshold: formatNumber(Math.round(threshold / MB)),
  })
  return (
    <div
      className="admin-storage"
      role="meter"
      aria-label={t('admin.imports.storage')}
      aria-valuemin={0}
      aria-valuemax={threshold}
      aria-valuenow={used}
      aria-valuetext={sizes}
    >
      <div className="admin-storage__label">
        <span>{t('admin.imports.storage')}</span>
        <span className="ro-mono">{sizes}</span>
      </div>
      <span className="admin-storage__bar" data-reached={used >= threshold || undefined}>
        <span className="admin-storage__fill" style={{ width: `${Math.min(100, (100 * used) / threshold)}%` }} />
      </span>
    </div>
  )
}
