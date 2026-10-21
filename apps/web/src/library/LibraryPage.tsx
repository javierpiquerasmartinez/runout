import { useEffect, useState, type ReactNode } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { usePreferences } from '../preferences/context'
import { ImportDialog } from '../room/ImportDialog'
import { quantity } from '../room/quantity'
import { playedAtLabel, positionsLabel, siteLabel, stakeLabel, streetLabel } from '../room/queueEntryView'
import { followLink } from '../routing'
import { settingsPath } from '../settings/SettingsPage'
import { Avatar } from '../ui/Avatar'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { LIBRARY_PAGE_SIZE, libraryHandPath, type LibraryHand, type LibraryPage as Page } from './library'
import './LibraryPage.css'

/**
 * The "Biblioteca" board: the Account's Hands, newest first, a page at a
 * time. It predates ADR 0004, so neither its "Compartidas" collection nor its
 * Author column is built: every Hand here is the Account's own, whatever its
 * Hero, so the Hero takes the Author's place.
 */
export function LibraryPage() {
  const { t } = useI18n()
  const { token } = useIdentity()
  const [pageNumber, setPageNumber] = useState(1)
  // Bumped after an import, so the list is read again.
  const [revision, setRevision] = useState(0)
  const [load, setLoad] = useState<{ state: 'loaded'; page: Page } | { state: 'failed'; reason: FailureReason } | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api<Page>(`/library/hands?page=${pageNumber}&pageSize=${LIBRARY_PAGE_SIZE}`, { token })
      .then((page) => !cancelled && setLoad({ state: 'loaded', page }))
      .catch((error: unknown) => !cancelled && setLoad({ state: 'failed', reason: reasonOf(error) }))
    return () => {
      cancelled = true
    }
  }, [token, pageNumber, revision])

  const page = load?.state === 'loaded' ? load.page : null
  const openImport = () => setImporting(true)

  return (
    <LibraryFrame>
      <div className="library__body">
        <nav className="library__side" aria-label={t('library.collections')}>
          <div className="library__group">
            <span className="library__group-title ro-mono">{t('library.collections')}</span>
            <a href="/library" className="library__collection" aria-current="page" onClick={followLink}>
              {t('library.all')}
              {page && <span className="library__collection-count ro-mono">{page.total}</span>}
            </a>
          </div>
          <Button variant="secondary" className="library__import" onClick={openImport}>
            <Icon name="import" size={16} />
            {t('library.import')}
          </Button>
        </nav>

        <main className="library__main">
          <div className="library__intro">
            <h1 className="library__title ro-serif">{t('library.all')}</h1>
            {page && (
              <span className="library__subtitle">
                {t(page.total === 1 ? 'library.count.one' : 'library.count.other', { count: page.total })}
              </span>
            )}
          </div>

          {load?.state === 'failed' && (
            <p className="library__failure" role="alert">
              {t(`reason.${load.reason}`)}
            </p>
          )}
          {page && page.total === 0 && (
            <div className="library__empty">
              <p>{t('library.empty')}</p>
              <Button variant="primary" onClick={openImport}>
                <Icon name="import" size={16} />
                {t('library.import')}
              </Button>
            </div>
          )}
          {page && page.hands.length > 0 && (
            <>
              <HandTable hands={page.hands} />
              <Pagination page={page} onGoTo={setPageNumber} />
            </>
          )}
        </main>
      </div>

      {importing && (
        <ImportDialog
          destination={{ kind: 'library' }}
          onClose={() => setImporting(false)}
          onImported={(imported) => {
            if (imported === 0) return
            // The new Hands are the newest ones, at the head of the first page.
            setPageNumber(1)
            setRevision((n) => n + 1)
          }}
        />
      )}
    </LibraryFrame>
  )
}

/** The header every Library screen shares: back home, where this is, Settings and who is signed in. */
export function LibraryFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const { identity } = useIdentity()
  const name = identity.displayName ?? ''
  return (
    <div className="library">
      <header className="library__header">
        <a href="/" className="library__brand" aria-label={t('room.home')} onClick={followLink}>
          <BrandMark size={22} />
          <span className="ro-serif">{t('brand.wordmark')}</span>
        </a>
        <span className="library__divider" aria-hidden="true" />
        <span className="library__where">{t('library.title')}</span>
        <span className="library__spacer" />
        <a href={settingsPath} className="library__nav" aria-label={t('room.settings')} onClick={followLink}>
          <Icon name="settings" size={17} />
        </a>
        {name && <Avatar name={name} seed={identity.id} size={28} />}
      </header>
      {children}
    </div>
  )
}

function HandTable({ hands }: { hands: LibraryHand[] }) {
  const i18n = useI18n()
  const { t } = i18n
  const { displayUnit } = usePreferences()
  return (
    <div className="library-table__frame">
      <table className="library-table" aria-label={t('library.all')}>
        <thead>
          <tr>
            <th scope="col" className="library-table__hand">
              {t('library.column.hand')}
            </th>
            <th scope="col">{t('library.column.hero')}</th>
            <th scope="col">{t('library.column.stake')}</th>
            <th scope="col">{t('library.column.pot')}</th>
            <th scope="col">{t('library.column.street')}</th>
            <th scope="col">{t('library.column.date')}</th>
          </tr>
        </thead>
        <tbody>
          {hands.map((hand) => {
            const positions = positionsLabel(hand, i18n)
            const pot = quantity(hand.summary.finalPot, hand.stake, displayUnit, i18n, { maximumFractionDigits: 2 })
            return (
              <tr key={hand.id} className="library-row">
                <td className="library-table__hand">
                  <a
                    href={libraryHandPath(hand.id)}
                    className="library-row__open"
                    aria-label={t('library.open', { positions, hero: hand.hero })}
                    onClick={followLink}
                  >
                    <span className="library-row__cards">
                      {hand.holeCards.map((card) => (
                        <Card key={card} card={card} size="list" />
                      ))}
                    </span>
                    <span className="library-row__positions">{positions}</span>
                  </a>
                </td>
                <td>
                  <span className="library-row__hero ro-mono">{hand.hero}</span>
                  <span className="library-row__site">{siteLabel(hand, i18n)}</span>
                </td>
                <td className="library-row__stake ro-mono">{stakeLabel(hand)}</td>
                <td className="library-row__pot ro-mono">{pot.primary}</td>
                <td>
                  <span className="library-row__street ro-mono" data-showdown={hand.summary.showdown || undefined}>
                    {streetLabel(hand, i18n)}
                  </span>
                </td>
                <td className="library-row__date ro-mono">{playedAtLabel(hand, i18n)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Pagination({ page, onGoTo }: { page: Page; onGoTo: (page: number) => void }) {
  const { t } = useI18n()
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize))
  const first = (page.page - 1) * page.pageSize + 1
  const last = first + page.hands.length - 1
  return (
    <div className="library__pages">
      <span className="library__showing">{t('library.showing', { first, last, total: page.total })}</span>
      <span className="library__spacer" />
      <IconButton
        icon="previous"
        size="compact"
        label={t('library.previousPage')}
        disabledReason={page.page <= 1 ? t('library.firstPage') : undefined}
        onClick={() => onGoTo(page.page - 1)}
      />
      <span className="library__page ro-mono">{t('library.page', { page: page.page, pages })}</span>
      <IconButton
        icon="next"
        size="compact"
        label={t('library.nextPage')}
        disabledReason={page.page >= pages ? t('library.lastPage') : undefined}
        onClick={() => onGoTo(page.page + 1)}
      />
    </div>
  )
}
