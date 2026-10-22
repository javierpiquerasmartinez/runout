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
import { EMPTY_LIBRARY_FILTER, libraryFilterQuery, type LibraryFilter } from './libraryFilter'
import { LibraryFilters } from './LibraryFilters'
import type { Results } from './results'
import { ResultsGraph } from './ResultsGraph'
import './LibraryPage.css'

/**
 * The "Biblioteca" board: the Account's Hands, newest first, a page at a
 * time, narrowed by the Library filter. It predates ADR 0004, so neither its
 * "Compartidas" collection nor its Author column is built: every Hand here is
 * the Account's own, whatever its Hero, so the Hero takes the Author's place.
 */
export function LibraryPage() {
  const { t } = useI18n()
  const { token } = useIdentity()
  const [pageNumber, setPageNumber] = useState(1)
  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_LIBRARY_FILTER)
  // Bumped after an import, so the list is read again.
  const [revision, setRevision] = useState(0)
  const [load, setLoad] = useState<{ state: 'loaded'; page: Page } | { state: 'failed'; reason: FailureReason } | null>(null)
  const [results, setResults] = useState<Results | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const query = new URLSearchParams({ page: String(pageNumber), pageSize: String(LIBRARY_PAGE_SIZE) })
    libraryFilterQuery(filter).forEach((value, key) => query.append(key, value))
    api<Page>(`/library/hands?${query}`, { token })
      .then((page) => !cancelled && setLoad({ state: 'loaded', page }))
      .catch((error: unknown) => !cancelled && setLoad({ state: 'failed', reason: reasonOf(error) }))
    return () => {
      cancelled = true
    }
  }, [token, pageNumber, filter, revision])

  // The Results Graph reads the same filter, so it describes the same Hands; paging leaves it be.
  useEffect(() => {
    let cancelled = false
    api<Results>(`/library/results?${libraryFilterQuery(filter)}`, { token })
      .then((read) => !cancelled && setResults(read))
      // A graph that can't be read is left out; the list says what went wrong.
      .catch(() => !cancelled && setResults(null))
    return () => {
      cancelled = true
    }
  }, [token, filter, revision])

  const page = load?.state === 'loaded' ? load.page : null
  const openImport = () => setImporting(true)
  // Any change of filter starts again from the first page.
  const changeFilter = (next: LibraryFilter) => {
    setFilter(next)
    setPageNumber(1)
    // The graph of other Hands mustn't stay beside the new list.
    setResults(null)
  }
  const setMark = (hand: LibraryHand, marked: boolean) => {
    api(`/library/hands/${encodeURIComponent(hand.id)}/mark`, { token, method: marked ? 'PUT' : 'DELETE' })
      // A refused change shows as the Mark staying as it was.
      .catch(() => undefined)
      // Read again: the counts change, and so does what the Marked collection holds.
      .finally(() => setRevision((n) => n + 1))
  }

  return (
    <LibraryFrame>
      <div className="library__body">
        <nav className="library__side" aria-label={t('library.collections')}>
          <div className="library__group">
            <span className="library__group-title ro-mono">{t('library.collections')}</span>
            <button
              type="button"
              className="library__collection"
              aria-current={!filter.markedOnly ? 'page' : undefined}
              onClick={() => changeFilter({ ...filter, markedOnly: false })}
            >
              {t('library.all')}
              {page && <span className="library__collection-count ro-mono">{page.counts.all}</span>}
            </button>
            <button
              type="button"
              className="library__collection"
              aria-current={filter.markedOnly ? 'page' : undefined}
              onClick={() => changeFilter({ ...filter, markedOnly: true })}
            >
              <Icon name="mark" size={14} />
              {t('library.marked')}
              {page && <span className="library__collection-count ro-mono">{page.counts.marked}</span>}
            </button>
          </div>
          <Button variant="secondary" className="library__import" onClick={openImport}>
            <Icon name="import" size={16} />
            {t('library.import')}
          </Button>
        </nav>

        <main className="library__main">
          <div className="library__intro">
            <h1 className="library__title ro-serif">{t(filter.markedOnly ? 'library.markedTitle' : 'library.all')}</h1>
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
          {page && page.counts.all > 0 && <LibraryFilters filter={filter} options={page.options} onChange={changeFilter} />}
          {page && page.total > 0 && results && results.hands > 0 && <ResultsGraph results={results} />}
          {page && page.total === 0 && page.counts.all > 0 && (
            <div className="library__empty">
              <p>{t('library.noMatches')}</p>
              <div className="library__empty-actions">
                <Button variant="secondary" onClick={() => changeFilter(EMPTY_LIBRARY_FILTER)}>
                  {t('library.filter.clear')}
                </Button>
                <Button variant="primary" onClick={openImport}>
                  <Icon name="import" size={16} />
                  {t('library.import')}
                </Button>
              </div>
            </div>
          )}
          {page && page.counts.all === 0 && (
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
              <HandTable hands={page.hands} onSetMark={setMark} />
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
            // Back to the first page: the list is newest first by when each Hand was played.
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

function HandTable({
  hands,
  onSetMark,
}: {
  hands: LibraryHand[]
  onSetMark: (hand: LibraryHand, marked: boolean) => void
}) {
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
            <th scope="col">{t('library.column.result')}</th>
            <th scope="col">{t('library.column.street')}</th>
            <th scope="col">{t('library.column.date')}</th>
            <th scope="col" className="library-table__mark">
              <span className="library-table__hidden">{t('library.marked')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {hands.map((hand) => {
            const positions = positionsLabel(hand, i18n)
            const pot = quantity(hand.summary.finalPot, hand.stake, displayUnit, i18n, { maximumFractionDigits: 2 })
            const result = quantity(hand.result, hand.stake, displayUnit, i18n, {
              maximumFractionDigits: 2,
              signDisplay: 'exceptZero',
            })
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
                <td className="library-row__result ro-mono" data-sign={Math.sign(hand.result)}>
                  {result.primary}
                </td>
                <td>
                  <span className="library-row__street ro-mono" data-showdown={hand.summary.showdown || undefined}>
                    {streetLabel(hand, i18n)}
                  </span>
                </td>
                <td className="library-row__date ro-mono">{playedAtLabel(hand, i18n)}</td>
                <td className="library-table__mark">
                  <IconButton
                    icon="mark"
                    size="compact"
                    className="library-row__mark"
                    label={t('library.mark', { positions, hero: hand.hero })}
                    aria-pressed={hand.marked}
                    data-marked={hand.marked || undefined}
                    onClick={() => onSetMark(hand, !hand.marked)}
                  />
                </td>
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
