import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { AppHeader, BackToRoom } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { usePreferences } from '../preferences/context'
import { ImportDialog } from '../room/ImportDialog'
import { RoomDialog } from '../room/RoomDialog'
import type { RoomSummary } from '../room/roomClient'
import { roomPath } from '../room/roomCode'
import { quantity } from '../room/quantity'
import { playedAtLabel, positionsLabel, siteLabel, stakeLabel, streetLabel } from '../room/queueEntryView'
import { followLink, navigate, redirect, usePath, useSearch } from '../routing'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { SegmentedControl } from '../ui/SegmentedControl'
import {
  LIBRARY_PAGE_SIZE,
  libraryHandPath,
  libraryViewFromPath,
  libraryViewPath,
  type LibraryHand,
  type LibraryPage as Page,
  type LibraryView,
} from './library'
import {
  defaultLibraryFilter,
  EMPTY_LIBRARY_FILTER,
  isFiltering,
  libraryFilterFromSearch,
  libraryFilterQuery,
  librarySearch,
  periodOf,
  type LibraryFilter,
} from './libraryFilter'
import { LibraryFilters } from './LibraryFilters'
import { LibraryTags, TagSelection } from './LibraryTags'
import type { Results } from './results'
import { ResultsGraph } from './ResultsGraph'
import './LibraryPage.css'

/**
 * The "Biblioteca" board: the Account's Hands, newest first, a page at a
 * time, narrowed by the Library filter. It predates ADR 0004, so neither its
 * "Compartidas" collection nor its Author column is built: every Hand here is
 * the Account's own, whatever its Hero, so the Hero takes the Author's place.
 * The filter lives in the address, so the list at `/library` and the Results
 * Graph at `/library/graph` describe the same Hands, and a reload or a shared
 * link keeps them. Opened from a Room, it leads back there and adds the
 * selected Hands to the Room's Queue, as the board's "Añadir a la sala" does;
 * there it is only ever the list.
 */
