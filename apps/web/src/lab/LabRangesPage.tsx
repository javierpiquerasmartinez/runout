import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { RoomDialog } from '../room/RoomDialog'
import { LibraryTags } from '../library/LibraryTags'
import { isPlainClick, navigate, setLeaveGuard, usePath } from '../routing'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { Icon } from '../ui/Icon'
import { labAnalysisAddress, labRangeIdFromPath, labRangePath, labRangesPath, MAX_RANGE_NAME_LENGTH } from './lab'
import { LabNav } from './LabNav'
import { EMPTY_RANGE, rangeStats, sameRange, topRange, withHandClass, type HandClass, type Range } from './range'
import { Brush, RangeMatrix, RangeText, Stats } from './RangeControls'
import './LabRangesPage.css'

/** A Lab Tag as a Range carries it. */
interface RangeTag {
  id: string
  name: string
}

/** A Lab Tag as the side column lists it, with how many Ranges carry it. */
interface LabTag extends RangeTag {
  ranges: number
}

/** A saved Range as the server opens it. */
interface SavedRange {
  id: string
  name: string
  combos: Range
  tags: RangeTag[]
}

/** A saved Range as the list shows it, without its Combos. */
interface RangeSummary {
  id: string
  name: string
  comboCount: number
  percent: number
  tags: RangeTag[]
}

/** What the screen edits: the name in the field, the Tags under it and the matrix. */
interface Draft {
  name: string
  tags: RangeTag[]
  combos: Range
}

const NEW_DRAFT: Draft = { name: '', tags: [], combos: EMPTY_RANGE }

/** What the open Range was last saved as; `id` is null for one never saved. */
interface Baseline {
  id: string | null
  draft: Draft
}

const NEW_BASELINE: Baseline = { id: null, draft: NEW_DRAFT }

/** The saved Ranges for the side column, or why they could not be read; null while loading. */
type RangeListLoad = { state: 'loaded'; ranges: RangeSummary[] } | { state: 'failed'; reason: FailureReason } | null

/** Whether both hold the same Tags, in whatever order. */
const sameTags = (a: RangeTag[], b: RangeTag[]) => a.length === b.length && a.every((tag) => b.some((each) => each.id === tag.id))

/** Tags sorted by name ignoring case, as the server sorts them. */
const sortedTags = <T extends RangeTag>(tags: T[]) =>
  [...tags].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.name.localeCompare(b.name))

/** How long a Tag's name may be, as the server allows it. */
const MAX_TAG_NAME_LENGTH = 40

const draftOf = (range: SavedRange): Draft => ({ name: range.name, tags: range.tags, combos: range.combos })

/** The draft with a Lab Tag renamed, or taken off when `name` is null, as the side column changed it. */
const withTagChanged = (draft: Draft, tagId: string, name: string | null): Draft => ({
  ...draft,
  tags: sortedTags(draft.tags.flatMap((tag) => (tag.id !== tagId ? [tag] : name === null ? [] : [{ ...tag, name }]))),
})

/** The list's query to the server: `tag` for each Lab Tag chosen, and `search` unless it is blank. */
const rangeFilterQuery = (tags: string[], search: string) => {
  const query = new URLSearchParams(tags.map((tag) => ['tag', tag]))
  if (search !== '') query.set('search', search)
  const written = query.toString()
  return written ? `?${written}` : ''
}

/** The "top X %" slider's step, in %. */
const TOP_STEP = 0.5

/**
 * The Lab's Ranges (variant A of the prototype): the saved Ranges in a side
 * column, the matrix in the main column and the stats to its right. The path
 * says which Range is open: `/lab/ranges` is a new one, `/lab/ranges/:id` a
 * saved one. Cells are painted with a brush that carries a Frequency, by
 * clicking or dragging. Leaving changes unsaved asks first.
 */
