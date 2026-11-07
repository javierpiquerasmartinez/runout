import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { api, reasonOf } from '../backend/api'
import { AppHeader } from '../header/AppHeader'
import { useI18n, type MessageKey } from '../i18n'
import { useSession } from '../identity/context'
import { RoomDialog } from '../room/RoomDialog'
import { followLink, isPlainClick, redirect, setLeaveGuard, useHistoryState } from '../routing'
import { Breadcrumb, type BreadcrumbLink } from '../ui/Breadcrumb'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { TextField } from '../ui/TextField'
import {
  calendarOpenedFrom,
  calendarPath,
  isPending,
  MAX_MILESTONE_DESCRIPTION_LENGTH,
  MAX_MILESTONE_TITLE_LENGTH,
  monthOf,
  parseDate,
  periodFromPath,
  periodPath,
  todayOf,
  todayPeriod,
  type Milestone,
  type Period,
} from './calendar'
import { dayName, monthHeading, weekHeading } from './calendarText'
import './MilestonePage.css'

/** What the page edits and keeps with "Guardar". */
interface Draft {
  title: string
  description: string
  date: string
}

type Field = 'title' | 'description' | 'date'

/** A refused value, shown in place beside its field, or for the whole form. */
interface Refusal {
  field: Field | 'form'
  message: MessageKey
}

/** The field each of the server's refusals is about. */
const refusedField: Partial<Record<string, Field>> = {
  'invalid-milestone-title': 'title',
  'invalid-milestone-description': 'description',
  'invalid-milestone-date': 'date',
}

const draftOf = ({ title, description, date }: Milestone): Draft => ({ title, description, date })

/**
 * A Milestone's own page: a breadcrumb back to the Calendar's view it was
 * opened from, its title, description and date kept with "Guardar", its done
 * check saved at once, and deleting it after confirming. Leaving with unsaved
 * changes asks first. Someone else's Milestone, or one that isn't there, is
 * "not found".
 */
