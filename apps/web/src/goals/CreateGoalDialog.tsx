import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { reasonOf } from '../backend/api'
import { todayOf } from '../calendar/calendar'
import { DescriptionField, LengthCount } from '../calendar/MilestoneFields'
import { useI18n } from '../i18n'
import { useSession } from '../identity/context'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { draftRefusals, serverRefusal, type GoalField, type Refusals } from './goalForm'
import { MAX_GOAL_NAME_LENGTH, readAmount, type Goal } from './goals'
import { createGoal } from './goalsApi'

/**
 * Creating a Goal: its name, an optional description, its Target and its two
 * dates, the Start Date filled in with today. Whatever is invalid is refused
 * in place, all at once and before anything is sent, keeping what was typed;
 * the server's refusal of a field shows beside it too.
 */
export function CreateGoalDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (goal: Goal) => void }) {
  const { t, locale } = useI18n()
  const { token } = useSession()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [target, setTarget] = useState('')
  const [startDate, setStartDate] = useState(() => todayOf())
  const [deadline, setDeadline] = useState('')
  const [refusals, setRefusals] = useState<Refusals>({})
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
    const refused = draftRefusals({ name, target, startDate, deadline }, locale)
    setRefusals(refused)
    if (Object.keys(refused).length > 0) return
    setBusy(true)
    try {
      onCreated(await createGoal(token, { name, description, target: readAmount(target, locale)!, startDate, deadline }))
    } catch (caught) {
      setRefusals(serverRefusal(reasonOf(caught)))
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
      <form className="goal-dialog__form" onSubmit={create} noValidate>
        <h2 id={titleId} className="goal-dialog__title ro-serif">
          {t('goals.new')}
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
          <Button variant="ghost" onClick={onClose}>
            {t('goals.form.cancel')}
          </Button>
          <Button type="submit" variant="primary" aria-busy={busy || undefined}>
            {t('goals.form.create')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
