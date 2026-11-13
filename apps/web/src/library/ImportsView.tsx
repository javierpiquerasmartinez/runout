import { useI18n } from '../i18n'
import type { MouseEvent } from 'react'
import { isPlainClick, navigate } from '../routing'
import { Button } from '../ui/Button'
import { isFinished, stageOf, type BulkImport } from './bulkImports'
import { ImportProgress, Wrapped } from './ImportParts'
import { useMoment, useNotAdded } from './importWords'
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
  const { t, formatNumber } = useI18n()
  const moment = useMoment()
  const stage = stageOf(bulkImport.status)
  const finished = isFinished(bulkImport.status)
  // How far it got: while it runs, and where a failed one stopped.
  const showsProgress = (!finished || stage === 'failed') && bulkImport.total !== null
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
          <ImportProgress processed={bulkImport.processed} total={bulkImport.total} tone={stage === 'failed' ? 'alert' : 'brass'} />
        ) : finished ? (
          t(bulkImport.imported === 1 ? 'library.count.one' : 'library.count.other', {
            count: formatNumber(bulkImport.imported),
          })
        ) : (
          '—'
        )}
      </td>
      <td className="imports__started ro-mono">{moment(new Date(bulkImport.createdAt))}</td>
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

/** How it ended: what was not added, or why it ended short. */
function Result({ bulkImport }: { bulkImport: BulkImport }) {
  const { t, formatNumber } = useI18n()
  const notAdded = useNotAdded()
  if (bulkImport.status === 'failed') return <>{t('library.imports.failed')}</>
  if (bulkImport.status === 'cancelled') return <>{t('library.imports.cancelled')}</>
  if (bulkImport.reason === 'library-full') {
    const leftOut = bulkImport.notImported['library-full'] ?? 0
    return (
      <>
        {t(leftOut === 1 ? 'library.imports.reason.library-full.one' : 'library.imports.reason.library-full.other', {
          count: formatNumber(leftOut),
        })}
      </>
    )
  }
  if (bulkImport.reason) return <>{t(`library.imports.reason.${bulkImport.reason}`)}</>
  const parts = notAdded(bulkImport)
  return <>{parts.length > 0 ? parts.join(' · ') : '—'}</>
}

/**
 * Said in every Library view while an import is underway: how far it has
 * got, or that it is paused, that the Results Graph and Stats may be missing
 * Hands until it ends, and the way to the Importaciones view.
 */
export function ImportsBanner({ bulkImport, href }: { bulkImport: BulkImport; href: string }) {
  const { t, formatNumber } = useI18n()
  const paused = bulkImport.status === 'paused'
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return
    event.preventDefault()
    navigate(href)
  }
  return (
    <div
      className="imports-banner"
      role="status"
      aria-label={t(paused ? 'library.imports.banner.label.paused' : 'library.imports.banner.label')}
    >
      <span className="imports-banner__dot" aria-hidden="true" />
      <span className="imports-banner__text">
        {bulkImport.total === null ? (
          t(paused ? 'library.imports.banner.paused.uncounted' : 'library.imports.banner.uncounted')
        ) : (
          <Wrapped write={(progress) => t(paused ? 'library.imports.banner.paused' : 'library.imports.banner', { progress })}>
            <span className="ro-mono">
              {t('library.imports.progress', { processed: formatNumber(bulkImport.processed), total: formatNumber(bulkImport.total) })}
            </span>
          </Wrapped>
        )}
      </span>
      <a className="imports-banner__link" href={href} onClick={open}>
        {t('library.imports.banner.see')}
      </a>
    </div>
  )
}