export function MilestonePage({ id }: { id: string }) {
  const i18n = useI18n()
  const { t } = i18n
  const { token } = useSession()
  const auth = token ?? undefined
  const openedFrom = useHistoryState(calendarOpenedFrom)
  const [load, setLoad] = useState<'loading' | 'missing' | 'failed' | 'loaded'>('loading')
  const [saved, setSaved] = useState<Milestone | null>(null)
  const [draft, setDraft] = useState<Draft>({ title: '', description: '', date: '' })
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [saving, setSaving] = useState(false)
  const [doneFailed, setDoneFailed] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)
  const [pendingLeave, setPendingLeave] = useState<{ go: () => void } | null>(null)
  const descriptionId = useId()
  const refusalId = useId()

  const dirty = saved !== null && (draft.title !== saved.title || draft.description !== saved.description || draft.date !== saved.date)
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    let current = true
    api<Milestone>(`/calendar/milestones/${encodeURIComponent(id)}`, { token: auth })
      .then((milestone) => {
        if (!current) return
        setSaved(milestone)
        setDraft(draftOf(milestone))
        setLoad('loaded')
      })
      .catch((error: unknown) => current && setLoad(reasonOf(error) === 'milestone-not-found' ? 'missing' : 'failed'))
    return () => {
      current = false
    }
  }, [id, auth])

  // Leaving within the app asks through the dialog below.
  useEffect(() => {
    setLeaveGuard((go) => {
      if (!dirtyRef.current) return true
      setPendingLeave({ go })
      return false
    })
    return () => setLeaveGuard(null)
  }, [])

  // Closing or reloading the tab asks through the browser's own prompt.
  useEffect(() => {
    if (!dirty) return
    const holdOn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', holdOn)
    return () => window.removeEventListener('beforeunload', holdOn)
  }, [dirty])

  const discard = () => {
    const pending = pendingLeave
    setPendingLeave(null)
    dirtyRef.current = false
    pending?.go()
  }

  // The period the breadcrumb leads back to: the view it was opened from, or the month of its date.
  const openedPeriod = openedFrom ? periodFromPath(openedFrom) : null
  const period: Period = openedPeriod ?? (saved ? { view: 'month', month: monthOf(saved.date) } : todayPeriod('month', todayOf()))
  const periodAddress = openedPeriod && openedFrom ? openedFrom : periodPath(period)
  /** Back to where it was opened from, through history, so the view is found as it was left. */
  const backToPeriod = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!openedPeriod) return followLink(event)
    if (!isPlainClick(event)) return
    event.preventDefault()
    window.history.back()
  }
  const trail: BreadcrumbLink[] = [
    { label: t('header.nav.calendar'), href: calendarPath },
    {
      label: period.view === 'month' ? monthHeading(i18n, period.month) : weekHeading(i18n, period.monday),
      href: periodAddress,
      onClick: backToPeriod,
    },
  ]

  function edit(field: Field, value: string) {
    setDraft((before) => ({ ...before, [field]: value }))
    if (refusal?.field === field || refusal?.field === 'form') setRefusal(null)
  }

  async function keep(event: FormEvent) {
    event.preventDefault()
    if (saving || !saved) return
    if (draft.title.trim() === '') return setRefusal({ field: 'title', message: 'calendar.create.titleRequired' })
    if (parseDate(draft.date) === null) return setRefusal({ field: 'date', message: 'calendar.create.dateRequired' })
    setSaving(true)
    setRefusal(null)
    try {
      const changed = await api<Milestone>(`/calendar/milestones/${encodeURIComponent(id)}`, { token: auth, method: 'PATCH', body: draft })
      setSaved(changed)
      setDraft(draftOf(changed))
    } catch (error) {
      const reason = reasonOf(error)
      if (reason === 'milestone-not-found') setLoad('missing')
      else setRefusal({ field: refusedField[reason] ?? 'form', message: `reason.${reason}` })
    } finally {
      setSaving(false)
    }
  }

  function toggleDone(done: boolean) {
    if (!saved) return
    setDoneFailed(false)
    setSaved({ ...saved, done })
    api(`/calendar/milestones/${encodeURIComponent(id)}`, { token: auth, method: 'PATCH', body: { done } }).catch(() => {
      setSaved((before) => before && { ...before, done: !done })
      setDoneFailed(true)
    })
  }

  async function remove() {
    if (!saved) return
    setDeleteFailed(false)
    try {
      await api(`/calendar/milestones/${encodeURIComponent(id)}`, { token: auth, method: 'DELETE' }).catch((error: unknown) => {
        if (reasonOf(error) !== 'milestone-not-found') throw error
      })
    } catch {
      setConfirmingDelete(false)
      setDeleteFailed(true)
      return
    }
    // Deleted: nothing is left to keep, and there is no undo.
    dirtyRef.current = false
    setConfirmingDelete(false)
    if (openedPeriod) window.history.back()
    else redirect(periodAddress)
  }

  const errorOf = (field: Field) => (refusal?.field === field ? t(refusal.message) : undefined)

  return (
    <div className="milestone-page">
      <AppHeader current="calendar" />
      <main className="milestone-page__main" aria-busy={load === 'loading' || undefined}>
        {load === 'missing' ? (
          <>
            <div className="milestone-page__crumbs">
              <Breadcrumb label={t('calendar.breadcrumb')} trail={trail} current={t('calendar.missing.crumb')} />
            </div>
            <div className="milestone-missing">
              <span className="milestone-missing__code ro-mono">404</span>
              <h1 className="milestone-missing__title ro-serif">{t('calendar.missing.title')}</h1>
              <p className="milestone-missing__body">{t('calendar.missing.body')}</p>
              <a className="ro-btn ro-btn--secondary ro-btn--standard milestone-missing__back" href={calendarPath} onClick={followLink}>
                <Icon name="previous" size={14} />
                {t('calendar.missing.back')}
              </a>
            </div>
          </>
        ) : (
          <form className="milestone-page__form" onSubmit={keep} noValidate>
            <Breadcrumb label={t('calendar.breadcrumb')} trail={trail} current={saved?.title ?? ''} />
            {load === 'loading' && <p aria-busy="true">{t('calendar.milestone.loading')}</p>}
            {load === 'failed' && (
              <p role="alert" className="milestone-page__failure">
                {t('calendar.milestone.loadFailed')}
              </p>
            )}
            {saved && (
              <>
                <div className="milestone-page__head">
                  <input
                    className="milestone-page__title ro-serif"
                    aria-label={t('calendar.milestone.titleLabel')}
                    aria-invalid={refusal?.field === 'title' || undefined}
                    aria-describedby={refusal?.field === 'title' ? refusalId : undefined}
                    maxLength={MAX_MILESTONE_TITLE_LENGTH}
                    value={draft.title}
                    onChange={(event) => edit('title', event.target.value)}
                  />
                  <Button variant="destructive" size="compact" onClick={() => setConfirmingDelete(true)}>
                    <Icon name="delete" size={14} />
                    {t('calendar.milestone.delete')}
                  </Button>
                  <Button type="submit" variant="primary" size="compact" aria-busy={saving || undefined}>
                    {t('calendar.milestone.save')}
                  </Button>
                </div>
                {refusal?.field === 'title' && (
                  <span id={refusalId} className="ro-field__error milestone-page__title-error">
                    {t(refusal.message)}
                  </span>
                )}
                <div className="milestone-page__done">
                  <label className="milestone-page__done-label">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={saved.done}
                      aria-label={t('calendar.milestone.doneLabel')}
                      className="milestone-page__check"
                      data-done={saved.done || undefined}
                      data-pending={isPending(saved, todayOf()) || undefined}
                      onClick={() => toggleDone(!saved.done)}
                    >
                      {saved.done && (
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="m7 12.4 3.2 3.2L17 8.8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    {t('calendar.milestone.doneLabel')}
                  </label>
                  <span className="milestone-page__hint">
                    {isPending(saved, todayOf()) ? t('calendar.milestone.pendingSince', { day: dayName(i18n, saved.date) }) : t('calendar.milestone.savesAtOnce')}
                  </span>
                </div>
                {doneFailed && (
                  <p role="alert" className="milestone-page__failure">
                    {t('calendar.milestone.doneFailed')}
                  </p>
                )}
                <TextField
                  type="date"
                  className="milestone-page__date"
                  label={t('calendar.create.date')}
                  value={draft.date}
                  error={errorOf('date')}
                  onChange={(event) => edit('date', event.target.value)}
                />
                <div className="ro-field" data-invalid={refusal?.field === 'description' ? '' : undefined}>
                  <label htmlFor={descriptionId} className="ro-field__label">
                    {t('calendar.create.description')} <span className="milestone-page__optional">· {t('calendar.create.optional')}</span>
                  </label>
                  <textarea
                    id={descriptionId}
                    className="ro-field__input milestone-page__description"
                    maxLength={MAX_MILESTONE_DESCRIPTION_LENGTH}
                    aria-invalid={refusal?.field === 'description' || undefined}
                    value={draft.description}
                    onChange={(event) => edit('description', event.target.value)}
                  />
                  {refusal?.field === 'description' && <span className="ro-field__error">{t(refusal.message)}</span>}
                  <span className="milestone-page__count ro-mono">{`${draft.description.length} / ${MAX_MILESTONE_DESCRIPTION_LENGTH}`}</span>
                </div>
                {refusal?.field === 'form' && (
                  <p role="alert" className="milestone-page__failure">
                    {t(refusal.message)}
                  </p>
                )}
                {deleteFailed && (
                  <p role="alert" className="milestone-page__failure">
                    {t('calendar.milestone.deleteFailed')}
                  </p>
                )}
              </>
            )}
          </form>
        )}
      </main>
      {pendingLeave && (
        <RoomDialog
          title={t('calendar.leave.title')}
          body={t('calendar.leave.body')}
          onClose={() => setPendingLeave(null)}
          actions={
            <Button variant="destructive" onClick={discard}>
              {t('calendar.leave.discard')}
            </Button>
          }
        />
      )}
      {confirmingDelete && saved && (
        <RoomDialog
          title={t('calendar.milestone.deleteTitle')}
          body={t('calendar.milestone.deleteBody', { title: saved.title })}
          onClose={() => setConfirmingDelete(false)}
          actions={
            <Button variant="destructive" onClick={() => void remove()}>
              {t('calendar.milestone.deleteConfirm')}
            </Button>
          }
        >
          <p className="milestone-page__no-undo">{t('calendar.milestone.deleteUndo')}</p>
        </RoomDialog>
      )}
    </div>
  )
}
