import type { FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import type { Translator } from '../i18n/translator'
import { isImportableFile, MAX_BULK_IMPORT_BYTES, MAX_BULK_IMPORT_FILES, percentOf } from '../library/bulkUpload'
import { Wrapped } from '../library/ImportParts'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import type { ImportItem } from './importBatch'

/*
 * The import dialog's Bulk Import: its files, what will happen to them, and
 * the footer that uploads them.
 */

/**
 * A Bulk Import, which an import into the Library becomes when a file is too
 * large to read for a preview, or the Importer takes the one offered over
 * 2,000 Hands: its files are uploaded with no preview, and the import
 * service adds their Hands later.
 */
export type Bulk =
  | { phase: 'ready' }
  | { phase: 'uploading'; sent: number; total: number }
  | { phase: 'uploaded' }
  /** `upload` when storage refused a part; the same files continue on trying again. */
  | { phase: 'failed'; reason: FailureReason | 'upload' }

/** "840 KB", "21,4 MB", "1,2 GB", in the reader's language. */
function sizeLabel(bytes: number, formatNumber: Translator['formatNumber']): string {
  const units = [
    ['gigabyte', 1024 ** 3],
    ['megabyte', 1024 ** 2],
    ['kilobyte', 1024],
  ] as const
  const [unit, scale] = units.find(([, scale]) => bytes >= scale) ?? units[2]
  return formatNumber(bytes / scale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 })
}

/** A Bulk Import's files: their names and sizes, with nothing read from them. */
export function BulkFiles({
  files,
  lockedReason,
  onRemove,
}: {
  files: ImportItem[]
  /** Why its files can no longer be removed, once they are being uploaded. */
  lockedReason: string | undefined
  onRemove: (key: string) => void
}) {
  const { t, formatNumber } = useI18n()
  return (
    <section className="import-files" aria-labelledby="import-files-title">
      <h3 id="import-files-title" className="import-dialog__eyebrow">
        {t('import.bulk.files')}
      </h3>
      <ul className="import-files__list">
        {files.map((file) => {
          const importable = isImportableFile(file.name)
          return (
            <li key={file.key} className="import-file" data-status={importable ? 'ok' : 'failed'}>
              <Icon name={importable ? 'import' : 'error'} size={18} className="import-file__icon" />
              <div className="import-file__text">
                <span className="import-file__name">{file.name}</span>
                <span className="import-file__meta ro-mono">
                  {importable ? sizeLabel(file.size, formatNumber) : t('import.bulk.unsupported')}
                </span>
              </div>
              <IconButton
                icon="close"
                size="compact"
                label={t('import.file.remove', { name: file.name })}
                disabledReason={lockedReason}
                onClick={() => onRemove(file.key)}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** What happens to a Bulk Import, said before it starts: no preview, and an email at the end. */
export function BulkExplanation() {
  const { t } = useI18n()
  return (
    <section className="import-preview import-bulk" aria-labelledby="import-bulk-title">
      <h3 id="import-bulk-title" className="import-dialog__eyebrow">
        {t('import.bulk.title')}
      </h3>
      <p className="import-bulk__text">{t('import.bulk.noPreview')}</p>
      <p className="import-bulk__text">{t('import.bulk.how')}</p>
      <p className="import-bulk__text">{t('import.bulk.email')}</p>
    </section>
  )
}

/** The footer of a Bulk Import: what will be uploaded, how far the upload has got, and when it is safe to leave. */
export function BulkFooter({
  bulk,
  files,
  uploadingLabel,
  onCancel,
  onUpload,
  onDone,
}: {
  bulk: Bulk
  files: ImportItem[]
  uploadingLabel: string | undefined
  onCancel: () => void
  onUpload: () => void
  onDone: () => void
}) {
  const { t, formatNumber } = useI18n()
  const bytes = files.reduce((sum, file) => sum + file.size, 0)
  // Refused here, before anything is uploaded; the server checks the same.
  const refused = !files.every((file) => isImportableFile(file.name))
    ? t('import.bulk.unsupported')
    : files.length > MAX_BULK_IMPORT_FILES
      ? t('import.bulk.tooManyFiles', { limit: formatNumber(MAX_BULK_IMPORT_FILES) })
      : bytes > MAX_BULK_IMPORT_BYTES
        ? t('import.bulk.tooLarge')
        : undefined
  const failure =
    bulk.phase === 'failed'
      ? bulk.reason === 'upload' || bulk.reason === 'network'
        ? t('import.bulk.failed')
        : t(`reason.${bulk.reason}`)
      : undefined
  return (
    <footer className="import-dialog__footer">
      <div className="import-dialog__totals" role="status">
        <span className="import-dialog__ready">
          {bulk.phase === 'uploaded' ? (
            t('import.bulk.uploaded')
          ) : bulk.phase === 'uploading' ? (
            <Wrapped write={(percent) => t('import.bulk.uploading', { percent })}>
              <span className="ro-mono">{formatNumber(percentOf(bulk) / 100, { style: 'percent' })}</span>
            </Wrapped>
          ) : (
            <Wrapped
              write={(size) =>
                t(files.length === 1 ? 'import.bulk.ready.one' : 'import.bulk.ready.other', { count: formatNumber(files.length), size })
              }
            >
              <span className="ro-mono">{sizeLabel(bytes, formatNumber)}</span>
            </Wrapped>
          )}
        </span>
      </div>
      {bulk.phase === 'uploading' && (
        <div
          className="import-bulk__bar"
          role="progressbar"
          aria-label={t('import.bulk.progress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentOf(bulk)}
        >
          <div className="import-bulk__fill" style={{ width: `${percentOf(bulk)}%` }} />
        </div>
      )}
      {failure && (
        <p className="import-dialog__failure" role="alert">
          {failure}
        </p>
      )}
      <span className="import-dialog__spacer" />
      {bulk.phase === 'uploaded' ? (
        <Button variant="primary" onClick={onDone}>
          {t('import.bulk.done')}
        </Button>
      ) : (
        <>
          <Button variant="secondary" disabledReason={uploadingLabel} onClick={onCancel}>
            {t('import.cancel')}
          </Button>
          <Button variant="primary" disabledReason={uploadingLabel ?? refused} onClick={onUpload}>
            <Icon name="import" size={16} />
            {bulk.phase === 'failed' ? t('import.bulk.retry') : t('import.bulk.upload')}
          </Button>
        </>
      )}
    </footer>
  )
}
