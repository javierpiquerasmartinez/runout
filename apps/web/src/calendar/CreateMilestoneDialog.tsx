import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { reasonOf } from '../backend/api'
import { useI18n } from '../i18n'
import { useSession } from '../identity/context'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { MAX_MILESTONE_TITLE_LENGTH, type CalendarDate, type Milestone } from './calendar'
import { DescriptionField, LengthCount } from './MilestoneFields'
import { draftRefusal, serverRefusal, type MilestoneField, type Refusal } from './milestoneForm'
import { createMilestone } from './milestonesApi'

/**
 * Creating a Milestone: its title, an optional description and its date,
 * filled in with the day it was asked for and still open to change. An empty
 * title is refused in place, before anything is sent; the server's refusal of
 * a field shows beside it too.
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
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(initialDate)
  const [error, setError] = useState<Refusal | null>(null)
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
    const refused = draftRefusal({ title, date })
    if (refused) return setError(refused)
    setBusy(true)
    setError(null)
    try {
      onCreated(await createMilestone(token, { title, description, date }))
    } catch (caught) {
      setError(serverRefusal(reasonOf(caught)))
      setBusy(false)
    }
  }

  const errorOf = (field: MilestoneField) => (error?.field === field ? t(error.message) : undefined)
  const edit = (field: MilestoneField, set: (value: string) => void) => (value: string) => {
    set(value)
    if (error?.field === field) setError(null)
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
            error={errorOf('title')}
            autoFocus
            onChange={(event) => edit('title', setTitle)(event.target.value)}
          />
          <LengthCount length={title.length} max={MAX_MILESTONE_TITLE_LENGTH} className="calendar-create__count" besideError={error?.field === 'title'} />
        </div>
        <DescriptionField
          className="calendar-create__description"
          placeholder={t('calendar.create.descriptionPlaceholder')}
          value={description}
          error={errorOf('description')}
          onChange={edit('description', setDescription)}
        />
        <TextField
          type="date"
          className="calendar-create__date"
          label={t('calendar.create.date')}
          value={date}
          error={errorOf('date')}
          onChange={(event) => edit('date', setDate)(event.target.value)}
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
