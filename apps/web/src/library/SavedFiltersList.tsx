import { useId } from 'react'
import { useI18n } from '../i18n'
import { Icon } from '../ui/Icon'
import type { SavedFilter } from './savedFilters'
import './LibraryPage.css'
import './SavedFilters.css'

/**
 * The "Biblioteca · Filtro guardado" board's side column list: the
 * Account's Saved Filters after its Tags, the applied one lit. Choosing one
 * applies it; choosing the applied one again drops it. "Guardar filtro" ends
 * the list while there is something to save.
 */
export function SavedFiltersList({
  savedFilters,
  applied,
  onApply,
  onSave,
}: {
  savedFilters: SavedFilter[]
  /** The id of the Saved Filter the filter names, if any. */
  applied: string | null
  onApply: (saved: SavedFilter) => void
  /** Without it there is nothing to save, and the list doesn't offer to. */
  onSave?: () => void
}) {
  const { t } = useI18n()
  const titleId = useId()
  if (savedFilters.length === 0 && !onSave) return null
  return (
    <div className="library__group" role="group" aria-labelledby={titleId}>
      <div className="library__group-head">
        <span id={titleId} className="library__group-title ro-mono">
          {t('library.savedFilters')}
        </span>
      </div>
      {savedFilters.map((saved) => (
        <button
          key={saved.id}
          type="button"
          className="library__collection saved-filters__item"
          aria-pressed={saved.id === applied}
          onClick={() => onApply(saved)}
        >
          <Icon name="saved-filter" size={14} />
          <span className="library__tag-name">{saved.name}</span>
        </button>
      ))}
      {onSave && (
        <button type="button" className="library__collection library__tag-new" onClick={onSave}>
          <Icon name="add" size={14} />
          {t('library.savedFilters.save')}
        </button>
      )}
    </div>
  )
}