export function LibraryPage({ room }: { room?: RoomSummary } = {}) {
  const { t } = useI18n()
  const { token } = useIdentity()
  const path = usePath()
  const search = useSearch()
  const view: LibraryView = (!room && libraryViewFromPath(path)) || 'list'
  const filter = useMemo(() => libraryFilterFromSearch(search), [search])
  const [pageNumber, setPageNumber] = useState(1)
  // Bumped after an import, so the list is read again.
  const [revision, setRevision] = useState(0)
  const [load, setLoad] = useState<{ state: 'loaded'; page: Page } | { state: 'failed'; reason: FailureReason } | null>(null)
  const [results, setResults] = useState<Results | null>(null)
  const [importing, setImporting] = useState(false)
  // The Hands of this page chosen for a Tag or for removal; another page or filter starts with none.
  const [selected, setSelected] = useState<string[]>([])
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addFailure, setAddFailure] = useState<FailureReason | null>(null)
  // Any change of filter, from a control or from the history, starts again from the first page with nothing selected.
  const [filteredBy, setFilteredBy] = useState(search)
  if (filteredBy !== search) {
    setFilteredBy(search)
    setPageNumber(1)
    setSelected([])
    // The graph of other Hands mustn't stay beside the new list.
    setResults(null)
  }

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
    if (view !== 'graph') return
    let cancelled = false
    api<Results>(`/library/results?${libraryFilterQuery(filter)}`, { token })
      .then((read) => !cancelled && setResults(read))
      // A graph that can't be read is left out; the list says what went wrong.
      .catch(() => !cancelled && setResults(null))
    return () => {
      cancelled = true
    }
  }, [token, filter, revision, view])

  const page = load?.state === 'loaded' ? load.page : null
  // When only a quick period leaves nothing, the way out is all the Library, not clearing filters.
  const period = periodOf(filter)
  const onlyThePeriod = !isFiltering({ ...filter, ...defaultLibraryFilter() })
  const emptyPeriod = onlyThePeriod && period !== 'custom' && period !== 'all-time' ? period : null
  const goToPage = (number: number) => {
    setPageNumber(number)
    setSelected([])
  }
  // Only what this page still shows counts as selected.
  const selectedHands = page ? page.hands.filter((hand) => selected.includes(hand.id)) : []
  const openImport = () => setImporting(true)
  // Replaced, not pushed: going back leaves the Library rather than undoing each filter.
  const changeFilter = (next: LibraryFilter) => redirect(`${path}${librarySearch(next)}`)
  // Either view keeps the filter; going back returns to the view left.
  const showView = (next: LibraryView) => {
    // The graph shows no rows to select.
    setSelected([])
    navigate(`${libraryViewPath(next)}${search}`)
  }
  const setMark = (hand: LibraryHand, marked: boolean) => {
    api(`/library/hands/${encodeURIComponent(hand.id)}/mark`, { token, method: marked ? 'PUT' : 'DELETE' })
      // A refused change shows as the Mark staying as it was.
      .catch(() => undefined)
      // Read again: the counts change, and so does what the Marked collection holds.
      .finally(() => setRevision((n) => n + 1))
  }

  // Every Tag change reads the Library again: the counts, the rows and what the filter keeps all follow.
  const changeTags = (change: Promise<unknown>) => change.then(() => setRevision((n) => n + 1))
  const tagsPath = '/library/tags'
  const createTag = (name: string) => changeTags(api(tagsPath, { token, method: 'POST', body: { name } }))
  const renameTag = (tagId: string, name: string) =>
    changeTags(api(`${tagsPath}/${encodeURIComponent(tagId)}`, { token, method: 'PATCH', body: { name } }))
  const setTag = (tagId: string, handIds: string[], attached: boolean) =>
    changeTags(
      api(`${tagsPath}/${encodeURIComponent(tagId)}/hands`, { token, method: attached ? 'PUT' : 'DELETE', body: { handIds } }),
    )
  const deleteTag = (tagId: string) =>
    api(`${tagsPath}/${encodeURIComponent(tagId)}`, { token, method: 'DELETE' }).then(() => {
      // A deleted Tag can't narrow the Library any more.
      if (filter.tags.includes(tagId)) changeFilter({ ...filter, tags: filter.tags.filter((id) => id !== tagId) })
      setRevision((n) => n + 1)
    })

  // Only this Library's references go; the list, the counts and the graph all follow.
  const removeSelected = () =>
    api('/library/hands', { token, method: 'DELETE', body: { handIds: selectedHands.map((hand) => hand.id) } })
      .then(() => {
        setConfirmingRemoval(false)
        setSelected([])
        // Later Hands move up into this page; once there are none, it steps back to the last one left.
        if (page) {
          const left = page.total - selectedHands.length
          setPageNumber(Math.min(pageNumber, Math.max(1, Math.ceil(left / page.pageSize))))
        }
      })
      // A refusal reads the Library too: a selected Hand may have left it elsewhere.
      .finally(() => setRevision((n) => n + 1))

  // The same Hands go to the end of the Queue, as this person's; the Room shows them on the way back.
  const addToRoom = (code: string) => {
    setAdding(true)
    setAddFailure(null)
    api(`/rooms/${encodeURIComponent(code)}/library-hands`, {
      token,
      method: 'POST',
      body: { handIds: selectedHands.map((hand) => hand.id) },
    })
      .then(() => navigate(roomPath(code)))
      .catch((error: unknown) => {
        setAddFailure(reasonOf(error))
        setAdding(false)
      })
  }

  return (
    <LibraryFrame room={room}>
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
          {page && (
            <LibraryTags
              tags={page.options.tags}
              chosen={filter.tags}
              onToggle={(tagId) =>
                changeFilter({
                  ...filter,
                  tags: filter.tags.includes(tagId) ? filter.tags.filter((id) => id !== tagId) : [...filter.tags, tagId],
                })
              }
              onCreate={createTag}
              onRename={renameTag}
              onDelete={deleteTag}
            />
          )}
        </nav>

        <main className="library__main" data-view={view}>
          <div className="library__heading">
            <div className="library__intro">
              <h1 className="library__title ro-serif">{t(filter.markedOnly ? 'library.markedTitle' : 'library.all')}</h1>
              {page && (
                <span className="library__subtitle">
                  {[
                    t(page.total === 1 ? 'library.count.one' : 'library.count.other', { count: page.total }),
                    selectedHands.length > 0 &&
                      t(selectedHands.length === 1 ? 'library.selected.one' : 'library.selected.other', { count: selectedHands.length }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
            {page && selectedHands.length > 0 && (
              <>
                <TagSelection tags={page.options.tags} selected={selectedHands} onSet={setTag} />
                <Button variant="secondary" onClick={() => setConfirmingRemoval(true)}>
                  <Icon name="delete" size={16} />
                  {t('library.remove')}
                </Button>
                {room && (
                  <Button
                    variant="primary"
                    disabledReason={adding ? t('library.addToRoom.adding') : undefined}
                    onClick={() => addToRoom(room.code)}
                  >
                    <Icon name="add" size={16} />
                    {t(selectedHands.length === 1 ? 'library.addToRoom.one' : 'library.addToRoom.other', {
                      count: selectedHands.length,
                    })}
                  </Button>
                )}
              </>
            )}
            <Button variant="secondary" onClick={openImport}>
              <Icon name="import" size={16} />
              {t('library.import')}
            </Button>
          </div>
          {addFailure && (
            <p className="library__failure" role="alert">
              {t(`reason.${addFailure}`)}
            </p>
          )}

          {load?.state === 'failed' && (
            <p className="library__failure" role="alert">
              {t(`reason.${load.reason}`)}
            </p>
          )}
          {page && page.counts.all > 0 && <LibraryFilters filter={filter} options={page.options} onChange={changeFilter} />}
          {!room && (
            <SegmentedControl
              label={t('library.view')}
              options={[
                { value: 'list', label: t('library.view.hands') },
                { value: 'graph', label: t('library.view.graph') },
              ]}
              value={view}
              onChange={showView}
            />
          )}
          {view === 'graph' && page && page.total > 0 && results && results.hands > 0 && <ResultsGraph results={results} />}
          {page && page.total === 0 && page.counts.all > 0 && emptyPeriod && (
            <div className="library__empty">
              <p>{t(`library.noHands.${emptyPeriod}`)}</p>
              <div className="library__empty-actions">
                <Button variant="secondary" onClick={() => changeFilter(EMPTY_LIBRARY_FILTER)}>
                  {t('library.showAll')}
                </Button>
                <Button variant="primary" onClick={openImport}>
                  <Icon name="import" size={16} />
                  {t('library.import')}
                </Button>
              </div>
            </div>
          )}
          {page && page.total === 0 && page.counts.all > 0 && !emptyPeriod && (
            <div className="library__empty">
              <p>{t('library.noMatches')}</p>
              <div className="library__empty-actions">
                <Button variant="secondary" onClick={() => changeFilter(defaultLibraryFilter())}>
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
          {view === 'list' && page && page.hands.length > 0 && (
            <>
              <HandTable hands={page.hands} selected={selected} onSelect={setSelected} onSetMark={setMark} />
              <Pagination page={page} onGoTo={goToPage} />
            </>
          )}
        </main>
      </div>

      {confirmingRemoval && selectedHands.length > 0 && (
        <RemoveDialog count={selectedHands.length} onRemove={removeSelected} onClose={() => setConfirmingRemoval(false)} />
      )}
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

/**
 * The frame every Library screen shares: the Account's header, with the way
 * back to the Room it was opened from.
 */
export function LibraryFrame({ room, children }: { room?: RoomSummary; children: ReactNode }) {
  return (
    <div className="library">
      <AppHeader current="library" back={room && <BackToRoom code={room.code} name={room.name} />} />
      {children}
    </div>
  )
}

/** Asks before the selected Hands leave the Library, saying what stays. */
function RemoveDialog({ count, onRemove, onClose }: { count: number; onRemove: () => Promise<void>; onClose: () => void }) {
  const { t } = useI18n()
  const [removing, setRemoving] = useState(false)
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const plural = count === 1 ? 'one' : 'other'
  const remove = () => {
    setRemoving(true)
    onRemove().catch((error: unknown) => {
      setFailure(reasonOf(error))
      setRemoving(false)
    })
  }
  return (
    <RoomDialog
      title={t(`library.remove.title.${plural}`, { count })}
      body={t(`library.remove.body.${plural}`)}
      onClose={onClose}
      actions={
        <Button variant="destructive" autoFocus disabledReason={removing ? t('library.remove.removing') : undefined} onClick={remove}>
          {t(`library.remove.confirm.${plural}`, { count })}
        </Button>
      }
    >
      {failure && (
        <p className="library__remove-failure" role="alert">
          {t(`reason.${failure}`)}
        </p>
      )}
    </RoomDialog>
  )
}

function HandTable({
  hands,
  selected,
  onSelect,
  onSetMark,
}: {
  hands: LibraryHand[]
  /** The ids of the selected Hands. */
  selected: string[]
  onSelect: (selected: string[]) => void
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
            <th scope="col" className="library-table__select">
              <input
                type="checkbox"
                className="library-row__select"
                aria-label={t('library.selectPage')}
                checked={hands.every((hand) => selected.includes(hand.id))}
                onChange={(event) => onSelect(event.target.checked ? hands.map((hand) => hand.id) : [])}
              />
            </th>
            <th scope="col" className="library-table__hand">
              {t('library.column.hand')}
            </th>
            <th scope="col">{t('library.column.hero')}</th>
            <th scope="col">{t('library.column.stake')}</th>
            <th scope="col">{t('library.column.pot')}</th>
            <th scope="col">{t('library.column.result')}</th>
            <th scope="col">{t('library.column.street')}</th>
            <th scope="col">{t('library.column.date')}</th>
            <th scope="col">{t('library.column.tags')}</th>
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
                <td className="library-table__select">
                  <input
                    type="checkbox"
                    className="library-row__select"
                    aria-label={t('library.select', { positions, hero: hand.hero })}
                    checked={selected.includes(hand.id)}
                    onChange={(event) =>
                      onSelect(event.target.checked ? [...selected, hand.id] : selected.filter((id) => id !== hand.id))
                    }
                  />
                </td>
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
                <td>
                  <span className="library-row__tags">
                    {hand.tags.map((tag) => (
                      <Chip key={tag.id} variant="tag">
                        {tag.name}
                      </Chip>
                    ))}
                  </span>
                </td>
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
