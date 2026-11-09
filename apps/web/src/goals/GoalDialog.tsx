import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { reasonOf } from '../backend/api'
import { todayOf } from '../calendar/calendar'
import { DescriptionField, LengthCount } from '../calendar/MilestoneFields'
import { useI18n } from '../i18n'
import { RoomDialog } from '../room/RoomDialog'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { TextField } from '../ui/TextField'
import { draftRefusals, serverRefusal, type GoalField, type Refusals } from './goalForm'
import { MAX_GOAL_NAME_LENGTH, readAmount, writeAmount, type Goal } from './goals'
import type { NewGoal } from './goalsApi'

/**
 * Creating a Goal, or editing one: its name, an optional description, its
 * Target and its two dates; never its Current Value. A new Goal starts with
 * the Start Date on today. Whatever is invalid is refused in place, all at
 * once and before anything is sent, keeping what was typed; the server's
 * refusal of a field shows beside it too. A Goal being edited can be deleted,
 * after a confirmation that takes the dialog's place.
 */
export function GoalDialog({
  goal,
  onClose,
  onSave,
  onDelete,
}: {
  /** The Goal being edited; none when creating one. */
  goal?: Goal
  onClose: () => void
  onSave: (fields: NewGoal) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const { t, locale } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [name, setName] = useState(goal?.name ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [target, setTarget] = useState(goal ? writeAmount(goal.target, locale) : '')
  const [startDate, setStartDate] = useState(() => goal?.startDate ?? todayOf())
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [refusals, setRefusals] = useState<Refusals>({})
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Cancelled while it was still being saved: closing again would close whatever is open by then.
  const closed = useRef(false)

  useEffect(() => {
    closed.current = false
    return () => {
      closed.current = true
    }
  }, [])

  // Before the dialog leaves the page: only a dialog still on it hands focus back to where it was.
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    return () => element.close()
  }, [confirming])

  const finish = () => {
    if (!closed.current) onClose()
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const refused = draftRefusals({ name, target, startDate, deadline }, locale)
    setRefusals(refused)
    if (Object.keys(refused).length > 0) return
    setBusy(true)
    try {
      await onSave({ name, description, target: readAmount(target, locale)!, startDate, deadline })
      finish()
    } catch (caught) {
      setRefusals(serverRefusal(reasonOf(caught)))
      setBusy(false)
    }
  }

  async function remove() {
    if (busy || !onDelete) return
    setBusy(true)
    try {
      await onDelete()
      finish()
    } catch {
      setRefusals({ form: 'goals.delete.failed' })
      setConfirming(false)
      setBusy(false)
    }
  }

  const errorOf = (field: GoalField) => {
    const refusal = refusals[field]
    return refusal && t(refusal)
  }
  const edit = (field: GoalField, set: (value: string) => void) => (value: string) => {
    set(value)
    setRefusals(({ [field]: _corrected, ...others }) => others)
  }

  if (confirming && goal) {
    return (
      <RoomDialog
        title={t('goals.delete.title')}
        body={t('goals.delete.body', { name: goal.name })}
        onClose={() => setConfirming(false)}
        actions={
          <Button variant="destructive" aria-busy={busy || undefined} onClick={() => void remove()}>
            {t('goals.delete.confirm')}
          </Button>
        }
      >
        <p className="goal-dialog__no-undo">{t('goals.delete.undo')}</p>
      </RoomDialog>
    )
  }

  return (
    <dialog
      ref={dialog}
      className="goal-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape closes through the page, which unmounts the dialog.
        event.preventDefault()
        onClose()
      }}
    >
      <form className="goal-dialog__form" onSubmit={save} noValidate>
        <h2 id={titleId} className="goal-dialog__title ro-serif">
          {t(goal ? 'goals.edit' : 'goals.new')}
        </h2>
        <div className="goal-dialog__name">
          <TextField
            label={t('goals.form.name')}
            placeholder={t('goals.form.namePlaceholder')}
            maxLength={MAX_GOAL_NAME_LENGTH}
            value={name}
            error={errorOf('name')}
            autoFocus
            onChange={(event) => edit('name', setName)(event.target.value)}
          />
          <LengthCount length={name.length} max={MAX_GOAL_NAME_LENGTH} className="goal-dialog__count" besideError={refusals.name !== undefined} />
        </div>
        <DescriptionField
          className="goal-dialog__description"
          placeholder={t('goals.form.descriptionPlaceholder')}
          value={description}
          error={errorOf('description')}
          onChange={edit('description', setDescription)}
          counted
        />
        <TextField
          inputMode="decimal"
          className="goal-dialog__target"
          label={t('goals.form.target')}
          placeholder={t('goals.form.targetPlaceholder')}
          value={target}
          error={errorOf('target')}
          onChange={(event) => edit('target', setTarget)(event.target.value)}
        />
        <div className="goal-dialog__dates">
          <TextField
            type="date"
            className="goal-dialog__date"
            label={t('goals.form.startDate')}
            value={startDate}
            error={errorOf('startDate')}
            onChange={(event) => edit('startDate', setStartDate)(event.target.value)}
          />
          <TextField
            type="date"
            className="goal-dialog__date"
            label={t('goals.form.deadline')}
            value={deadline}
            error={errorOf('deadline')}
            onChange={(event) => edit('deadline', setDeadline)(event.target.value)}
          />
        </div>
        {refusals.form && (
          <p role="alert" className="goal-dialog__failure">
            {t(refusals.form)}
          </p>
        )}
        <div className="goal-dialog__actions">
          {goal && onDelete && (
            <Button variant="destructive" className="goal-dialog__delete" onClick={() => setConfirming(true)}>
              <Icon name="delete" size={14} />
              {t('goals.form.delete')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('goals.form.cancel')}
          </Button>
          <Button type="submit" variant="primary" aria-busy={busy || undefined}>
            {t(goal ? 'goals.form.save' : 'goals.form.create')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
