import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { api, reasonOf } from '../backend/api'
import { useI18n, type MessageKey } from '../i18n'
import { useSession } from '../identity/context'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { MAX_MILESTONE_DESCRIPTION_LENGTH, MAX_MILESTONE_TITLE_LENGTH, parseDate, type CalendarDate, type Milestone } from './calendar'

/**
 * Creating a Milestone: its title, an optional description and its date,
 * filled in with the day it was asked for and still open to change. An empty
 * title is refused in place, before anything is sent.
 */
export function CreateMilestoneDialog({
  date: initialDate,
  onClose,
  onCreated,
}: {
  date: CalendarDate
  onClose: () => void
  onCreated: (milestone: Milestone) => void
}) {
  const { t } = useI18n()
  const { token } = useSession()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(initialDate)
  const [error, setError] = useState<{ field: 'title' | 'date' | 'form'; message: MessageKey } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    return () => element.close()
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (title.trim() === '') return setError({ field: 'title', message: 'calendar.create.titleRequired' })
    if (parseDate(date) === null) return setError({ field: 'date', message: 'calendar.create.dateRequired' })
    setBusy(true)
    setError(null)
    try {
      const created = await api<Milestone>('/calendar/milestones', { token: token ?? undefined, method: 'POST', body: { title, description, date } })
      onCreated(created)
    } catch (caught) {
      setError({ field: 'form', message: `reason.${reasonOf(caught)}` })
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="calendar-create"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape closes through the Calendar, which unmounts the dialog.
        event.preventDefault()
        onClose()
      }}
    >
      <form className="calendar-create__form" onSubmit={create} noValidate>
        <h2 id={titleId} className="calendar-create__title ro-serif">
          {t('calendar.create.title')}
        </h2>
        <div className="calendar-create__title-field">
          <TextField
            label={t('calendar.create.titleLabel')}
            placeholder={t('calendar.create.titlePlaceholder')}
            maxLength={MAX_MILESTONE_TITLE_LENGTH}
            value={title}
            error={error?.field === 'title' ? t(error.message) : undefined}
            autoFocus
            onChange={(event) => {
              setTitle(event.target.value)
              if (error?.field === 'title') setError(null)
            }}
          />
          <span className="calendar-create__count ro-mono" data-beside-error={error?.field === 'title' || undefined}>
            {`${title.length} / ${MAX_MILESTONE_TITLE_LENGTH}`}
          </span>
        </div>
        <div className="ro-field">
          <label htmlFor={descriptionId} className="ro-field__label">
            {t('calendar.create.description')} <span className="calendar-create__optional">· {t('calendar.create.optional')}</span>
          </label>
          <textarea
            id={descriptionId}
            className="ro-field__input calendar-create__description"
            placeholder={t('calendar.create.descriptionPlaceholder')}
            maxLength={MAX_MILESTONE_DESCRIPTION_LENGTH}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <TextField
          type="date"
          className="calendar-create__date"
          label={t('calendar.create.date')}
          value={date}
          error={error?.field === 'date' ? t(error.message) : undefined}
          onChange={(event) => {
            setDate(event.target.value)
            if (error?.field === 'date') setError(null)
          }}
        />
        {error?.field === 'form' && (
          <p role="alert" className="calendar-create__failure">
            {t(error.message)}
          </p>
        )}
        <div className="calendar-create__actions">
          <Button variant="ghost" onClick={onClose}>
            {t('calendar.create.cancel')}
          </Button>
          <Button type="submit" variant="primary" aria-busy={busy || undefined}>
            {t('calendar.create.submit')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
