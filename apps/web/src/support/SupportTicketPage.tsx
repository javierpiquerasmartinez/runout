import { useCallback } from 'react'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { useImpersonationLock } from '../identity/impersonationLock'
import { Breadcrumb } from '../ui/Breadcrumb'
import { SUPPORT_POLL_MS, supportPath, type AccountTicket } from './support'
import { closeTicket, readTicket, writeInTicket } from './supportApi'
import { SupportAside, SupportCloseButton, SupportComposer, SupportStatusBadge, SupportThread, type ThreadEntry } from './SupportThread'
import { usePolled } from './usePolled'
import './Support.css'

/**
 * One of the Account's Support Tickets: its thread in order, every
 * Administrator signed "Runout", and where to write the next message. It is
 * read again every so often while on screen, so answers turn up without a
 * reload. The Account closes it once settled, and writing in a Closed one
 * opens it again. Locked while impersonating, and then nothing is read.
 */
export function SupportTicketPage({ id }: { id: string }) {
  const { t, formatDate } = useI18n()
  const { token, identity } = useIdentity()
  const locked = useImpersonationLock('support')
  const load = useCallback(() => readTicket(token, id), [token, id])
  const { value: ticket, failure, replace } = usePolled<AccountTicket>(load, SUPPORT_POLL_MS, !locked)

  const entries: ThreadEntry[] =
    ticket?.messages.map((message) => ({
      id: message.id,
      name: message.from === 'runout' ? t('support.runout') : t('support.you'),
      mark: message.from === 'runout' ? { kind: 'runout' } : { kind: 'person', seed: identity.id },
      fromRunout: message.from === 'runout',
      text: message.text,
      writtenAt: message.writtenAt,
    })) ?? []
  const day = (iso: string) => formatDate(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="support-page">
      <AppHeader />
      <main className="support-page__main">
        <Breadcrumb label={t('support.breadcrumb')} trail={[{ label: t('support.title'), href: supportPath }]} current={ticket?.subject ?? ''} />
        {locked && <p className="support-page__notice">{locked}</p>}
        {failure && !ticket && (
          <p className="support-page__notice" data-tone="alert" role="alert">
            {t('support.ticketFailed', { reason: t(`reason.${failure}`) })}
          </p>
        )}
        {ticket && (
          <>
            <div className="support-ticket__head">
              <h1 className="support-ticket__title ro-serif">{ticket.subject}</h1>
              <SupportStatusBadge status={ticket.status} />
            </div>
            <div className="support-ticket">
              <div className="support-ticket__thread">
                <SupportThread entries={entries} />
                <SupportComposer
                  hint={t('support.reply.hint')}
                  lockedReason={locked}
                  onSend={async (text) => replace(await writeInTicket(token, ticket.id, text))}
                />
              </div>
              <div className="support-ticket__aside">
                <SupportAside title={t('support.state')}>
                  <div className="support-aside__row">
                    <SupportStatusBadge status={ticket.status} />
                    <span className="support-aside__text">
                      {ticket.openedBy === 'runout'
                        ? t('support.openedByRunout', { date: day(ticket.createdAt) })
                        : t('support.openedByYou', { date: day(ticket.createdAt) })}
                    </span>
                  </div>
                  <p className="support-aside__muted">{ticket.status === 'open' ? t('support.closeHint') : t('support.closedHint')}</p>
                  {ticket.status === 'open' && (
                    <SupportCloseButton lockedReason={locked} onClose={async () => replace(await closeTicket(token, ticket.id))} />
                  )}
                </SupportAside>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
