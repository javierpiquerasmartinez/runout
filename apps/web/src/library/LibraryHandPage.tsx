import { useEffect, useState } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { usePreferences } from '../preferences/context'
import { NoteEditor } from '../room/NoteEditor'
import { usePendingUndo } from '../room/pendingUndo'
import { PlaybackBar } from '../room/PlaybackBar'
import { PokerTable } from '../room/PokerTable'
import { dateTimeLabel } from '../room/queueEntryView'
import type { Note } from '../room/roomClient'
import { useShortcuts } from '../room/shortcuts'
import { StreetLog } from '../room/StreetLog'
import { tableView } from '../room/tableView'
import { useHand } from '../room/useHand'
import { followLink } from '../routing'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { libraryPath } from './library'
import { LibraryFrame } from './LibraryPage'
import '../room/RoomPage.css'
import './LibraryHandPage.css'

/**
 * A Hand opened from the Library, replayed alone: the same table, Street log
 * and Playback bar as in a Room, driven by this person only, with the Hand's
 * Notes beside it, which anyone who has the Hand may change.
 */
export function LibraryHandPage({ handId }: { handId: string }) {
  const i18n = useI18n()
  const { t } = i18n
  const { token } = useIdentity()
  const preferences = usePreferences()
  const load = useHand(handId, token)
  const [actionIndex, setActionIndex] = useState(0)
  const table = load.state === 'loaded' ? tableView(load.hand, actionIndex, i18n, undefined, preferences) : null
  const goTo = (index: number | null) => (index === null ? undefined : () => setActionIndex(index))
  useShortcuts(table !== null, {
    'previous-action': goTo(table?.canGoBack ? table.actionIndex - 1 : null),
    'next-action': goTo(table?.canGoForward ? table.actionIndex + 1 : null),
    'previous-street': goTo(table?.streets.previousStreet ?? null),
    'next-street': goTo(table?.streets.nextStreet ?? null),
  })

  return (
    <LibraryFrame>
      <div className="library-hand">
        <main className="library-hand__stage room-stage">
          <a href={libraryPath} className="library__back" onClick={followLink}>
            <Icon name="chevron" size={14} className="library__back-icon" />
            {t('library.back')}
          </a>
          {table ? (
            <>
              <div className="room-stage__play">
                <PokerTable view={table} />
              </div>
              <StreetLog log={table.log} />
              <PlaybackBar view={table} onGoTo={setActionIndex} />
            </>
          ) : (
            <div className="room-stage__felt">
              <div className="room-stage__table" role={load.state === 'failed' ? 'alert' : undefined}>
                {load.state !== 'failed' ? (
                  <p aria-busy="true">{t('library.hand.loading')}</p>
                ) : (
                  <div className="room-stage__failed">
                    <p>{t(`reason.${load.reason}`)}</p>
                    {load.reason !== 'hand-not-found' && (
                      <Button variant="secondary" size="compact" onClick={load.retry}>
                        {t('room.table.retry')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
        <aside className="library-hand__side">
          {/* Keyed: a draft, an edit and an undo belong to the Hand they were about. */}
          <HandNotes key={handId} handId={handId} />
        </aside>
      </div>
    </LibraryFrame>
  )
}

/**
 * The Hand's Notes, whoever wrote them and wherever: shared by everyone who
 * has the Hand. Having it in the Library is enough to write one, and to
 * rewrite or delete any of them; a deletion can be undone for ten seconds.
 */
function HandNotes({ handId }: { handId: string }) {
  const i18n = useI18n()
  const { t } = i18n
  const { token } = useIdentity()
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const removal = usePendingUndo((id) =>
    applyAnswer(api<Note>(`/library/notes/${encodeURIComponent(id)}/restore`, { token, method: 'POST' }), (restored, current) =>
      [...current, restored].sort((a, b) => a.seq - b.seq),
    ),
  )

  useEffect(() => {
    let cancelled = false
    api<{ notes: Note[] }>(`/hands/${encodeURIComponent(handId)}/notes`, { token })
      .then((read) => !cancelled && setNotes(read.notes))
      // The table above already says why the Hand can't be seen.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [handId, token])

  /**
   * Applies what the server answered to the Notes as they stand by then, or
   * says why it refused. Resolves to whether it was applied.
   */
  function applyAnswer<T>(request: Promise<T>, next: (answer: T, current: Note[]) => Note[]): Promise<boolean> {
    setFailure(null)
    return request.then(
      (answer) => {
        setNotes((current) => next(answer, current ?? []))
        return true
      },
      (error: unknown) => {
        setFailure(reasonOf(error))
        return false
      },
    )
  }

  async function write() {
    const body = draft.trim()
    if (body === '') return
    const written = await applyAnswer(
      api<Note>(`/library/hands/${encodeURIComponent(handId)}/notes`, { token, method: 'POST', body: { body } }),
      (note, current) => [...current, note],
    )
    if (written) setDraft('')
  }

  async function edit(id: string, body: string) {
    const edited = await applyAnswer(
      api<Note>(`/library/notes/${encodeURIComponent(id)}`, { token, method: 'PATCH', body: { body } }),
      (note, current) => current.map((each) => (each.id === note.id ? note : each)),
    )
    // A refused rewrite stays open, so its wording isn't lost.
    if (edited) setEditing(null)
  }

  function remove(id: string) {
    // The undo is offered at once, as the server's window starts now.
    removal.remove(id, () =>
      void applyAnswer(api(`/library/notes/${encodeURIComponent(id)}`, { token, method: 'DELETE' }), (_, current) =>
        current.filter((note) => note.id !== id),
      ).then((removed) => removed || removal.forget()),
    )
  }

  return (
    <section className="room-notes" aria-labelledby="library-notes-title">
      <h3 id="library-notes-title" className="room-side__title">
        {t('library.notes.title')}
      </h3>
      {notes && notes.length === 0 && !removal.pendingId && (
        <p className="library-hand__no-notes">{t('library.notes.none')}</p>
      )}
      {notes && notes.length > 0 && (
        <ul className="room-notes__list">
          {notes.map((note) =>
            editing === note.id ? (
              <li key={note.id} className="room-notes__note">
                <NoteEditor note={note} onSave={(body) => void edit(note.id, body)} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={note.id} className="room-notes__note">
                <div className="room-notes__by">
                  <span className="room-notes__writer">{note.writer.displayName}</span>
                  <span className="room-notes__when ro-mono" title={dateTimeLabel(note.writtenAt, i18n)}>
                    {dateTimeLabel(note.writtenAt, i18n)}
                    {note.editedAt && ` · ${t('room.notes.edited')}`}
                  </span>
                </div>
                <p className="room-notes__body">{note.body}</p>
                <div className="room-notes__controls">
                  <IconButton
                    icon="note"
                    label={t('room.notes.edit', { name: note.writer.displayName })}
                    size="compact"
                    onClick={() => setEditing(note.id)}
                  />
                  <IconButton
                    icon="delete"
                    label={t('room.notes.delete', { name: note.writer.displayName })}
                    size="compact"
                    onClick={() => remove(note.id)}
                  />
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {removal.pendingId && (
        <div className="room-notes__undo" role="status">
          <span>{t('room.notes.removed')}</span>
          <Button variant="secondary" size="compact" onClick={removal.undo}>
            {t('room.queue.undo')}
          </Button>
        </div>
      )}
      {failure && (
        <p className="library-hand__failure" role="alert">
          {t(`reason.${failure}`)}
        </p>
      )}
      {notes && (
        <>
          <textarea
            className="room-notes__field"
            aria-label={t('library.notes.write')}
            placeholder={t('library.notes.placeholder')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button variant="secondary" className="room-notes__save" onClick={() => void write()}>
            {t('room.notes.save')}
          </Button>
        </>
      )}
    </section>
  )
}
