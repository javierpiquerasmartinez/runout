import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { AppHeader, BackToRoom } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { usePreferences } from '../preferences/context'
import { CopyHandMenuButton } from '../room/CopyHand'
import { ImportDialog } from '../room/ImportDialog'
import { RoomDialog } from '../room/RoomDialog'
import type { RoomSummary } from '../room/roomClient'
import { roomPath } from '../room/roomCode'
import { quantity } from '../room/quantity'
import { playedAtLabel, positionsLabel, siteLabel, stakeLabel, streetLabel } from '../room/queueEntryView'
import { isPlainClick, navigate, redirect, usePath, useSearch } from '../routing'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { SegmentedControl } from '../ui/SegmentedControl'
import {
  LIBRARY_PAGE_SIZE,
  libraryHandPath,
  libraryPageFromSearch,
  libraryScroll,
  libraryViewFromPath,
  libraryViewPath,
  libraryZoomFromSearch,
  openedFromLibrary,
  withLibraryPage,
  withLibraryScroll,
  withLibraryZoom,
  type LibraryHand,
  type LibraryPage as Page,
  type LibraryView,
} from './library'
import {
  defaultLibraryFilter,
  EMPTY_LIBRARY_FILTER,
  isDefaultBesidesPeriod,
  libraryFilterFromSearch,
  libraryFilterQuery,
  librarySearch,
  periodOf,
  type LibraryFilter,
  type StatCriterion,
} from './libraryFilter'
import { LibraryFilters } from './LibraryFilters'
import {
  librarySortFromSearch,
  librarySortQuery,
  nextLibrarySort,
  withLibrarySort,
  type LibrarySort,
  type LibrarySortColumn,
} from './librarySort'
import { LibraryTags, TagSelection } from './LibraryTags'
import type { Results } from './results'
import { ResultsGraph } from './ResultsGraph'
import type { LibraryStats } from './stats'
import { StatsView } from './StatsView'
import { BULK_IMPORTS_POLL_MS, isUnderway, type BulkImport } from './bulkImports'
import { ImportsBanner, ImportsView } from './ImportsView'
import { replayFilterSearch, replaySelectedSearch, replayServerQuery } from './replay'
import './LibraryPage.css'

