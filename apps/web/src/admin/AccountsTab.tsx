import { useCallback, useEffect, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useI18n, type MessageKey } from '../i18n'
import { useIdentity } from '../identity/context'
import { homePath } from '../home/home'
import { RoomDialog } from '../room/RoomDialog'
import { navigate } from '../routing'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { nameOf, type AccountCounts, type AccountsPage, type AdminAccount, type Totals } from './admin'
import { Badge } from './AdminPage'
import { AdminPagination } from './AdminPagination'
import { useAdminApi } from './useAdminApi'

type Sort = 'lastActiveAt' | 'email' | 'displayName' | keyof AccountCounts

const COUNT_COLUMNS: (keyof AccountCounts)[] = [
  'libraryHands',
  'imports',
  'ranges',
  'libraryTags',
  'labTags',
  'notes',
  'roomsCreated',
  'roomsJoined',
]

const TOTALS: (keyof Totals)[] = [
  'accounts',
  'activeLast7Days',
  'activeLast30Days',
  'suspended',
  'pendingInvitations',
  'hands',
  'ranges',
  'openRooms',
  'closedRooms',
]

type Confirming = { action: 'suspend' | 'lift' | 'impersonate'; account: AdminAccount }

/**
 * The Accounts tab: Runout at a glance, then every Account with what it has
 * and has done, sortable and searchable. Suspend, lift and Impersonate from
 * each row, each after a confirmation.
 */
