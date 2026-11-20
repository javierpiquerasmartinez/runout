import { useEffect, useId, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { useImpersonationLock } from '../identity/impersonationLock'
import { RoomDialog } from '../room/RoomDialog'
import { followLink, navigate } from '../routing'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { TextField } from '../ui/TextField'
import { MAX_SUPPORT_MESSAGE_LENGTH, MAX_SUPPORT_SUBJECT_LENGTH, supportTicketPath, type AccountTicketSummary } from './support'
import { listTickets, openTicket } from './supportApi'
import { SupportCount, SupportStatusBadge } from './SupportThread'
import './Support.css'

/**
 * Support ("Soporte"): the Account's Support Tickets, Open ones first, the
 * latest written in on top, and "Nueva incidencia" to open one. While an
 * Administrator impersonates the Account it is locked, and nothing is read.
 */
export function SupportPage() {
  const { t, formatDate } = useI18n()
  const { token } = useIdentity()
  const locked = useImpersonationLock('support')
  const [tickets, setTickets] = useState<AccountTicketSummary[] | null>(null)
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    if (locked) return
    let cancelled = false
    listTickets(token)
      .then((listed) => !cancelled && setTickets(listed.tickets))
      .catch((error: unknown) => !cancelled && setFailure(reasonOf(error)))
    return () => {
      cancelled = true
    }
  }, [token, locked])

  const when = (iso: string) => formatDate(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div className="support-page">
      <AppHeader />
      <main className="support-page__main support-page__main--list">
        <div className="support-page__head">
          <div className="support-page__heading">
            <h1 className="support-page__title ro-serif">{t('support.title')}</h1>
            <p className="support-page__lead">{t('support.lead')}</p>
          </div>
          <Button variant="primary" size="compact" aria-label={t('support.new')} disabledReason={locked} onClick={() => setOpening(true)}>
            <Icon name="add" size={14} />
            {t('support.new')}
          </Button>
        </div>
        {locked && <p className="support-page__notice">{locked}</p>}
        {failure && (
          <p className="support-page__notice" data-tone="alert" role="alert">
            {t('support.loadFailed', { reason: t(`reason.${failure}`) })}
          </p>
        )}
        {tickets?.length === 0 && <p className="support-page__notice">{t('support.empty')}</p>}
        {tickets && tickets.length > 0 && (
          <>
            <div className="support-table-wrap">
              <table className="support-table">
                <thead>
                  <tr>
                    <th>{t('support.column.subject')}</th>
                    <th>{t('support.column.status')}</th>
                    <th>{t('support.column.lastMessage')}</th>
                    <th>
                      <span className="ro-visually-hidden">{t('support.column.open')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>
                        <a href={supportTicketPath(ticket.id)} className="support-table__subject" onClick={followLink}>
                          {ticket.subject}
                        </a>
                      </td>
                      <td>
                        <SupportStatusBadge status={ticket.status} />
                      </td>
                      <td className="support-table__last">
                        <span>{ticket.lastMessage.from === 'runout' ? t('support.runout') : t('support.you')}</span>
                        <span className="support-table__muted"> · {when(ticket.lastMessage.writtenAt)}</span>
                      </td>
                      <td className="support-table__chevron">
                        <Icon name="chevron" size={16} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="support-page__note">{t('support.order')}</p>
          </>
        )}
      </main>
      {opening && <NewTicketDialog onClose={() => setOpening(false)} />}
    </div>
  )
}

/**
 * "Nueva incidencia": a subject and a first message, both required, so
 * "Enviar" stays locked until both are written. Sending opens the Ticket
 * and goes to its page; a refusal says why, keeping what was typed.
 */
function NewTicketDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { token } = useIdentity()
  const messageId = useId()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<FailureReason | null>(null)

  async function send() {
    setBusy(true)
    try {
      const opened = await openTicket(token, { subject, message })
      navigate(supportTicketPath(opened.id))
    } catch (caught) {
      setFailure(reasonOf(caught))
      setBusy(false)
    }
  }

  const sendLocked = busy
    ? t('support.sending')
    : subject.trim() === ''
      ? t('support.new.needsSubject')
      : message.trim() === ''
        ? t('support.new.needsMessage')
        : undefined
  return (
    <RoomDialog
      title={t('support.new.title')}
      body={t('support.new.body')}
      onClose={onClose}
      lockedReason={busy ? t('support.sending') : undefined}
      actions={
        <Button variant="primary" disabledReason={sendLocked} aria-busy={busy || undefined} onClick={() => void send()}>
          {t('support.send')}
        </Button>
      }
    >
      <div className="support-new">
        <TextField
          label={t('support.new.subject')}
          placeholder={t('support.new.subjectPlaceholder')}
          maxLength={MAX_SUPPORT_SUBJECT_LENGTH}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <div className="ro-field">
          <div className="support-new__label">
            <label htmlFor={messageId} className="ro-field__label">
              {t('support.new.message')}
            </label>
            <SupportCount length={message.length} />
          </div>
          <textarea
            id={messageId}
            className="ro-field__input ro-field__description support-new__message"
            placeholder={t('support.new.messagePlaceholder')}
            maxLength={MAX_SUPPORT_MESSAGE_LENGTH}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        {failure && (
          <p className="support-new__failure" role="alert">
            {t(`reason.${failure}`)}
          </p>
        )}
      </div>
    </RoomDialog>
  )
}
