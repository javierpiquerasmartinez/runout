import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { Button } from '../ui/Button'
import { LengthCount } from '../ui/LengthCount'
import { TextField } from '../ui/TextField'
import type { LibraryFilter } from './libraryFilter'
import { criterionSummaries, definitionOf, inBranchOrder, type Branch } from './moreFilterBranches'
import { SAVED_FILTER_NAME_MAX, savedCriteriaOf, type SavedFilter } from './savedFilters'
import { STAT_TILES } from './stats'
import './SavedFilters.css'

/** The refusals that are about the name, said under it; any other is said for the whole dialog. */
const NAME_REASONS: FailureReason[] = ['invalid-saved-filter-name', 'saved-filter-name-taken']

/**
 * The "Biblioteca · Guardar un filtro" board: a name for what Más filtros
 * holds, a list of what it keeps, by branch, and a note on what it leaves
 * out. Saved, it is handed back to be applied.
 */
export function SaveFilterDialog({
  filter,
  onClose,
  onSaved,
}: {
  filter: LibraryFilter
  onClose: () => void
  onSaved: (saved: SavedFilter) => void
}) {
  const { t } = useI18n()
  const { token } = useIdentity()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const keepsId = useId()
  const [name, setName] = useState('')
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    return () => element.close()
  }, [])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (name.trim() === '') return setFailure('invalid-saved-filter-name')
    setBusy(true)
    setFailure(null)
    try {
      onSaved(
        await api<SavedFilter>('/library/saved-filters', {
          token,
          method: 'POST',
          body: { name: name.trim(), criteria: savedCriteriaOf(filter) },
        }),
      )
    } catch (caught) {
      setFailure(reasonOf(caught))
      setBusy(false)
    }
  }

  const nameFailure = failure && NAME_REASONS.includes(failure) ? t(`reason.${failure}`) : undefined
  return (
    <dialog
      ref={dialog}
      className="save-filter"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape closes through the Library, which unmounts the dialog.
        event.preventDefault()
        onClose()
      }}
    >
      <form className="save-filter__form" onSubmit={save} noValidate>
        <h2 id={titleId} className="save-filter__title ro-serif">
          {t('library.saveFilter.title')}
        </h2>
        <div className="save-filter__field">
          <TextField
            label={t('library.saveFilter.name')}
            maxLength={SAVED_FILTER_NAME_MAX}
            value={name}
            error={nameFailure}
            autoFocus
            onChange={(event) => {
              setName(event.target.value)
              setFailure(null)
            }}
          />
          <LengthCount length={name.length} max={SAVED_FILTER_NAME_MAX} besideError={nameFailure !== undefined} />
        </div>
        <div className="save-filter__field">
          <span className="save-filter__label" id={keepsId}>
            {t('library.saveFilter.keeps')}
          </span>
          <ul className="save-filter__keeps" aria-labelledby={keepsId}>
            {keptLines(filter, t).map((line) => (
              <li key={line.branch}>
                {t('library.saveFilter.line', { branch: t(`library.moreFilters.branch.${line.branch}`), criteria: line.criteria })}
              </li>
            ))}
          </ul>
        </div>
        <p className="save-filter__note">{t('library.saveFilter.leavesOut')}</p>
        {failure && !nameFailure && (
          <p role="alert" className="save-filter__failure">
            {t(`reason.${failure}`)}
          </p>
        )}
        <div className="save-filter__actions">
          <Button variant="secondary" onClick={onClose}>
            {t('library.saveFilter.cancel')}
          </Button>
          <Button type="submit" variant="primary" aria-busy={busy || undefined}>
            {t('library.saveFilter.submit')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}

/** What the filter's criteria say, one line per branch in the panel's order, the Stat's last. */
function keptLines(filter: LibraryFilter, t: ReturnType<typeof useI18n>['t']): { branch: Branch; criteria: string }[] {
  const summaries = criterionSummaries(filter.facts, t)
  const lines: { branch: Branch; criteria: string[] }[] = []
  inBranchOrder(filter.facts).forEach((criterion, index) => {
    const branch = definitionOf(criterion.fact)!.branch
    const last = lines.at(-1)
    if (last?.branch === branch) last.criteria.push(summaries[index])
    else lines.push({ branch, criteria: [summaries[index]] })
  })
  if (filter.stat) {
    const stat = filter.stat
    lines.push({
      branch: 'stat',
      criteria: [
        t(`library.stats.chip.${stat.side}`, { stat: STAT_TILES.find((tile) => tile.key === stat.key)?.abbreviation ?? stat.key }),
      ],
    })
  }
  return lines.map((line) => ({ branch: line.branch, criteria: line.criteria.join(' · ') }))
}
