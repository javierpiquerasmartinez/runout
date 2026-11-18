import { useId, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useBuildsFilters } from './buildsFilters'
import { CollectionName } from './LibraryTags'
import type { SavedFilter } from './savedFilters'
import './LibraryPage.css'
import './SavedFilters.css'

/**
 * The "Biblioteca · Filtro guardado" board's side column list: the
 * Account's Saved Filters after its Tags, the applied one lit. Choosing one
 * applies it; choosing the applied one again drops it. "Guardar filtro" ends
 * the list while there is something to save. The pencil renames and
 * deletes them, as the Tags' does. At phone width (`useBuildsFilters`)
 * they are only applied: a line ends the list instead, saying they are
 * created and edited on a computer.
 */
export function SavedFiltersList({
  savedFilters,
  applied,
  onApply,
  onSave,
  onRename,
  onDelete,
}: {
  savedFilters: SavedFilter[]
  /** The id of the Saved Filter the filter names, if any. */
  applied: string | null
  onApply: (saved: SavedFilter) => void
  /** Without it there is nothing to save, and the list doesn't offer to. */
  onSave?: () => void
  /** Each of these rejects with the server's reason when it refuses. */
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const { t } = useI18n()
  const titleId = useId()
  const [editing, setEditing] = useState(false)
  // The Saved Filter whose deletion waits for a second click.
  const [deleting, setDeleting] = useState<string | null>(null)
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const builds = useBuildsFilters()
  // Narrowed to a phone mid-edit, the list goes back to applying them.
  if (!builds && (editing || deleting !== null)) {
    setEditing(false)
    setDeleting(null)
  }
  if (savedFilters.length === 0 && !(builds && onSave)) return null

  // Any refusal is said under the list, whichever change it was.
  const attempt = (change: Promise<void>) =>
    change.then(
      () => {
        setFailure(null)
        return true
      },
      (error: unknown) => {
        setFailure(reasonOf(error))
        return false
      },
    )

  return (
    <div className="library__group" role="group" aria-labelledby={titleId}>
      <div className="library__group-head">
        <span id={titleId} className="library__group-title ro-mono">
          {t('library.savedFilters')}
        </span>
        {builds &&
          savedFilters.length > 0 &&
          (editing ? (
            <button
              type="button"
              className="library__group-action"
              onClick={() => {
                setEditing(false)
                setDeleting(null)
                setFailure(null)
              }}
            >
              {t('library.savedFilters.done')}
            </button>
          ) : (
            <IconButton
              icon="edit"
              size="compact"
              className="library__group-edit"
              label={t('library.savedFilters.edit')}
              onClick={() => setEditing(true)}
            />
          ))}
      </div>
      {savedFilters.map((saved) =>
        !editing ? (
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
        ) : deleting === saved.id ? (
          <div key={saved.id} className="library__tag-confirm">
            <button
              type="button"
              className="library__tag-delete"
              onClick={() => void attempt(onDelete(saved.id)).then(() => setDeleting(null))}
            >
              {t('library.savedFilters.confirmDelete', { name: saved.name })}
            </button>
            <button type="button" className="library__group-action" onClick={() => setDeleting(null)}>
              {t('library.savedFilters.cancel')}
            </button>
          </div>
        ) : (
          <div key={saved.id} className="library__tag-edit">
            <Icon name="saved-filter" size={14} />
            <CollectionName
              label={t('library.savedFilters.rename', { name: saved.name })}
              initial={saved.name}
              onSubmit={(name) => (name === saved.name ? Promise.resolve(true) : attempt(onRename(saved.id, name)))}
            />
            <IconButton
              icon="delete"
              size="compact"
              label={t('library.savedFilters.delete', { name: saved.name })}
              onClick={() => setDeleting(saved.id)}
            />
          </div>
        ),
      )}
      {!builds && <span className="saved-filters__elsewhere">{t('library.savedFilters.elsewhere')}</span>}
      {builds && onSave && (
        <button type="button" className="library__collection library__tag-new" onClick={onSave}>
          <Icon name="add" size={14} />
          {t('library.savedFilters.save')}
        </button>
      )}
      {failure && (
        <p className="library__tag-failure" role="alert">
          {t(`reason.${failure}`)}
        </p>
      )}
    </div>
  )
}
