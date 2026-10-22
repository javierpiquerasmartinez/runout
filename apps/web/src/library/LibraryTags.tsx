import { useId, useState, type FormEvent } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import type { Tag } from './library'

/**
 * The "Biblioteca" board's Tags in the sidebar: each of the Account's Tags
 * with how many Hands carry it. Choosing Tags narrows the Library to the
 * Hands carrying any of them. New ones are made here, and, while editing,
 * renamed and deleted (the board has no editing; it is added here).
 */
export function LibraryTags({
  tags,
  chosen,
  onToggle,
  onCreate,
  onRename,
  onDelete,
}: {
  tags: Tag[]
  /** The ids of the Tags the filter keeps. */
  chosen: string[]
  onToggle: (tagId: string) => void
  /** Each of these rejects with the server's reason when it refuses. */
  onCreate: (name: string) => Promise<void>
  onRename: (tagId: string, name: string) => Promise<void>
  onDelete: (tagId: string) => Promise<void>
}) {
  const { t } = useI18n()
  const titleId = useId()
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  // The Tag whose deletion waits for a second click.
  const [deleting, setDeleting] = useState<string | null>(null)
  const [failure, setFailure] = useState<FailureReason | null>(null)

  // Any refusal is said under the Tags, whichever change it was.
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
          {t('library.tags')}
        </span>
        {tags.length > 0 &&
          (editing ? (
            <button
              type="button"
              className="library__group-action"
              onClick={() => {
                setEditing(false)
                setDeleting(null)
              }}
            >
              {t('library.tag.done')}
            </button>
          ) : (
            <IconButton
              icon="edit"
              size="compact"
              className="library__group-edit"
              label={t('library.tag.edit')}
              onClick={() => setEditing(true)}
            />
          ))}
      </div>
      {tags.map((tag) =>
        !editing ? (
          <button
            key={tag.id}
            type="button"
            className="library__collection library__tag"
            aria-pressed={chosen.includes(tag.id)}
            onClick={() => onToggle(tag.id)}
          >
            <TagSwatch tagId={tag.id} />
            <span className="library__tag-name">{tag.name}</span>
            <span className="library__collection-count ro-mono">{tag.hands}</span>
          </button>
        ) : deleting === tag.id ? (
          <div key={tag.id} className="library__tag-confirm">
            <button
              type="button"
              className="library__tag-delete"
              onClick={() => void attempt(onDelete(tag.id)).then(() => setDeleting(null))}
            >
              {t(tag.hands === 1 ? 'library.tag.confirmDelete.one' : 'library.tag.confirmDelete.other', {
                name: tag.name,
                count: tag.hands,
              })}
            </button>
            <button type="button" className="library__group-action" onClick={() => setDeleting(null)}>
              {t('library.tag.cancel')}
            </button>
          </div>
        ) : (
          <div key={tag.id} className="library__tag-edit">
            <TagSwatch tagId={tag.id} />
            <TagName
              label={t('library.tag.rename', { name: tag.name })}
              initial={tag.name}
              onSubmit={(name) => (name === tag.name ? Promise.resolve(true) : attempt(onRename(tag.id, name)))}
            />
            <IconButton
              icon="delete"
              size="compact"
              label={t('library.tag.delete', { name: tag.name })}
              onClick={() => setDeleting(tag.id)}
            />
          </div>
        ),
      )}
      {creating ? (
        <div className="library__tag-edit">
          <Icon name="add" size={14} />
          <TagName
            label={t('library.tag.name')}
            initial=""
            autoFocus
            onSubmit={(name) => attempt(onCreate(name)).then((created) => created && setCreating(false))}
            onCancel={() => {
              setCreating(false)
              setFailure(null)
            }}
          />
        </div>
      ) : (
        <button type="button" className="library__collection library__tag-new" onClick={() => setCreating(true)}>
          <Icon name="add" size={14} />
          {t('library.tag.new')}
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

/** A Tag's name being written: Enter keeps it, Escape leaves it. */
function TagName({
  label,
  initial,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  label: string
  initial: string
  autoFocus?: boolean
  onSubmit: (name: string) => Promise<unknown>
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() !== '') void onSubmit(name.trim())
  }
  return (
    <form className="library__tag-form" onSubmit={submit}>
      <input
        className="library__tag-input"
        aria-label={label}
        value={name}
        maxLength={40}
        autoFocus={autoFocus}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          setName(initial)
          onCancel?.()
        }}
      />
    </form>
  )
}

/** The Tag's colour square, the same wherever the Tag is shown. */
function TagSwatch({ tagId }: { tagId: string }) {
  return <span className="library__tag-swatch" data-colour={tagColour(tagId)} aria-hidden="true" />
}

/** One of the four colours the board gives Tags, kept by the Tag whatever its name or place. */
function tagColour(tagId: string): number {
  let hash = 0
  for (const char of tagId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return (hash % 4) + 1
}

/**
 * Tags for the selected Hands: each of the Account's Tags, ticked when every
 * selected Hand carries it and half-ticked when only some do. Ticking puts
 * it on all of them; unticking takes it off all of them.
 */
export function TagSelection({
  tags,
  selected,
  onSet,
}: {
  tags: Tag[]
  /** The selected Hands, with the Tags each carries. */
  selected: { id: string; tags: Pick<Tag, 'id'>[] }[]
  /** Rejects with the server's reason when it refuses. */
  onSet: (tagId: string, handIds: string[], attached: boolean) => Promise<void>
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const menuId = useId()
  const label = t('library.tagSelected')
  return (
    <div
      className="library__tag-selection"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <Button variant="secondary" aria-label={label} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>
        <Icon name="tag" size={16} />
        {t('library.tags')}
      </Button>
      {open && (
        <div id={menuId} className="library__tag-menu" role="group" aria-label={label}>
          {tags.length === 0 && <p className="library__tag-menu-empty">{t('library.tagSelected.none')}</p>}
          {tags.map((tag) => {
            const carrying = selected.filter((hand) => hand.tags.some((each) => each.id === tag.id)).length
            const all = carrying === selected.length
            return (
              <label key={tag.id} className="library__tag-option">
                <input
                  type="checkbox"
                  checked={all}
                  ref={(input) => {
                    if (input) input.indeterminate = carrying > 0 && !all
                  }}
                  onChange={() =>
                    onSet(
                      tag.id,
                      selected.map((hand) => hand.id),
                      !all,
                    ).then(
                      () => setFailure(null),
                      (error: unknown) => setFailure(reasonOf(error)),
                    )
                  }
                />
                <TagSwatch tagId={tag.id} />
                {tag.name}
              </label>
            )
          })}
          {failure && (
            <p className="library__tag-failure" role="alert">
              {t(`reason.${failure}`)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