export function LabRangesPage() {
  const { t } = useI18n()
  const { token } = useIdentity()
  const path = usePath()
  const openId = labRangeIdFromPath(path)
  const [list, setList] = useState<RangeListLoad>(null)
  const [listRevision, setListRevision] = useState(0)
  /** The Lab Tags whose Ranges the list shows (any of them); all Ranges when none. */
  const [chosenTags, setChosenTags] = useState<string[]>([])
  /** What the list's search box holds: the names listed hold it, ignoring case. */
  const [search, setSearch] = useState('')
  const trimmedSearch = search.trim()
  const filtered = chosenTags.length > 0 || trimmedSearch !== ''
  /** The Account's Lab Tags; empty until they are read. */
  const [labTags, setLabTags] = useState<LabTag[]>([])
  const [baseline, setBaseline] = useState<Baseline>(NEW_BASELINE)
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT)
  /** Why the Range at this address could not be opened. */
  const [unopened, setUnopened] = useState<FailureReason | null>(null)
  /** Why the last save, duplicate or delete failed. */
  const [failure, setFailure] = useState<string | null>(null)
  /** The save, duplicate or delete under way; one at a time. */
  const [busy, setBusy] = useState<'saving' | 'duplicating' | 'deleting' | null>(null)
  const [brush, setBrush] = useState<number>(100)
  /** The "top X %" last set with the slider, and the Combos it set; once they're painted over, the slider follows the Range. */
  const [lastTop, setLastTop] = useState<{ percent: number; combos: Range } | null>(null)
  /** Where the person was going when asked to discard their changes. */
  const [pendingLeave, setPendingLeave] = useState<{ go: () => void } | null>(null)
  /** Asking whether to duplicate what was saved, leaving the changes behind. */
  const [confirmingDuplicate, setConfirmingDuplicate] = useState(false)
  /** Asking whether to delete the open Range. */
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Saving trims the name, so spaces around it are no change.
  const dirty =
    draft.name.trim() !== baseline.draft.name ||
    !sameTags(draft.tags, baseline.draft.tags) ||
    !sameRange(draft.combos, baseline.draft.combos)
  // A Range opened by its address, still on its way.
  const opening = openId !== null && openId !== baseline.id && unopened === null
  // Read by the leave guard and the path's effect, which outlive this render.
  const dirtyRef = useRef(dirty)
  const baselineRef = useRef(baseline)
  useEffect(() => {
    dirtyRef.current = dirty
    baselineRef.current = baseline
  })

  useEffect(() => {
    let cancelled = false
    api<RangeSummary[]>(`/lab/ranges${rangeFilterQuery(chosenTags, trimmedSearch)}`, { token })
      .then((ranges) => !cancelled && setList({ state: 'loaded', ranges }))
      .catch((error: unknown) => !cancelled && setList({ state: 'failed', reason: reasonOf(error) }))
    return () => {
      cancelled = true
    }
  }, [token, listRevision, chosenTags, trimmedSearch])

  // Read again with the list, since saving a Range changes how many carry each.
  useEffect(() => {
    let cancelled = false
    api<LabTag[]>('/lab/tags', { token })
      .then((tags) => !cancelled && setLabTags(tags))
      // The side column goes without them; a Tag can still be typed on the Range.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token, listRevision])

  /** Back to an empty matrix with nothing to compare it with. */
  const resetToNew = () => {
    setFailure(null)
    setUnopened(null)
    setBaseline(NEW_BASELINE)
    setDraft(NEW_DRAFT)
  }

  useEffect(() => {
    // Already open, as a new Range is right after its first save.
    if (openId !== null && openId === baselineRef.current.id) return
    resetToNew()
    if (openId === null) return
    let cancelled = false
    api<SavedRange>(`/lab/ranges/${encodeURIComponent(openId)}`, { token })
      .then((range) => {
        if (cancelled) return
        setBaseline({ id: range.id, draft: draftOf(range) })
        setDraft(draftOf(range))
      })
      .catch((error: unknown) => !cancelled && setUnopened(reasonOf(error)))
    return () => {
      cancelled = true
    }
  }, [openId, token])

  // Leaving within the app asks through the dialog below.
  useEffect(() => {
    setLeaveGuard((go) => {
      if (!dirtyRef.current) return true
      setPendingLeave({ go })
      return false
    })
    return () => setLeaveGuard(null)
  }, [])

  // Closing or reloading the tab asks through the browser's own prompt.
  useEffect(() => {
    if (!dirty) return
    const holdOn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', holdOn)
    return () => window.removeEventListener('beforeunload', holdOn)
  }, [dirty])

  /** Goes on with `go` once any unsaved changes are discarded, asking first. */
  const leave = (go: () => void) => {
    if (dirtyRef.current) setPendingLeave({ go })
    else go()
  }
  const discard = () => {
    const pending = pendingLeave
    setPendingLeave(null)
    dirtyRef.current = false
    pending?.go()
  }

  const startNew = () =>
    leave(() => {
      resetToNew()
      dirtyRef.current = false
      if (path !== labRangesPath) navigate(labRangesPath)
    })

  const openRange = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (!isPlainClick(event)) return
    event.preventDefault()
    if (id !== openId) navigate(labRangePath(id))
  }

  const save = async () => {
    const name = draft.name.trim()
    if (!name) {
      setFailure(t('lab.ranges.nameRequired'))
      return
    }
    const sent = draft
    const { id } = baseline
    setFailure(null)
    setBusy('saving')
    try {
      const range = await api<SavedRange>(id ? `/lab/ranges/${encodeURIComponent(id)}` : '/lab/ranges', {
        token,
        method: id ? 'PUT' : 'POST',
        body: { name, combos: sent.combos, tagIds: sent.tags.map((tag) => tag.id) },
      })
      const saved = draftOf(range)
      baselineRef.current = { id: range.id, draft: saved }
      setBaseline(baselineRef.current)
      // Edits made while it saved stay, still unsaved.
      setDraft((current) => (current === sent ? saved : current))
      setListRevision((revision) => revision + 1)
      if (!id) {
        dirtyRef.current = false
        navigate(labRangePath(range.id))
      }
    } catch (error) {
      const reason = reasonOf(error)
      setFailure(
        reason === 'range-name-taken'
          ? t('lab.ranges.nameTaken', { name })
          : reason === 'invalid-range-name'
            ? t('reason.invalid-range-name')
            : t('lab.ranges.saveFailed'),
      )
    } finally {
      setBusy(null)
    }
  }

  /** Copies the saved Range under a name the server picks, and opens the copy. */
  const duplicate = async () => {
    const { id } = baseline
    if (!id) return
    setConfirmingDuplicate(false)
    setFailure(null)
    setBusy('duplicating')
    try {
      const copy = await api<SavedRange>(`/lab/ranges/${encodeURIComponent(id)}/copies`, { token, method: 'POST' })
      // Opened here, so its address has nothing left to fetch.
      baselineRef.current = { id: copy.id, draft: draftOf(copy) }
      setBaseline(baselineRef.current)
      setDraft(draftOf(copy))
      setListRevision((revision) => revision + 1)
      dirtyRef.current = false
      navigate(labRangePath(copy.id))
    } catch {
      setFailure(t('lab.ranges.duplicateFailed'))
    } finally {
      setBusy(null)
    }
  }

  /** Deletes the open Range and goes back to an empty matrix. */
  const remove = async () => {
    const { id } = baseline
    if (!id) return
    setConfirmingDelete(false)
    setFailure(null)
    setBusy('deleting')
    try {
      await api<void>(`/lab/ranges/${encodeURIComponent(id)}`, { token, method: 'DELETE' }).catch((error: unknown) => {
        // Deleted elsewhere already: gone either way.
        if (reasonOf(error) !== 'range-not-found') throw error
      })
      resetToNew()
      setListRevision((revision) => revision + 1)
      dirtyRef.current = false
      navigate(labRangesPath)
    } catch {
      setFailure(t('lab.ranges.deleteFailed'))
    } finally {
      setBusy(null)
    }
  }

  /** A new Lab Tag, listed in the side column at once. Rejects with the server's reason. */
  const createTag = async (tagName: string): Promise<LabTag> => {
    const tag = await api<LabTag>('/lab/tags', { token, method: 'POST', body: { name: tagName } })
    setLabTags((tags) => sortedTags([...tags, tag]))
    return tag
  }

  /** Renames a Lab Tag, or deletes it when `name` is null, everywhere the screen shows it. */
  const changeTag = async (tagId: string, tagName: string | null) => {
    if (tagName === null) {
      await api<void>(`/lab/tags/${encodeURIComponent(tagId)}`, { token, method: 'DELETE' })
      setChosenTags((chosen) => chosen.filter((each) => each !== tagId))
    } else {
      await api<LabTag>(`/lab/tags/${encodeURIComponent(tagId)}`, { token, method: 'PATCH', body: { name: tagName } })
    }
    // The server changed the saved Range as well, so this is no unsaved change.
    baselineRef.current = { ...baselineRef.current, draft: withTagChanged(baselineRef.current.draft, tagId, tagName) }
    setBaseline(baselineRef.current)
    setDraft((current) => withTagChanged(current, tagId, tagName))
    setListRevision((revision) => revision + 1)
  }

  // The Range goes along as it stands, so leaving its changes behind here loses nothing.
  const analyze = () => {
    dirtyRef.current = false
    navigate(labAnalysisAddress({ range: draft.combos, sourceId: baseline.id }))
  }

  // Unsaved changes stay behind: the copy is made from what was saved.
  const startDuplicate = () => (dirty ? setConfirmingDuplicate(true) : void duplicate())

  const setCombos = (change: (combos: Range) => Range) => setDraft((current) => ({ ...current, combos: change(current.combos) }))
  const paint = (handClass: HandClass, frequency: number) => setCombos((combos) => withHandClass(combos, handClass, frequency))
  const setTopPercent = (percent: number) => {
    const combos = topRange(percent)
    setLastTop({ percent, combos })
    setCombos(() => combos)
  }

  const busyReason = opening ? t('lab.ranges.opening') : busy ? t(`lab.ranges.${busy}`) : undefined
  const stats = rangeStats(draft.combos)
  const topPercent = lastTop && sameRange(lastTop.combos, draft.combos) ? lastTop.percent : stats.percent

  return (
    <div className="lab">
      <AppHeader current="lab" />
      <LabNav current="ranges" />
      <div className="lab__body">
        <aside className="lab__side">
          <Button variant="secondary" size="compact" onClick={startNew}>
            <Icon name="add" size={14} />
            {t('lab.ranges.new')}
          </Button>
          <label className="lab__search">
            <Icon name="search" size={14} />
            <input
              type="search"
              value={search}
              placeholder={t('lab.ranges.search')}
              aria-label={t('lab.ranges.search')}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <LibraryTags
            tags={labTags}
            chosen={chosenTags}
            onToggle={(tagId) =>
              setChosenTags((chosen) => (chosen.includes(tagId) ? chosen.filter((each) => each !== tagId) : [...chosen, tagId]))
            }
            count={(tag) => tag.ranges}
            confirmDelete={(tag) =>
              t(tag.ranges === 1 ? 'lab.tag.confirmDelete.one' : 'lab.tag.confirmDelete.other', {
                name: tag.name,
                count: tag.ranges,
              })
            }
            onCreate={(tagName) => createTag(tagName).then(() => undefined)}
            onRename={(tagId, tagName) => changeTag(tagId, tagName)}
            onDelete={(tagId) => changeTag(tagId, null)}
          />
          <RangeList
            list={list}
            openId={openId}
            onOpen={openRange}
            onClearFilters={
              filtered
                ? () => {
                    setChosenTags([])
                    setSearch('')
                  }
                : undefined
            }
          />
        </aside>
        <main className="lab__main">
          <div className="lab__titlebar">
            <input
              className="lab__name ro-serif"
              value={draft.name}
              maxLength={MAX_RANGE_NAME_LENGTH}
              placeholder={t('lab.ranges.namePlaceholder')}
              aria-label={t('lab.ranges.name')}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
            {dirty && <span className="lab__unsaved">{t('lab.ranges.unsaved')}</span>}
            <span className="lab__spacer" />
            {baseline.id !== null && (
              <>
                <Button variant="secondary" size="compact" disabledReason={busyReason} onClick={startDuplicate}>
                  <Icon name="copy" size={14} />
                  {t('lab.ranges.duplicate')}
                </Button>
                <Button
                  variant="secondary"
                  size="compact"
                  aria-label={t('lab.ranges.delete')}
                  title={t('lab.ranges.delete')}
                  disabledReason={busyReason}
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Icon name="delete" size={14} />
                </Button>
              </>
            )}
            <Button variant="secondary" size="compact" onClick={analyze}>
              {t('lab.ranges.analyze')}
            </Button>
            <Button variant="secondary" size="compact" onClick={() => setCombos(() => EMPTY_RANGE)}>
              {t('lab.ranges.clear')}
            </Button>
            <Button
              variant="primary"
              size="compact"
              disabledReason={busyReason}
              onClick={() => void save()}
            >
              {t('lab.ranges.save')}
            </Button>
          </div>
          <RangeTags
            tags={draft.tags}
            labTags={labTags}
            onAdd={(tag) =>
              setDraft((current) =>
                current.tags.some((each) => each.id === tag.id) ? current : { ...current, tags: sortedTags([...current.tags, tag]) },
              )
            }
            onRemove={(tagId) => setDraft((current) => ({ ...current, tags: current.tags.filter((tag) => tag.id !== tagId) }))}
            onCreate={createTag}
          />
          {failure && (
            <p className="lab__failure" role="alert">
              {failure}
            </p>
          )}
          {unopened && (
            <p className="lab__notice" role="status">
              {unopened === 'range-not-found' ? t('lab.ranges.unavailable') : t(`reason.${unopened}`)}
            </p>
          )}
          <div className="lab__work">
            <div className="lab__canvas">
              <Brush brush={brush} onChange={setBrush} />
              <RangeMatrix range={draft.combos} brush={brush} onPaint={paint} />
              <TopSlider percent={topPercent} onChange={setTopPercent} />
            </div>
            <div className="lab__readout">
              <Stats stats={stats} />
              <RangeText range={draft.combos} onImport={(combos) => setCombos(() => combos)} />
            </div>
          </div>
        </main>
      </div>
      {pendingLeave && (
        <RoomDialog
          title={t('lab.leave.title')}
          body={t('lab.leave.body')}
          onClose={() => setPendingLeave(null)}
          actions={
            <Button variant="destructive" onClick={discard}>
              {t('lab.leave.discard')}
            </Button>
          }
        />
      )}
      {confirmingDuplicate && (
        <RoomDialog
          title={t('lab.duplicate.title')}
          body={t('lab.duplicate.body')}
          onClose={() => setConfirmingDuplicate(false)}
          actions={
            <Button variant="primary" onClick={() => void duplicate()}>
              {t('lab.duplicate.confirm')}
            </Button>
          }
        />
      )}
      {confirmingDelete && (
        <RoomDialog
          title={t('lab.delete.title', { name: baseline.draft.name })}
          body={t('lab.delete.body')}
          onClose={() => setConfirmingDelete(false)}
          actions={
            <Button variant="destructive" onClick={() => void remove()}>
              {t('lab.ranges.delete')}
            </Button>
          }
        />
      )}
    </div>
  )
}

