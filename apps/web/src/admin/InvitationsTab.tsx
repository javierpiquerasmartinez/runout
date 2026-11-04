import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError, detailOf, reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { RoomDialog } from '../room/RoomDialog'
import { Button } from '../ui/Button'
import { SegmentedControl } from '../ui/SegmentedControl'
import { TextField } from '../ui/TextField'
import { nameOf, type Invitation, type InvitationSent, type InvitationStatus } from './admin'
import { Badge } from './AdminPage'
import { useAdminApi } from './useAdminApi'

type Notice =
  | { kind: 'sent'; email: string }
  | { kind: 'not-sent'; email: string; invitationId: string }
  | { kind: 'pending'; email: string; invitationId: string | null }
  | { kind: 'account-exists'; email: string; accountId: string | null; suspended: boolean }
  | { kind: 'lifted'; email: string }
  | { kind: 'failed'; reason: FailureReason }

const TONE: Record<InvitationStatus, 'brass' | 'sync' | 'muted' | 'alert'> = {
  pending: 'brass',
  accepted: 'sync',
  expired: 'muted',
  cancelled: 'muted',
}

/** The Invitations tab: send one, see each one's status, resend or cancel it. */
export function InvitationsTab() {
  const { t, formatDate } = useI18n()
  const admin = useAdminApi()
  const [invitations, setInvitations] = useState<Invitation[] | null>(null)
  const [loadFailed, setLoadFailed] = useState<FailureReason | null>(null)
  const [email, setEmail] = useState('')
  const [language, setLanguage] = useState<'es' | 'en'>('es')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirming, setConfirming] = useState<{ action: 'resend' | 'cancel'; invitation: Invitation } | null>(null)

  const reload = useCallback(() => {
    admin<Invitation[]>('/invitations')
      .then((found) => {
        setInvitations(found)
        setLoadFailed(null)
      })
      .catch((error: unknown) => setLoadFailed(reasonOf(error)))
  }, [admin])
  useEffect(reload, [reload])

  function reportSent(sent: InvitationSent) {
    setNotice(
      sent.emailSent
        ? { kind: 'sent', email: sent.invitation.email }
        : { kind: 'not-sent', email: sent.invitation.email, invitationId: sent.invitation.id },
    )
    reload()
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      reportSent(await admin<InvitationSent>('/invitations', { method: 'POST', body: { email, language } }))
      setEmail('')
    } catch (error) {
      const reason = reasonOf(error)
      if (reason === 'invitation-pending') {
        setNotice({ kind: 'pending', email, invitationId: detailOf(error, 'invitationId') })
      } else if (reason === 'account-exists') {
        setNotice({
          kind: 'account-exists',
          email,
          accountId: detailOf(error, 'accountId'),
          suspended: error instanceof ApiError && error.details.suspended === true,
        })
      } else {
        setNotice({ kind: 'failed', reason })
      }
    } finally {
      setBusy(false)
    }
  }

  async function resend(id: string) {
    try {
      reportSent(await admin<InvitationSent>(`/invitations/${id}/resend`, { method: 'POST' }))
    } catch (error) {
      setNotice({ kind: 'failed', reason: reasonOf(error) })
    }
  }

  async function cancel(id: string) {
    try {
      await admin(`/invitations/${id}/cancel`, { method: 'POST' })
      reload()
    } catch (error) {
      setNotice({ kind: 'failed', reason: reasonOf(error) })
    }
  }

  async function lift(accountId: string, who: string) {
    try {
      await admin(`/accounts/${accountId}/suspension`, { method: 'DELETE' })
      setNotice({ kind: 'lifted', email: who })
    } catch (error) {
      setNotice({ kind: 'failed', reason: reasonOf(error) })
    }
  }

  const date = (iso: string) => formatDate(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <section className="admin-section" aria-label={t('admin.tab.invitations')}>
      <form className="admin-toolbar" onSubmit={send} noValidate aria-label={t('admin.invitations.send')}>
        <TextField
          label={t('admin.invitations.email')}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <SegmentedControl
          label={t('admin.invitations.language')}
          options={[
            { value: 'es', label: t('language.es') },
            { value: 'en', label: t('language.en') },
          ]}
          value={language}
          onChange={setLanguage}
        />
        <Button type="submit" variant="primary" aria-busy={busy}>
          {t('admin.invitations.send')}
        </Button>
      </form>
      {notice && <InvitationNotice notice={notice} onResend={resend} onLift={lift} />}
      {loadFailed && (
        <p className="admin-notice" data-tone="alert" role="alert">
          {t(`reason.${loadFailed}`)}
        </p>
      )}
      {invitations && invitations.length === 0 && <p className="admin-notice">{t('admin.invitations.none')}</p>}
      {invitations && invitations.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.invitations.email')}</th>
                <th>{t('admin.invitations.status')}</th>
                <th>{t('admin.invitations.sentBy')}</th>
                <th>{t('admin.invitations.sentAt')}</th>
                <th>{t('admin.invitations.expiresAt')}</th>
                <th>{t('admin.invitations.account')}</th>
                <th>
                  <span className="ro-visually-hidden">{t('admin.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td>{invitation.email}</td>
                  <td>
                    <Badge tone={TONE[invitation.status]}>{t(`admin.invitations.status.${invitation.status}`)}</Badge>
                  </td>
                  <td>{nameOf(invitation.sentBy)}</td>
                  <td>{date(invitation.sentAt)}</td>
                  <td>{date(invitation.expiresAt)}</td>
                  <td>
                    {invitation.account && invitation.acceptedAt ? (
                      <>
                        {nameOf(invitation.account)}
                        <span className="admin-table__sub">{date(invitation.acceptedAt)}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="admin-table__actions">
                      {(invitation.status === 'pending' || invitation.status === 'expired') && (
                        <Button size="compact" onClick={() => setConfirming({ action: 'resend', invitation })}>
                          {t('admin.invitations.resend')}
                        </Button>
                      )}
                      {invitation.status === 'pending' && (
                        <Button
                          size="compact"
                          variant="ghost"
                          onClick={() => setConfirming({ action: 'cancel', invitation })}
                        >
                          {t('admin.invitations.cancel')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirming && (
        <RoomDialog
          title={t(`admin.invitations.confirm.${confirming.action}.title`)}
          body={t(`admin.invitations.confirm.${confirming.action}.body`, { email: confirming.invitation.email })}
          onClose={() => setConfirming(null)}
          actions={
            <Button
              variant={confirming.action === 'cancel' ? 'destructive' : 'primary'}
              onClick={() => {
                const { action, invitation } = confirming
                setConfirming(null)
                void (action === 'resend' ? resend(invitation.id) : cancel(invitation.id))
              }}
            >
              {t(`admin.invitations.${confirming.action}`)}
            </Button>
          }
        />
      )}
    </section>
  )
}

function InvitationNotice({
  notice,
  onResend,
  onLift,
}: {
  notice: Notice
  onResend: (id: string) => void
  onLift: (accountId: string, email: string) => void
}) {
  const { t } = useI18n()
  switch (notice.kind) {
    case 'sent':
      return (
        <p className="admin-notice" role="status">
          {t('admin.invitations.sent', { email: notice.email })}
        </p>
      )
    case 'lifted':
      return (
        <p className="admin-notice" role="status">
          {t('admin.invitations.lifted', { email: notice.email })}
        </p>
      )
    case 'not-sent':
      return (
        <p className="admin-notice" data-tone="alert" role="alert">
          {t('admin.invitations.notSent', { email: notice.email })}{' '}
          <Button size="compact" onClick={() => onResend(notice.invitationId)}>
            {t('admin.invitations.resend')}
          </Button>
        </p>
      )
    case 'pending': {
      const { invitationId } = notice
      return (
        <p className="admin-notice" data-tone="alert" role="alert">
          {t('admin.invitations.alreadyPending', { email: notice.email })}{' '}
          {invitationId && (
            <Button size="compact" onClick={() => onResend(invitationId)}>
              {t('admin.invitations.resend')}
            </Button>
          )}
        </p>
      )
    }
    case 'account-exists': {
      const { accountId } = notice
      return (
        <p className="admin-notice" data-tone="alert" role="alert">
          {notice.suspended
            ? t('admin.invitations.accountSuspended', { email: notice.email })
            : t('admin.invitations.accountExists', { email: notice.email })}{' '}
          {notice.suspended && accountId && (
            <Button size="compact" onClick={() => onLift(accountId, notice.email)}>
              {t('admin.accounts.lift')}
            </Button>
          )}
        </p>
      )
    }
    case 'failed':
      return (
        <p className="admin-notice" data-tone="alert" role="alert">
          {t(`reason.${notice.reason}`)}
        </p>
      )
  }
}
