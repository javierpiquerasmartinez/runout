import { useCallback, useState } from 'react'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { useImpersonationLock } from '../identity/impersonationLock'
import { followLink } from '../routing'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { NewTicketDialog } from './NewTicketDialog'
import { SUPPORT_POLL_MS, supportTicketPath } from './support'
import { listTickets } from './supportApi'
import { SupportStatusBadge } from './SupportThread'
import { usePolled } from './usePolled'
import './Support.css'

/**
 * Support ("Soporte"): the Account's Support Tickets, Open ones first, the
 * latest written in on top, those with an answer unread marked, and "Nueva
 * incidencia" to open one. It is read again every so often while on screen.
 * While an Administrator impersonates the Account it is locked, and nothing
 * is read.
 */
export function SupportPage() {
  const { t, formatDate } = useI18n()
  const { token } = useIdentity()
  const locked = useImpersonationLock('support')
  const load = useCallback(() => listTickets(token), [token])
  const listed = usePolled(load, SUPPORT_POLL_MS, !locked)
  const tickets = listed.value?.tickets ?? null
  const failure = tickets ? null : listed.failure
  const [opening, setOpening] = useState(false)

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
                        <div className="support-table__subject-cell">
                          {ticket.unread ? (
                            <span className="support-table__unread" role="img" aria-label={t('support.unread')} />
                          ) : (
                            <span className="support-table__unread" data-none aria-hidden="true" />
                          )}
                          <a href={supportTicketPath(ticket.id)} className="support-table__subject" data-unread={ticket.unread || undefined} onClick={followLink}>
                            {ticket.subject}
                          </a>
                          {ticket.unread && <span className="support-table__new">{t('support.unread.new')}</span>}
                        </div>
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
