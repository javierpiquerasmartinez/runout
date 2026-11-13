import { useI18n } from '../i18n'
import type { MouseEvent } from 'react'
import { isPlainClick, navigate } from '../routing'
import { Button } from '../ui/Button'
import { isFinished, stageOf, type BulkImport } from './bulkImports'
import './ImportsView.css'

/**
 * The Library's Importaciones view: the Account's Bulk Imports, newest
 * first, each with its files, where it is, its Hands and how it ended. One
 * not yet ended can be cancelled.
 */
export function ImportsView({ imports, onCancel }: { imports: BulkImport[]; onCancel: (id: string) => void }) {
  const { t } = useI18n()
  if (imports.length === 0) return <p className="imports__empty">{t('library.imports.empty')}</p>
  return (
    <>
    <div className="library-table__frame">
      <table className="library-table imports" aria-label={t('library.imports.title')}>
        <thead>
          <tr>
            <th scope="col">{t('library.imports.file')}</th>
            <th scope="col">{t('library.imports.status')}</th>
            <th scope="col">{t('library.imports.hands')}</th>
            <th scope="col">{t('library.imports.started')}</th>
            <th scope="col">{t('library.imports.result')}</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {imports.map((bulkImport) => (
            <ImportRow key={bulkImport.id} bulkImport={bulkImport} onCancel={onCancel} />
          ))}
        </tbody>
      </table>
    </div>
    <p className="imports__kept">{t('library.imports.kept')}</p>
    </>
  )
}

function ImportRow({ bulkImport, onCancel }: { bulkImport: BulkImport; onCancel: (id: string) => void }) {
  const { t, formatNumber, formatDate, formatTime } = useI18n()
  const stage = stageOf(bulkImport.status)
  const finished = isFinished(bulkImport.status)
  // How far it got: while it runs, and where a failed one stopped.
  const showsProgress = (!finished || stage === 'failed') && bulkImport.total !== null
  const startedAt = new Date(bulkImport.createdAt)
  const today = startedAt.toDateString() === new Date().toDateString()
  return (
    <tr className="imports__row" data-stage={stage}>
      <td className="imports__file ro-mono">{bulkImport.files.map((file) => file.name).join(', ')}</td>
      <td>
        <span className="imports__status" data-stage={stage}>
          {t(`library.imports.stage.${stage}`)}
        </span>
      </td>
      <td className="imports__hands ro-mono">
        {showsProgress && bulkImport.total !== null ? (
          <>
            {t('library.imports.progress', {
              processed: formatNumber(bulkImport.processed),
              total: formatNumber(bulkImport.total),
            })}
            <span
              className="imports__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={bulkImport.total}
              aria-valuenow={bulkImport.processed}
            >
              <span
                className="imports__bar-fill"
                style={{ width: `${bulkImport.total > 0 ? (100 * bulkImport.processed) / bulkImport.total : 0}%` }}
              />
            </span>
          </>
        ) : finished ? (
          t(bulkImport.imported === 1 ? 'library.count.one' : 'library.count.other', {
            count: formatNumber(bulkImport.imported),
          })
        ) : (
          '—'
        )}
      </td>
      <td className="imports__started">
        {today
          ? t('library.imports.today', { time: formatTime(startedAt, { hour: 'numeric', minute: '2-digit' }) })
          : formatDate(startedAt, { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')}
      </td>
      <td className="imports__result">{finished ? <Result bulkImport={bulkImport} /> : '—'}</td>
      <td className="imports__actions">
        {!finished && (
          <Button variant="ghost" size="compact" onClick={() => onCancel(bulkImport.id)}>
            {t('library.imports.cancel')}
          </Button>
        )}
      </td>
    </tr>
  )
}

/** How it ended: what was not added, or that nothing in the files was a Hand. */
function Result({ bulkImport }: { bulkImport: BulkImport }) {
  const { t, formatNumber } = useI18n()
  const notImported = Object.values(bulkImport.notImported).reduce((sum, count) => sum + count, 0)
  if (bulkImport.status === 'failed') return <>{t('library.imports.failed')}</>
  if (bulkImport.status === 'cancelled') return <>{t('library.imports.cancelled')}</>
  if (bulkImport.reason) return <>{t(`library.imports.reason.${bulkImport.reason}`)}</>
  if (bulkImport.imported + bulkImport.duplicates === 0 && bulkImport.status === 'completed') {
    return <>{t('library.imports.noneRecognised')}</>
  }
  const parts = [
    bulkImport.duplicates > 0 &&
      t(bulkImport.duplicates === 1 ? 'library.imports.duplicates.one' : 'library.imports.duplicates.other', {
        count: formatNumber(bulkImport.duplicates),
      }),
    notImported > 0 &&
      t(notImported === 1 ? 'library.imports.notRecognised.one' : 'library.imports.notRecognised.other', {
        count: formatNumber(notImported),
      }),
  ].filter(Boolean)
  return <>{parts.length > 0 ? parts.join(' · ') : '—'}</>
}

/**
 * Said in every Library view while an import is unfinished: how far it has
 * got, that the Results Graph and Stats may be missing Hands until it ends,
 * and the way to the Importaciones view.
 */
export function ImportsBanner({ bulkImport, href }: { bulkImport: BulkImport; href: string }) {
  const { t, formatNumber } = useI18n()
  const progress =
    bulkImport.total === null
      ? null
      : t('library.imports.progress', { processed: formatNumber(bulkImport.processed), total: formatNumber(bulkImport.total) })
  const [before, after] = (
    progress === null
      ? t('library.imports.banner.uncounted')
      : t(bulkImport.status === 'paused' ? 'library.imports.banner.paused' : 'library.imports.banner', { progress: '\u0000' })
  ).split('\u0000')
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return
    event.preventDefault()
    navigate(href)
  }
  return (
    <div className="imports-banner" role="status" aria-label={t('library.imports.banner.label')}>
      <span className="imports-banner__dot" aria-hidden="true" />
      <span className="imports-banner__text">
        {before}
        {progress !== null && <span className="ro-mono">{progress}</span>}
        {after}
      </span>
      <a className="imports-banner__link" href={href} onClick={open}>
        {t('library.imports.banner.see')}
      </a>
    </div>
  )
}