/** The Account's saved Ranges, each with its %, the open one marked. */
function RangeList({
  list,
  openId,
  onOpen,
  onClearFilters,
}: {
  list: RangeListLoad
  openId: string | null
  onOpen: (event: MouseEvent<HTMLAnchorElement>, id: string) => void
  /** Clears the search and the Tags; left out while the list is not filtered. */
  onClearFilters?: () => void
}) {
  const { t, formatNumber } = useI18n()
  return (
    <nav className="lab__ranges" aria-label={t('lab.ranges.saved')}>
      <span className="lab__label">{t('lab.ranges.saved')}</span>
      {list?.state === 'failed' && (
        <div className="lab__no-matches">
          <p className="lab__failure" role="alert">
            {t(`reason.${list.reason}`)}
          </p>
          {onClearFilters && (
            <Button variant="secondary" size="compact" onClick={onClearFilters}>
              {t('lab.ranges.clearFilters')}
            </Button>
          )}
        </div>
      )}
      {list?.state === 'loaded' &&
        list.ranges.length === 0 &&
        (onClearFilters ? (
          <div className="lab__no-matches">
            <p className="lab__none">{t('lab.ranges.noMatches')}</p>
            <Button variant="secondary" size="compact" onClick={onClearFilters}>
              {t('lab.ranges.clearFilters')}
            </Button>
          </div>
        ) : (
          <p className="lab__none">{t('lab.ranges.none')}</p>
        ))}
      {list?.state === 'loaded' && list.ranges.length > 0 && (
        <ul className="lab__list">
          {list.ranges.map((range) => (
            <li key={range.id}>
              <a
                href={labRangePath(range.id)}
                className="lab__list-item"
                aria-current={range.id === openId ? 'page' : undefined}
                onClick={(event) => onOpen(event, range.id)}
              >
                <span className="lab__list-name">{range.name}</span>
                <span className="lab__list-meta ro-mono">
                  {t('lab.stats.percent', { percent: formatNumber(range.percent, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
                </span>
                {range.tags.length > 0 && (
                  <span className="lab__list-tags">{range.tags.map((tag) => tag.name).join(' · ')}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

/**
 * The open Range's Tags, each with a button that takes it off, and a field
 * that puts one on: it suggests the Lab Tags not on the Range yet, and a name
 * that is none of them makes a new Lab Tag.
 */
function RangeTags({
  tags,
  labTags,
  onAdd,
  onRemove,
  onCreate,
}: {
  tags: RangeTag[]
  labTags: LabTag[]
  onAdd: (tag: RangeTag) => void
  onRemove: (tagId: string) => void
  /** Rejects with the server's reason when it refuses. */
  onCreate: (name: string) => Promise<RangeTag>
}) {
  const { t } = useI18n()
  const suggestionsId = useId()
  const [typed, setTyped] = useState('')
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const suggested = labTags.filter((tag) => !tags.some((each) => each.id === tag.id))

  // The field empties at once, so the next Tag can be typed while a new one is made.
  const add = async () => {
    const tagName = typed.trim()
    if (!tagName) return
    setTyped('')
    setFailure(null)
    const known = labTags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase())
    try {
      const { id, name } = known ?? (await onCreate(tagName))
      onAdd({ id, name })
    } catch (error) {
      setFailure(reasonOf(error))
      // Given back to fix, unless something else is being typed already.
      setTyped((current) => current || tagName)
    }
  }

  return (
    <div className="lab__tags" role="group" aria-label={t('lab.tags')}>
      {tags.map((tag) => (
        <Chip
          key={tag.id}
          variant="tag"
          removeLabel={t('lab.tags.remove', { name: tag.name })}
          onRemove={() => onRemove(tag.id)}
        >
          {tag.name}
        </Chip>
      ))}
      <input
        className="lab__tags-field"
        list={suggestionsId}
        value={typed}
        maxLength={MAX_TAG_NAME_LENGTH}
        placeholder={t('lab.tags.placeholder')}
        aria-label={t('lab.tags.add')}
        onChange={(event) => {
          setTyped(event.target.value)
          setFailure(null)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          void add()
        }}
      />
      <datalist id={suggestionsId}>
        {suggested.map((tag) => (
          <option key={tag.id} value={tag.name} />
        ))}
      </datalist>
      {failure && (
        <p className="lab__failure" role="alert">
          {t(`reason.${failure}`)}
        </p>
      )}
    </div>
  )
}

/**
 * The "top X %": sets the Range to the strongest X % of all Combos. Painted by
 * hand, the Range moves it to its own %, to the nearest step.
 */
function TopSlider({ percent, onChange }: { percent: number; onChange: (percent: number) => void }) {
  const { t, formatNumber } = useI18n()
  const value = Math.round(percent / TOP_STEP) * TOP_STEP
  return (
    <div className="lab__top" role="group" aria-label={t('lab.top')}>
      <span className="lab__label">{t('lab.top')}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={TOP_STEP}
        value={value}
        aria-label={t('lab.top.slider')}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output className="lab__top-value ro-mono">
        {t('lab.stats.percent', { percent: formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
      </output>
    </div>
  )
}
