import { useI18n } from '../i18n'
import { stageOf, type BulkImport } from './bulkImports'
import './ImportsView.css'

/**
 * The Library's Importaciones view: the Account's Bulk Imports, newest
 * first, each with its files, where it is, its Hands and how it ended.
 */
export function ImportsView({ imports }: { imports: BulkImport[] }) {
  const { t } = useI18n()
  if (imports.length === 0) return <p className="imports__empty">{t('library.imports.empty')}</p>
  return (
    <div className="library-table__frame">
      <table className="library-table imports" aria-label={t('library.imports.title')}>
        <thead>
          <tr>
            <th scope="col">{t('library.imports.file')}</th>
            <th scope="col">{t('library.imports.status')}</th>
            <th scope="col">{t('library.imports.hands')}</th>
            <th scope="col">{t('library.imports.started')}</th>
            <th scope="col">{t('library.imports.result')}</th>
          </tr>
        </thead>
        <tbody>
          {imports.map((bulkImport) => (
            <ImportRow key={bulkImport.id} bulkImport={bulkImport} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ImportRow({ bulkImport }: { bulkImport: BulkImport }) {
  const { t, formatNumber, formatDate, formatTime } = useI18n()
  const stage = stageOf(bulkImport.status)
  const finished = stage === 'completed' || stage === 'failed' || stage === 'cancelled'
  const startedAt = new Date(bulkImport.createdAt)
  const today = startedAt.toDateString() === new Date().toDateString()
  return (
    <tr className="imports__row" data-stage={stage}>
      <td className="imports__file ro-mono">{bulkImport.files.map((file) => file.name).join(', ')}</td>
      <td className="imports__status">{t(`library.imports.stage.${stage}`)}</td>
      <td className="imports__hands ro-mono">
        {finished || bulkImport.total === null
          ? finished
            ? t(bulkImport.imported === 1 ? 'library.count.one' : 'library.count.other', {
                count: formatNumber(bulkImport.imported),
              })
            : '—'
          : t('library.imports.progress', {
              processed: formatNumber(bulkImport.processed),
              total: formatNumber(bulkImport.total),
            })}
      </td>
      <td className="imports__started">
        {today
          ? t('library.imports.today', { time: formatTime(startedAt, { hour: 'numeric', minute: '2-digit' }) })
          : formatDate(startedAt, { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')}
      </td>
      <td className="imports__result">{finished ? <Result bulkImport={bulkImport} /> : '—'}</td>
    </tr>
  )
}

/** How it ended: what was not added, or that nothing in the files was a Hand. */
function Result({ bulkImport }: { bulkImport: BulkImport }) {
  const { t, formatNumber } = useI18n()
  const notImported = Object.values(bulkImport.notImported).reduce((sum, count) => sum + count, 0)
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
