import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { AccountsTab } from './AccountsTab'
import { ADMIN_TABS, adminTabPath, type AdminTab } from './admin'
import { ImportsTab } from './ImportsTab'
import { InvitationsTab } from './InvitationsTab'
import { RoomsTab } from './RoomsTab'
import './AdminPage.css'

/**
 * The Administrator panel: Invitations, Accounts, Rooms and Bulk Imports, each tab a route.
 * Built from the design system's tables, buttons, badges and dialogs; the
 * design canvas's "Administración" boards are captures of this page.
 */
export function AdminPage({ tab }: { tab: AdminTab }) {
  const { t } = useI18n()
  return (
    <div className="admin">
      <AppHeader where={t('admin.title')} />
      <main className="admin__main">
        <h1 className="admin__title ro-serif">{t('admin.title')}</h1>
        <nav className="admin__tabs" aria-label={t('admin.tabs')}>
          {ADMIN_TABS.map((each) => (
            <a
              key={each}
              href={adminTabPath(each)}
              className="admin__tab"
              aria-current={each === tab ? 'page' : undefined}
              onClick={followLink}
            >
              {t(`admin.tab.${each}`)}
            </a>
          ))}
        </nav>
        {tab === 'invitations' && <InvitationsTab />}
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'rooms' && <RoomsTab />}
        {tab === 'imports' && <ImportsTab />}
      </main>
    </div>
  )
}

/** A status, as a small badge: pending in brass, accepted and open in teal, the rest muted. */
export function Badge({ tone, children }: { tone: 'brass' | 'sync' | 'muted' | 'alert'; children: string }) {
  return (
    <span className="admin-badge" data-tone={tone}>
      {children}
    </span>
  )
}
