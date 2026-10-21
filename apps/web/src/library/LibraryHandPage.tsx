import { useEffect, useState } from 'react'
import { api } from '../backend/api'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { usePreferences } from '../preferences/context'
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
import { libraryPath } from './library'
import { LibraryFrame } from './LibraryPage'
import '../room/RoomPage.css'
import './LibraryHandPage.css'

/**
 * A Hand opened from the Library, replayed alone: the same table, Street log
 * and Playback bar as in a Room, driven by this person only, with the Hand's
 * Notes beside it. Notes are read-only here for now.
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
          <HandNotes handId={handId} />
        </aside>
      </div>
    </LibraryFrame>
  )
}

/** The Hand's Notes, whoever wrote them and wherever: shared by everyone who has the Hand. */
function HandNotes({ handId }: { handId: string }) {
  const i18n = useI18n()
  const { t } = i18n
  const { token } = useIdentity()
  const [notes, setNotes] = useState<{ handId: string; notes: Note[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    api<{ notes: Note[] }>(`/hands/${encodeURIComponent(handId)}/notes`, { token })
      .then((read) => !cancelled && setNotes({ handId, notes: read.notes }))
      // The table above already says why the Hand can't be seen.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [handId, token])

  const shown = notes?.handId === handId ? notes.notes : null
  return (
    <section className="room-notes" aria-labelledby="library-notes-title">
      <h3 id="library-notes-title" className="room-side__title">
        {t('library.notes.title')}
      </h3>
      {shown && shown.length === 0 && <p className="library-hand__no-notes">{t('library.notes.none')}</p>}
      {shown && shown.length > 0 && (
        <ul className="room-notes__list">
          {shown.map((note) => (
            <li key={note.id} className="room-notes__note">
              <div className="room-notes__by">
                <span className="room-notes__writer">{note.writer.displayName}</span>
                <span className="room-notes__when ro-mono" title={dateTimeLabel(note.writtenAt, i18n)}>
                  {dateTimeLabel(note.writtenAt, i18n)}
                  {note.editedAt && ` · ${t('room.notes.edited')}`}
                </span>
              </div>
              <p className="room-notes__body">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="library-hand__read-only">{t('library.notes.readOnly')}</p>
    </section>
  )
}