export function AccountsTab() {
  const { t, formatDate, formatNumber } = useI18n()
  const admin = useAdminApi()
  const { identity, impersonate } = useIdentity()
  const [totals, setTotals] = useState<Totals | null>(null)
  const [page, setPage] = useState<AccountsPage | null>(null)
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ by: Sort; dir: 'asc' | 'desc' }>({ by: 'lastActiveAt', dir: 'desc' })
  const [pageNumber, setPageNumber] = useState(1)
  const [confirming, setConfirming] = useState<Confirming | null>(null)

  const reload = useCallback(() => {
    const query = new URLSearchParams({ sort: sort.by, direction: sort.dir, page: String(pageNumber) })
    if (search.trim()) query.set('search', search.trim())
    Promise.all([admin<Totals>('/totals'), admin<AccountsPage>(`/accounts?${query}`)])
      .then(([foundTotals, foundPage]) => {
        setTotals(foundTotals)
        setPage(foundPage)
        setFailure(null)
      })
      .catch((error: unknown) => setFailure(reasonOf(error)))
  }, [admin, search, sort, pageNumber])
  useEffect(reload, [reload])

  function sortBy(by: Sort) {
    setPageNumber(1)
    // Names read A to Z first; counts and activity, the most first.
    const first = by === 'email' || by === 'displayName' ? 'asc' : 'desc'
    setSort((current) =>
      current.by === by ? { by, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { by, dir: first },
    )
  }

  async function act({ action, account }: Confirming) {
    setConfirming(null)
    try {
      if (action === 'impersonate') {
        await impersonate(account.id)
        navigate(homePath)
        return
      }
      await admin(`/accounts/${account.id}/suspension`, { method: action === 'suspend' ? 'POST' : 'DELETE' })
      reload()
    } catch (error) {
      setFailure(reasonOf(error))
    }
  }

  const date = (iso: string | null) =>
    iso ? formatDate(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const header = (by: Sort, label: string, numeric = false) => (
    <th className={numeric ? 'admin-table__number' : undefined} aria-sort={sort.by === by ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="admin-table__sort" data-current={sort.by === by || undefined} onClick={() => sortBy(by)}>
        {label}
      </button>
    </th>
  )

  return (
    <section className="admin-section" aria-label={t('admin.tab.accounts')}>
      {totals && (
        <dl className="admin-totals" aria-label={t('admin.totals')}>
          {TOTALS.map((key) => (
            <div key={key}>
              <dt>{t(`admin.totals.${key}`)}</dt>
              <dd>{formatNumber(totals[key])}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="admin-toolbar">
        <TextField
          label={t('admin.accounts.search')}
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPageNumber(1)
          }}
        />
      </div>
      {failure && (
        <p className="admin-notice" data-tone="alert" role="alert">
          {t(`reason.${failure}`)}
        </p>
      )}
      {page && page.accounts.length === 0 && <p className="admin-notice">{t('admin.accounts.none')}</p>}
      {page && page.accounts.length > 0 && (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {header('email', t('admin.accounts.email'))}
                  {header('displayName', t('admin.accounts.displayName'))}
                  <th>{t('admin.accounts.signUp')}</th>
                  <th>{t('admin.accounts.methods')}</th>
                  <th>{t('admin.accounts.lastSignIn')}</th>
                  {header('lastActiveAt', t('admin.accounts.lastActive'))}
                  {COUNT_COLUMNS.map((key) => header(key, t(`admin.accounts.count.${key}` as MessageKey), true))}
                  <th>{t('admin.accounts.status')}</th>
                  <th>
                    <span className="ro-visually-hidden">{t('admin.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.email ?? '—'}</td>
                    <td>{account.displayName ?? '—'}</td>
                    <td>
                      {date(account.createdAt)}
                      <span className="admin-table__sub">
                        {account.invitation
                          ? t('admin.accounts.invitedBy', { name: nameOf(account.invitation.sentBy) })
                          : t('admin.accounts.noInvitation')}
                      </span>
                    </td>
                    <td>{account.signInMethods.map((method) => t(`settings.access.method.${method}`)).join(' · ')}</td>
                    <td>{date(account.lastSignedInAt)}</td>
                    <td>{date(account.lastActiveAt)}</td>
                    {COUNT_COLUMNS.map((key) => (
                      <td key={key} className="admin-table__number">
                        {formatNumber(account.counts[key])}
                      </td>
                    ))}
                    <td>
                      {account.administrator && <Badge tone="brass">{t('admin.accounts.administrator')}</Badge>}
                      {account.suspension && (
                        <>
                          <Badge tone="alert">{t('admin.accounts.suspended')}</Badge>
                          <span className="admin-table__sub">
                            {t('admin.accounts.suspendedBy', {
                              date: date(account.suspension.at),
                              name: account.suspension.by ? nameOf(account.suspension.by) : '—',
                            })}
                          </span>
                        </>
                      )}
                      {account.impersonations.slice(0, 3).map((each) => (
                        <span key={each.startedAt} className="admin-table__sub">
                          {t('admin.accounts.impersonated', {
                            name: nameOf(each.administrator),
                            date: date(each.startedAt),
                          })}
                        </span>
                      ))}
                    </td>
                    <td>
                      {!account.administrator && account.id !== identity.id && (
                        <div className="admin-table__actions">
                          {account.suspension ? (
                            <Button size="compact" onClick={() => setConfirming({ action: 'lift', account })}>
                              {t('admin.accounts.lift')}
                            </Button>
                          ) : (
                            <>
                              <Button size="compact" onClick={() => setConfirming({ action: 'impersonate', account })}>
                                {t('admin.accounts.impersonate')}
                              </Button>
                              <Button
                                size="compact"
                                variant="ghost"
                                onClick={() => setConfirming({ action: 'suspend', account })}
                              >
                                {t('admin.accounts.suspend')}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={page.page}
            pageSize={page.pageSize}
            shown={page.accounts.length}
            total={page.total}
            onGoTo={setPageNumber}
          />
        </>
      )}
      {confirming && (
        <RoomDialog
          title={t(`admin.accounts.confirm.${confirming.action}.title`)}
          body={t(`admin.accounts.confirm.${confirming.action}.body`, { name: nameOf(confirming.account) })}
          onClose={() => setConfirming(null)}
          actions={
            <Button
              variant={confirming.action === 'suspend' ? 'destructive' : 'primary'}
              onClick={() => void act(confirming)}
            >
              {t(`admin.accounts.${confirming.action}`)}
            </Button>
          }
        />
      )}
    </section>
  )
}
