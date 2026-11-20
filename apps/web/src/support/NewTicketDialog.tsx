import { useId, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { RoomDialog } from '../room/RoomDialog'
import { navigate } from '../routing'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { MAX_SUPPORT_MESSAGE_LENGTH, MAX_SUPPORT_SUBJECT_LENGTH, supportTicketPath } from './support'
import { openTicket } from './supportApi'
import { SupportCount } from './SupportThread'
import './Support.css'

/**
 * Opens a Support Ticket: a subject and a first message, both required, so
 * "Enviar" stays locked until both are written. Either may come prefilled,
 * as from a failed import, and stays editable; nothing is sent until the
 * Account sends it. Sending opens the Ticket and goes to its page; a refusal
 * says why, keeping what was typed. Without a title and a body it is
 * "Nueva incidencia".
 */
export function NewTicketDialog({
  title,
  body,
  subject: initialSubject = '',
  message: initialMessage = '',
  onClose,
}: {
  title?: string
  body?: string
  subject?: string
  message?: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const { token } = useIdentity()
  const messageId = useId()
  const [subject, setSubject] = useState(initialSubject)
  const [message, setMessage] = useState(initialMessage)
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
      title={title ?? t('support.new.title')}
      body={body ?? t('support.new.body')}
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
