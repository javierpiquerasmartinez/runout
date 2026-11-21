import { useId, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { RoomDialog } from '../room/RoomDialog'
import { navigate } from '../routing'
import { MAX_SUPPORT_MESSAGE_LENGTH, MAX_SUPPORT_SUBJECT_LENGTH, type PanelTicket, type PanelTicketBulkImport } from '../support/support'
import { SupportCount } from '../support/SupportThread'
import { TicketBulkImportCard } from '../support/TicketBulkImport'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { adminSupportTicketPath, nameOf, type Person } from './admin'
import { useAdminApi } from './useAdminApi'
import '../support/Support.css'

/**
 * "Abrir incidencia con …": an Administrator opens a Support Ticket with an
 * Account from a subject and a first message, both required, so "Abrir
 * incidencia" stays locked until both are written. The Account sees it
 * signed Runout. Opening lands on the Ticket's page in the panel; a refusal
 * says why, keeping what was typed. Given one of the Account's Bulk
 * Imports, the Ticket points at it, shown attached, its subject prefilled.
 */
export function OpenTicketDialog({
  account,
  bulkImport,
  subject: initialSubject = '',
  onClose,
}: {
  account: Person
  bulkImport?: PanelTicketBulkImport
  subject?: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const admin = useAdminApi()
  const messageId = useId()
  const [subject, setSubject] = useState(initialSubject)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<FailureReason | null>(null)

  async function open() {
    setBusy(true)
    try {
      const opened = await admin<PanelTicket>('/support/tickets', {
        method: 'POST',
        body: { accountId: account.id, subject, message, ...(bulkImport && { bulkImportId: bulkImport.id }) },
      })
      navigate(adminSupportTicketPath(opened.id))
    } catch (caught) {
      setFailure(reasonOf(caught))
      setBusy(false)
    }
  }

  const openLocked = busy
    ? t('support.sending')
    : subject.trim() === ''
      ? t('support.new.needsSubject')
      : message.trim() === ''
        ? t('support.new.needsMessage')
        : undefined
  return (
    <RoomDialog
      title={t('admin.support.open.title', { name: nameOf(account) })}
      body={t('admin.support.open.body', { email: account.email ?? '—' })}
      onClose={onClose}
      lockedReason={busy ? t('support.sending') : undefined}
      actions={
        <Button variant="primary" disabledReason={openLocked} aria-busy={busy || undefined} onClick={() => void open()}>
          {t('admin.support.open')}
        </Button>
      }
    >
      <div className="support-new">
        {bulkImport && <TicketBulkImportCard bulkImport={bulkImport} failureCode={bulkImport.failureCode} />}
        <TextField
          label={t('support.new.subject')}
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
