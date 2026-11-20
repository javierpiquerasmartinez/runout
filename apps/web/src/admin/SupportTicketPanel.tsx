import { useCallback } from 'react'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { SUPPORT_POLL_MS, type PanelTicket } from '../support/support'
import { SupportAside, SupportCloseButton, SupportComposer, SupportStatusBadge, SupportThread, type ThreadEntry } from '../support/SupportThread'
import { supportChanged } from '../support/supportChanges'
import { usePolled } from '../support/usePolled'
import { Avatar } from '../ui/Avatar'
import { Breadcrumb } from '../ui/Breadcrumb'
import { adminTabPath, nameOf } from './admin'
import { useAdminApi } from './useAdminApi'
import '../support/Support.css'

/**
 * A Support Ticket in the panel: its thread, each Support Message showing
 * which Administrator wrote it ("como Runout", as its Account sees it), its
 * Account, and whose turn it is; it is closed from here, and writing in a
 * Closed one opens it again. It is read again every so often while on
 * screen, so what the Account writes turns up without a reload.
 */
export function SupportTicketPanel({ id }: { id: string }) {
  const { t, formatDate } = useI18n()
  const { identity } = useIdentity()
  const admin = useAdminApi()
  const load = useCallback(() => admin<PanelTicket>(`/support/tickets/${id}`), [admin, id])
  const { value: ticket, failure, replace } = usePolled(load, SUPPORT_POLL_MS)

  const entries: ThreadEntry[] =
    ticket?.messages.map((message) => ({
      id: message.id,
      name: nameOf(message.writer),
      mark: { kind: 'person', seed: message.writer.id },
      tag:
        message.from === 'administrator'
          ? message.writer.id === identity.id
            ? t('admin.support.asRunoutYou')
            : t('admin.support.asRunout')
          : undefined,
      fromRunout: message.from === 'administrator',
      text: message.text,
      writtenAt: message.writtenAt,
    })) ?? []
  const day = (iso: string) => formatDate(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <section className="admin-section" aria-label={t('admin.tab.support')}>
      <Breadcrumb label={t('support.breadcrumb')} trail={[{ label: t('admin.tab.support'), href: adminTabPath('support') }]} current={ticket?.subject ?? ''} />
      {failure && !ticket && (
        <p className="admin-notice" data-tone="alert" role="alert">
          {t('support.ticketFailed', { reason: t(`reason.${failure}`) })}
        </p>
      )}
      {ticket && (
        <>
          <div className="support-ticket__head">
            <h2 className="support-ticket__title ro-serif">{ticket.subject}</h2>
            <SupportStatusBadge status={ticket.status} />
          </div>
          <div className="support-ticket">
            <div className="support-ticket__thread">
              <SupportThread entries={entries} />
              <SupportComposer
                hint={t('admin.support.replyHint', { name: nameOf(ticket.account) })}
                onSend={async (text) => {
                  replace(await admin<PanelTicket>(`/support/tickets/${ticket.id}/messages`, { method: 'POST', body: { text } }))
                  supportChanged()
                }}
              />
            </div>
            <div className="support-ticket__aside">
              <SupportAside title={t('admin.support.account')}>
                <div className="support-aside__row">
                  <Avatar name={nameOf(ticket.account)} seed={ticket.account.id} size={28} />
                  <span>
                    {nameOf(ticket.account)}
                    {ticket.account.email && <span className="admin-table__sub">{ticket.account.email}</span>}
                  </span>
                </div>
              </SupportAside>
              <SupportAside title={t('support.state')}>
                <div className="support-aside__row">
                  <SupportStatusBadge status={ticket.status} />
                  {ticket.status === 'open' &&
                    (ticket.waitingFor === 'administrators' ? (
                      <span className="support-badge" data-tone="waiting">
                        {t('admin.support.waitingBadge')}
                      </span>
                    ) : (
                      <span className="support-aside__text">{t('admin.support.waitingForAccount')}</span>
                    ))}
                </div>
                <p className="support-aside__muted">
                  {t('admin.support.openedBy', { name: nameOf(ticket.openedBy ?? ticket.account), date: day(ticket.createdAt) })} {t('admin.support.reopens')}
                </p>
                {ticket.status === 'open' && (
                  <SupportCloseButton
                    onClose={async () => {
                      replace(await admin<PanelTicket>(`/support/tickets/${ticket.id}/close`, { method: 'POST' }))
                      supportChanged()
                    }}
                  />
                )}
              </SupportAside>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