/**
 * The "Biblioteca" board: the Account's Hands, newest first unless a column
 * header sorts them otherwise, a page at a time, narrowed by the Library
 * filter. It predates ADR 0004, so neither its
 * "Compartidas" collection nor its Author column is built: every Hand here is
 * the Account's own, whatever its Hero, so the Hero takes the Author's place.
 * The filter and the sort live in the address, so the list at `/library`, the Results
 * Graph at `/library/graph` and the Stats at `/library/stats` describe the
 * same Hands, and a reload or a shared link keeps them. Opened from a Room, it leads back there and adds the
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
  const sort = useMemo(() => librarySortFromSearch(search), [search])
  // The page is in the address too, so coming back from a Hand, or a reload, opens the same one.
  const pageNumber = libraryPageFromSearch(search)
  // The Results Graph's Zoom too, so the list and back, or a Hand and back, keep it.
  const zoom = libraryZoomFromSearch(search)
  // As numbers, so the graph's effect below depends on them: the Zoom is a new object on every render.
  const zoomFrom = zoom?.from
  const zoomTo = zoom?.to
  // Bumped after an import, so the list is read again.
  const [revision, setRevision] = useState(0)
  const [load, setLoad] = useState<{ state: 'loaded'; page: Page } | { state: 'failed'; reason: FailureReason } | null>(null)
  const [results, setResults] = useState<Results | null>(null)
  const [stats, setStats] = useState<{ state: 'loaded'; stats: LibraryStats } | { state: 'failed'; reason: FailureReason } | null>(null)
  const [importing, setImporting] = useState(false)
  // The Hands of this page chosen for a Tag or for removal; another page or filter starts with none.
  const [selected, setSelected] = useState<string[]>([])
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addFailure, setAddFailure] = useState<FailureReason | null>(null)
  // Any change of filter or sort, from a control or from the history, starts with nothing selected; the address it
  // comes in has no page, so it is the first. A Zoom is no change of filter.
  const filteredBy = withLibraryZoom(withLibraryPage(search, 1), null)
  const [lastFilteredBy, setLastFilteredBy] = useState(filteredBy)
  if (lastFilteredBy !== filteredBy) {
    setLastFilteredBy(filteredBy)
    setSelected([])
    // The graph or the Stats of other Hands mustn't stay beside the new list.
    setResults(null)
    setStats(null)
  }

  useEffect(() => {
    let cancelled = false
    const query = new URLSearchParams({ page: String(pageNumber), pageSize: String(LIBRARY_PAGE_SIZE) })
    libraryFilterQuery(filter).forEach((value, key) => query.append(key, value))
    librarySortQuery(sort).forEach((value, key) => query.append(key, value))
    api<Page>(`/library/hands?${query}`, { token })
      .then((page) => !cancelled && setLoad({ state: 'loaded', page }))
      .catch((error: unknown) => !cancelled && setLoad({ state: 'failed', reason: reasonOf(error) }))
    return () => {
      cancelled = true
    }
  }, [token, pageNumber, filter, sort, revision])

  // The Results Graph reads the same filter, so it describes the same Hands, and its Zoom; paging leaves it be.
  useEffect(() => {
    if (view !== 'graph') return
    let cancelled = false
    const zoomed = zoomFrom !== undefined && zoomTo !== undefined ? { from: zoomFrom, to: zoomTo } : null
    const query = new URLSearchParams(withLibraryZoom(libraryFilterQuery(filter).toString(), zoomed))
    api<Results>(`/library/results?${query}`, { token })
      .then((read) => !cancelled && setResults(read))
      // A graph that can't be read is left out; the list says what went wrong.
      .catch(() => !cancelled && setResults(null))
    return () => {
      cancelled = true
    }
  }, [token, filter, zoomFrom, zoomTo, revision, view])

  // The Stats read the same filter too, so they count the same Hands as the list and the graph.
  useEffect(() => {
    if (view !== 'stats') return
    let cancelled = false
    api<LibraryStats>(`/library/stats?${libraryFilterQuery(filter)}`, { token })
      .then((read) => !cancelled && setStats({ state: 'loaded', stats: read }))
      // Stats that can't be read say why, as the list does.
      .catch((error: unknown) => !cancelled && setStats({ state: 'failed', reason: reasonOf(error) }))
    return () => {
      cancelled = true
    }
  }, [token, filter, revision, view])

  // The Account's Bulk Imports, whatever the filter: they are not Hands it narrows. Every view reads them, for the
  // banner, and reads them again while one is underway, so its progress moves on its own. Not from a Room: there
  // the Library is only a list to pick Hands from.
  const [imports, setImports] = useState<{ state: 'loaded'; imports: BulkImport[] } | { state: 'failed'; reason: FailureReason } | null>(
    null,
  )
  const [importsRevision, setImportsRevision] = useState(0)
  useEffect(() => {
    if (room) return
    let cancelled = false
    let next: ReturnType<typeof setTimeout> | undefined
    const read = () =>
      api<BulkImport[]>('/library/bulk-imports', { token })
        .then((listed) => {
          if (cancelled) return
          setImports({ state: 'loaded', imports: listed })
          if (listed.some((bulkImport) => isUnderway(bulkImport.status))) next = setTimeout(read, BULK_IMPORTS_POLL_MS)
        })
        .catch((error: unknown) => !cancelled && setImports({ state: 'failed', reason: reasonOf(error) }))
    void read()
    return () => {
      cancelled = true
      clearTimeout(next)
    }
  }, [token, revision, importsRevision, room])
  const underwayImport =
    imports?.state === 'loaded' ? imports.imports.find((bulkImport) => isUnderway(bulkImport.status)) : undefined
  // Stopped before its next batch; what it imported stays. A refusal means it had ended meanwhile: reading again says how.
  const cancelImport = (id: string) =>
    api(`/library/bulk-imports/${encodeURIComponent(id)}/cancel`, { token, method: 'POST' })
      .catch(() => undefined)
      .finally(() => setImportsRevision((n) => n + 1))

  const page = load?.state === 'loaded' ? load.page : null
  // Back from a Hand, the list lands as far down as it was left, once its Hands are there again.
  const restoredScroll = useRef(false)
  useEffect(() => {
    if (!page || restoredScroll.current) return
    restoredScroll.current = true
    const scrollY = libraryScroll(window.history.state)
    if (scrollY === null) return
    window.scrollTo(0, scrollY)
    // Landed once: a reload of this entry later starts at the top, as any page does.
    window.history.replaceState(withLibraryScroll(window.history.state, null), '')
  }, [page])
  // Opening a Hand keeps where the Library was, so "Volver" leads back to it.
  const openHandAt = (handPath: string) => {
    window.history.replaceState(withLibraryScroll(window.history.state, window.scrollY), '')
    navigate(handPath, openedFromLibrary(`${path}${search}`))
  }
  const openHand = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return
    event.preventDefault()
    openHandAt(event.currentTarget.pathname)
  }
  // When only a quick period leaves nothing, the way out is all the Library, not clearing filters.
  const period = periodOf(filter)
  const emptyPeriod = isDefaultBesidesPeriod(filter) && period !== 'custom' && period !== 'all-time' ? period : null
  const noMatches = emptyPeriod
    ? { message: t(`library.noHands.${emptyPeriod}`), action: t('library.showAll'), filter: EMPTY_LIBRARY_FILTER }
    : { message: t('library.noMatches'), action: t('library.filter.clear'), filter: defaultLibraryFilter() }
  // Replaced, like a filter: going back leaves the Library rather than paging back.
  const goToPage = (number: number) => {
    setSelected([])
    redirect(`${path}${withLibraryPage(search, number)}`)
  }
  // Only what this page still shows counts as selected.
  const selectedHands = page ? page.hands.filter((hand) => selected.includes(hand.id)) : []
  const openImport = () => setImporting(true)
  // Replaced, not pushed: going back leaves the Library rather than undoing each filter. The sort stays as it was.
  const changeFilter = (next: LibraryFilter) => redirect(`${path}${withLibrarySort(librarySearch(next), sort)}`)
  const changeSort = (by: LibrarySortColumn) =>
    redirect(`${path}${withLibraryPage(withLibrarySort(search, nextLibrarySort(sort, by)), 1)}`)
  // A Stat's links open Manos on the Hands behind it, every other filter and the sort kept; going back returns to the Stats.
  const statHref = (stat: StatCriterion) => `${libraryViewPath('list')}${withLibrarySort(librarySearch({ ...filter, stat }), sort)}`
  // Every view keeps the filter; going back returns to the view left.
  const showView = (next: LibraryView) => {
    // The graph and the Stats show no rows to select.
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
          goToPage(Math.min(pageNumber, Math.max(1, Math.ceil(left / page.pageSize))))
        }
      })
      // A refusal reads the Library too: a selected Hand may have left it elsewhere.
      .finally(() => setRevision((n) => n + 1))

  // The selected Hands, in the order shown, or with none every Hand the filter keeps, one after another.
  const playSelected = () => {
    const ids = selectedHands.map((hand) => hand.id)
    openHandAt(`${libraryHandPath(ids[0])}${replaySelectedSearch(ids)}`)
  }
  const playFiltered = () => {
    const listed = replayFilterSearch(search)
    api<{ ids: string[] }>(`/library/hand-ids?${replayServerQuery(search)}`, { token })
      .then(({ ids }) => ids.length > 0 && openHandAt(`${libraryHandPath(ids[0])}${listed}`))
      .catch((error: unknown) => setAddFailure(reasonOf(error)))
  }

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
              count={(tag) => tag.hands}
              confirmDelete={(tag) =>
                t(tag.hands === 1 ? 'library.tag.confirmDelete.one' : 'library.tag.confirmDelete.other', {
                  name: tag.name,
                  count: tag.hands,
                })
              }
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
          {underwayImport && <ImportsBanner bulkImport={underwayImport} href={`${libraryViewPath('imports')}${search}`} />}
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
            {page && page.total > 0 && !room && (
              <Button variant="secondary" onClick={selectedHands.length > 0 ? playSelected : playFiltered}>
                <Icon name="play" size={16} />
                {selectedHands.length > 0
                  ? t(selectedHands.length === 1 ? 'library.replay.playSelected.one' : 'library.replay.playSelected.other', {
                      count: selectedHands.length,
                    })
                  : t('library.replay.play')}
              </Button>
            )}
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
          {page && page.counts.all > 0 && view !== 'imports' && (
            <LibraryFilters filter={filter} options={page.options} onChange={changeFilter} />
          )}
          {!room && (
            <SegmentedControl
              label={t('library.view')}
              options={[
                { value: 'list', label: t('library.view.hands') },
                { value: 'graph', label: t('library.view.graph') },
                { value: 'stats', label: t('library.view.stats') },
                { value: 'imports', label: t('library.view.imports') },
              ]}
              value={view}
              onChange={showView}
            />
          )}
          {view === 'graph' && page && page.total > 0 && results && results.hands > 0 && (
            <ResultsGraph
              results={results}
              onOpenHand={(handId) => openHandAt(libraryHandPath(handId))}
              onZoom={(zoom) => redirect(`${path}${withLibraryZoom(search, zoom)}`)}
              onLeaveZoom={() => redirect(`${path}${withLibraryZoom(search, null)}`)}
            />
          )}
          {view === 'stats' && stats?.state === 'failed' && (
            <p className="library__failure" role="alert">
              {t(`reason.${stats.reason}`)}
            </p>
          )}
          {view === 'stats' && page && page.total > 0 && stats?.state === 'loaded' && stats.stats.hands > 0 && (
            <StatsView stats={stats.stats} statHref={statHref} />
          )}
          {view === 'imports' && imports?.state === 'failed' && (
            <p className="library__failure" role="alert">
              {t(`reason.${imports.reason}`)}
            </p>
          )}
          {view === 'imports' && imports?.state === 'loaded' && <ImportsView imports={imports.imports} onCancel={cancelImport} />}
          {view !== 'imports' && page && page.total === 0 && page.counts.all > 0 && (
            <div className="library__empty">
              <p>{noMatches.message}</p>
              <div className="library__empty-actions">
                <Button variant="secondary" onClick={() => changeFilter(noMatches.filter)}>
                  {noMatches.action}
                </Button>
                <Button variant="primary" onClick={openImport}>
                  <Icon name="import" size={16} />
                  {t('library.import')}
                </Button>
              </div>
            </div>
          )}
          {view !== 'imports' && page && page.counts.all === 0 && (
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
              <HandTable
                hands={page.hands}
                sort={sort}
                onSort={changeSort}
                selected={selected}
                onSelect={setSelected}
                onSetMark={setMark}
                onOpen={openHand}
              />
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
          onClose={() => {
            setImporting(false)
            // An import that only found duplicates may still have given a Hand its Original back.
            setRevision((n) => n + 1)
          }}
          onImported={(imported) => {
            if (imported === 0) return
            // Back to the first page: the list is newest first by when each Hand was played.
            goToPage(1)
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
  sort,
  onSort,
  selected,
  onSelect,
  onSetMark,
  onOpen,
}: {
  hands: LibraryHand[]
  sort: LibrarySort
  onSort: (by: LibrarySortColumn) => void
  /** The ids of the selected Hands. */
  selected: string[]
  onSelect: (selected: string[]) => void
  onSetMark: (hand: LibraryHand, marked: boolean) => void
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void
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
            <SortableHeader by="stake" sort={sort} onSort={onSort} className="library-table__stake">
              {t('library.column.stake')}
            </SortableHeader>
            <SortableHeader by="pot" sort={sort} onSort={onSort} className="library-table__pot">
              {t('library.column.pot')}
            </SortableHeader>
            <SortableHeader by="result" sort={sort} onSort={onSort}>
              {t('library.column.result')}
            </SortableHeader>
            <th scope="col" className="library-table__street">
              {t('library.column.street')}
            </th>
            <SortableHeader by="date" sort={sort} onSort={onSort}>
              {t('library.column.date')}
            </SortableHeader>
            <th scope="col" className="library-table__tags">
              {t('library.column.tags')}
            </th>
            <th scope="col" className="library-table__mark">
              <span className="library-table__hidden">{t('library.marked')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {hands.map((hand) => {
            const positions = positionsLabel(hand, i18n)
            const pot = quantity(hand.overview.finalPot, hand.stake, displayUnit, i18n, { maximumFractionDigits: 2 })
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
                    onClick={onOpen}
                  >
                    <span className="library-row__cards">
                      {hand.holeCards.map((card) => (
                        <Card key={card} card={card} size="list" />
                      ))}
                    </span>
                  </a>
                </td>
                <td>
                  <span className="library-row__hero ro-mono">{hand.hero}</span>
                  <span className="library-row__site">{siteLabel(hand, i18n)}</span>
                </td>
                <td className="library-table__stake library-row__stake ro-mono">{stakeLabel(hand)}</td>
                <td className="library-table__pot library-row__pot ro-mono">{pot.primary}</td>
                <td className="library-row__result ro-mono" data-sign={Math.sign(hand.result)}>
                  {result.primary}
                </td>
                <td className="library-table__street">
                  <span className="library-row__street ro-mono" data-showdown={hand.overview.showdown || undefined}>
                    {streetLabel(hand, i18n)}
                  </span>
                </td>
                <td className="library-row__date ro-mono">{playedAtLabel(hand, i18n)}</td>
                <td className="library-table__tags">
                  <span className="library-row__tags">
                    {hand.tags.map((tag) => (
                      <Chip key={tag.id} variant="tag">
                        {tag.name}
                      </Chip>
                    ))}
                  </span>
                </td>
                <td className="library-table__mark">
                  <CopyHandMenuButton
                    handId={hand.id}
                    hasHistory={hand.hasHistory}
                    className="library-row__copy"
                    label={t('library.copy', { positions, hero: hand.hero })}
                  />
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

/**
 * A column header that sorts the list by it: the biggest first, then the
 * other way. Only the current one shows which way; the rest hint at it on
 * hover and focus.
 */
function SortableHeader({
  by,
  sort,
  onSort,
  className,
  children,
}: {
  by: LibrarySortColumn
  sort: LibrarySort
  onSort: (by: LibrarySortColumn) => void
  className?: string
  children: ReactNode
}) {
  const current = sort.by === by
  return (
    <th scope="col" className={className} aria-sort={current ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}>
      <button
        type="button"
        className="library-table__sort"
        data-current={current || undefined}
        data-dir={current ? sort.dir : undefined}
        onClick={() => onSort(by)}
      >
        {children}
        <Icon name={current ? 'expand' : 'sort'} size={12} className="library-table__sort-icon" />
      </button>
    </th>
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
