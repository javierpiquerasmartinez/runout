import { useState } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import type { Note } from './roomClient'

/** One Note being rewritten in place, from its current wording. */
export function NoteEditor({
  note,
  onSave,
  onCancel,
}: {
  note: Note
  onSave: (body: string) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [body, setBody] = useState(note.body)

  return (
    <>
      <textarea
        className="room-notes__field"
        aria-label={t('room.notes.edit', { name: note.writer.displayName })}
        value={body}
        autoFocus
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="room-notes__controls">
        <Button
          variant="secondary"
          size="compact"
          disabledReason={body.trim() === '' ? t('room.notes.empty') : undefined}
          onClick={() => onSave(body.trim())}
        >
          {t('room.notes.confirmEdit')}
        </Button>
        <Button variant="ghost" size="compact" onClick={onCancel}>
          {t('room.notes.cancelEdit')}
        </Button>
      </div>
    </>
  )
}
