import { useCallback, useEffect, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { followLink } from '../routing'
import type { PanelTicketPage } from '../support/support'
import { SupportStatusBadge } from '../support/SupportThread'
import { Icon } from '../ui/Icon'
import { adminSupportTicketPath, nameOf } from './admin'
import { AdminPagination } from './AdminPagination'
import { useAdminApi } from './useAdminApi'
import '../support/Support.css'

/**
 * The Support tab: every Support Ticket, those waiting for an answer first
 * (their Account wrote last), then the other Open ones, then the Closed;
 * the latest written in on top of each. Each opens its thread.
 */
export function SupportTab() {
  const { t, formatDate, formatRelative } = useI18n()
  const admin = useAdminApi()
  const [pageNumber, setPageNumber] = useState(1)
  const [page, setPage] = useState<PanelTicketPage | null>(null)
  const [failure, setFailure] = useState<FailureReason | null>(null)

  const reload = useCallback(() => {
    admin<PanelTicketPage>(`/support/tickets?${new URLSearchParams({ page: String(pageNumber) })}`)
      .then((found) => {
        setPage(found)
        setFailure(null)
      })
      .catch((error: unknown) => setFailure(reasonOf(error)))
  }, [admin, pageNumber])
  useEffect(reload, [reload])

  const date = (iso: string) => formatDate(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <section className="admin-section" aria-label={t('admin.tab.support')}>
      {page && (
        <div className="admin-toolbar">
          <span className="support-waiting">
            <span className="support-waiting__dot" aria-hidden="true" data-none={page.waiting === 0 || undefined} />
            {t('admin.support.waiting', { count: page.waiting })}
          </span>
        </div>
      )}
      {failure && (
        <p className="admin-notice" data-tone="alert" role="alert">
          {t(`reason.${failure}`)}
        </p>
      )}
      {page && page.tickets.length === 0 && <p className="admin-notice">{t('admin.support.none')}</p>}
      {page && page.tickets.length > 0 && (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.support.account')}</th>
                  <th>{t('admin.support.subject')}</th>
                  <th>{t('admin.support.status')}</th>
                  <th>{t('admin.support.lastMessage')}</th>
                  <th>{t('admin.support.openedAt')}</th>
                  <th>
                    <span className="ro-visually-hidden">{t('support.column.open')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      {ticket.account.email ?? nameOf(ticket.account)}
                      {ticket.account.displayName && <span className="admin-table__sub">{ticket.account.displayName}</span>}
                    </td>
                    <td className="support-panel__subject">
                      <a href={adminSupportTicketPath(ticket.id)} className="support-table__subject" onClick={followLink}>
                        {ticket.subject}
                      </a>
                    </td>
                    <td>
                      <span className="support-panel__status">
                        <SupportStatusBadge status={ticket.status} />
                        {ticket.status === 'open' && ticket.waitingFor === 'administrators' && (
                          <span className="support-badge" data-tone="waiting">
                            {t('admin.support.waitingBadge')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span>{nameOf(ticket.lastMessage.writer)}</span>
                      <span className="support-table__muted"> · {formatRelative(new Date(ticket.lastMessage.writtenAt))}</span>
                    </td>
                    <td>
                      {ticket.openedBy
                        ? t('admin.support.openedAtBy', { date: date(ticket.createdAt), name: nameOf(ticket.openedBy) })
                        : date(ticket.createdAt)}
                    </td>
                    <td className="support-table__chevron">
                      <Icon name="chevron" size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination page={page.page} pageSize={page.pageSize} shown={page.tickets.length} total={page.total} onGoTo={setPageNumber} />
        </>
      )}
    </section>
  )
}
