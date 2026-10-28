import { useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { RoomDialog } from '../room/RoomDialog'
import { LibraryTags } from '../library/LibraryTags'
import { isPlainClick, navigate, setLeaveGuard, usePath } from '../routing'
import { Button } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { copyText } from '../ui/clipboard'
import { Icon } from '../ui/Icon'
import { SegmentedControl } from '../ui/SegmentedControl'
import { labRangeIdFromPath, labRangePath, labRangesPath } from './lab'
import {
  EMPTY_RANGE,
  formatRange,
  HAND_CLASS_KINDS,
  HAND_CLASS_BY_NAME,
  HAND_CLASSES,
  handClassFrequency,
  parseRange,
  rangeStats,
  sameRange,
  strokeFrequency,
  topRange,
  TOTAL_COMBOS,
  withHandClass,
  type HandClass,
  type Range,
  type RangeStats,
} from './range'
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

/** How long a Range's name may be, as the server allows it. */
const MAX_NAME_LENGTH = 60

/** How long a Tag's name may be, as the server allows it. */
const MAX_TAG_NAME_LENGTH = 40

const draftOf = (range: SavedRange): Draft => ({ name: range.name, tags: range.tags, combos: range.combos })

/** The draft with a Lab Tag renamed, or taken off when `name` is null, as the side column changed it. */
const withTagChanged = (draft: Draft, tagId: string, name: string | null): Draft => ({
  ...draft,
  tags: sortedTags(draft.tags.flatMap((tag) => (tag.id !== tagId ? [tag] : name === null ? [] : [{ ...tag, name }]))),
})

/** The brush's shortcuts; any other whole Frequency from 1 to 100 is typed in its field. */
const BRUSH_PRESETS = [100, 75, 50, 25] as const

/** How far apart, in px, a drag's path is sampled between two pointer events, so a fast one skips no cell. */
const STROKE_STEP = 6

/** The "top X %" slider's step, in %. */
const TOP_STEP = 0.5

/** How long the copy button says it copied. */
const COPIED_FOR_MS = 2000

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
    api<RangeSummary[]>('/lab/ranges', { token })
      .then((ranges) => !cancelled && setList({ state: 'loaded', ranges }))
      .catch((error: unknown) => !cancelled && setList({ state: 'failed', reason: reasonOf(error) }))
    return () => {
      cancelled = true
    }
  }, [token, listRevision])

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
    } else {
      await api<LabTag>(`/lab/tags/${encodeURIComponent(tagId)}`, { token, method: 'PATCH', body: { name: tagName } })
    }
    // The server changed the saved Range as well, so this is no unsaved change.
    baselineRef.current = { ...baselineRef.current, draft: withTagChanged(baselineRef.current.draft, tagId, tagName) }
    setBaseline(baselineRef.current)
    setDraft((current) => withTagChanged(current, tagId, tagName))
    setListRevision((revision) => revision + 1)
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
      <div className="lab__body">
        <aside className="lab__side">
          <Button variant="secondary" size="compact" onClick={startNew}>
            <Icon name="add" size={14} />
            {t('lab.ranges.new')}
          </Button>
          <LibraryTags
            tags={labTags}
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
          <RangeList list={list} openId={openId} onOpen={openRange} />
        </aside>
        <main className="lab__main">
          <div className="lab__titlebar">
            <input
              className="lab__name ro-serif"
              value={draft.name}
              maxLength={MAX_NAME_LENGTH}
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
}: {
  list: RangeListLoad
  openId: string | null
  onOpen: (event: MouseEvent<HTMLAnchorElement>, id: string) => void
}) {
  const { t, formatNumber } = useI18n()
  return (
    <nav className="lab__ranges" aria-label={t('lab.ranges.saved')}>
      <span className="lab__label">{t('lab.ranges.saved')}</span>
      {list?.state === 'failed' && (
        <p className="lab__failure" role="alert">
          {t(`reason.${list.reason}`)}
        </p>
      )}
      {list?.state === 'loaded' && list.ranges.length === 0 && <p className="lab__none">{t('lab.ranges.none')}</p>}
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

/** The brush's Frequency: a shortcut, or a whole number from 1 to 100 typed in its field. */
function Brush({ brush, onChange }: { brush: number; onChange: (frequency: number) => void }) {
  const { t } = useI18n()
  /** The field while it is being typed in, which may not be a Frequency yet; null shows the brush's. */
  const [typed, setTyped] = useState<string | null>(null)
  const custom = !BRUSH_PRESETS.some((preset) => preset === brush)
  return (
    <div className="lab__brush" role="group" aria-label={t('lab.brush')}>
      <span className="lab__label">{t('lab.brush')}</span>
      <SegmentedControl
        label={t('lab.brush')}
        options={BRUSH_PRESETS.map((preset) => ({ value: String(preset), label: t('lab.brush.preset', { percent: preset }) }))}
        value={String(brush)}
        onChange={(value) => {
          setTyped(null)
          onChange(Number(value))
        }}
      />
      <label className="lab__brush-field" data-active={custom || undefined}>
        <input
          className="ro-mono"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          value={typed ?? String(brush)}
          aria-label={t('lab.brush.frequency')}
          onChange={(event) => {
            const value = event.target.value
            setTyped(value)
            if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100) onChange(Number(value))
          }}
          onBlur={() => setTyped(null)}
        />
        <span aria-hidden="true">%</span>
      </label>
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

/**
 * The 13×13 matrix, each cell labelled with its Hand Class and filled from the
 * left by its Frequency. Pressing a cell starts a stroke that paints, or takes
 * out, every cell the pointer then crosses until it is released anywhere.
 */
function RangeMatrix({
  range,
  brush,
  onPaint,
}: {
  range: Range
  brush: number
  onPaint: (handClass: HandClass, frequency: number) => void
}) {
  const { t } = useI18n()
  /** The stroke under way: the Frequency its first cell decided, where the pointer last was and the Hand Class last painted. */
  const stroke = useRef<{ frequency: number; x: number; y: number; lastHandClass: string } | null>(null)
  // Read by the window's listeners, which outlive this render.
  const onPaintRef = useRef(onPaint)
  useEffect(() => {
    onPaintRef.current = onPaint
  })

  // Moves are followed on the whole window, so a pointer that leaves the
  // matrix and comes back is walked from where it really was.
  useEffect(() => {
    // Pointer events come further apart than a cell on a fast drag: walk the path between them.
    const move = (event: globalThis.PointerEvent) => {
      const current = stroke.current
      if (!current) return
      const { x, y } = current
      const steps = Math.ceil(Math.hypot(event.clientX - x, event.clientY - y) / STROKE_STEP)
      for (let step = 1; step <= steps; step++) {
        const point = document.elementFromPoint(x + ((event.clientX - x) * step) / steps, y + ((event.clientY - y) * step) / steps)
        const name = point?.closest<HTMLElement>('[data-hand-class]')?.dataset.handClass
        const handClass = name !== undefined ? HAND_CLASS_BY_NAME.get(name) : undefined
        if (handClass && handClass.name !== current.lastHandClass) {
          current.lastHandClass = handClass.name
          onPaintRef.current(handClass, current.frequency)
        }
      }
      current.x = event.clientX
      current.y = event.clientY
    }
    const end = () => (stroke.current = null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  /** What a stroke starting on this Hand Class sets every cell it crosses to. */
  const frequencyFrom = (handClass: HandClass) => strokeFrequency(range, handClass, brush)

  const start = (event: PointerEvent, handClass: HandClass) => {
    if (event.button !== 0) return
    const frequency = frequencyFrom(handClass)
    stroke.current = { frequency, x: event.clientX, y: event.clientY, lastHandClass: handClass.name }
    onPaint(handClass, frequency)
  }

  return (
    <div className="lab__matrix" role="group" aria-label={t('lab.matrix')}>
      {HAND_CLASSES.map((handClass) => {
        const frequency = handClassFrequency(range, handClass)
        const { mixed } = frequency
        // A mixed cell holds some Combos, however low its average rounds.
        const value = mixed ? Math.max(1, Math.round(frequency.value)) : frequency.value
        return (
          <button
            key={handClass.name}
            type="button"
            className="lab__cell ro-mono"
            data-kind={handClass.kind}
            data-hand-class={handClass.name}
            data-in={value > 0 || undefined}
            data-full={(value === 100 && !mixed) || undefined}
            data-mixed={mixed || undefined}
            aria-pressed={value > 0}
            aria-label={handClass.name}
            title={t(mixed ? 'lab.cell.mixedTitle' : 'lab.cell.title', {
              handClass: handClass.name,
              combos: handClass.combos.length,
              frequency: value,
            })}
            onPointerDown={(event) => start(event, handClass)}
            // A pointer paints on press; a click from the keyboard (no pointer, detail 0) paints here.
            onClick={(event) => event.detail === 0 && onPaint(handClass, frequencyFrom(handClass))}
          >
            <span className="lab__cell-fill" style={{ width: `${value}%` }} />
            <span className="lab__cell-label">{handClass.name}</span>
            {(mixed || (value > 0 && value < 100)) && (
              <span className="lab__cell-frequency">
                {/* A mixed cell's number is its Combos' average. */}
                {mixed && '≈'}
                {value}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** The Range's headline numbers and its split between pairs, suited and offsuit. */
function Stats({ stats }: { stats: RangeStats }) {
  const { t, formatNumber } = useI18n()
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <section className="lab__stats" aria-label={t('lab.stats')}>
      <div className="lab__headline">
        <p className="lab__figure">
          <span className="lab__figure-value ro-mono">{t('lab.stats.percent', { percent: oneDecimal(stats.percent) })}</span>
          <span className="lab__label"> {t('lab.stats.percentOf')}</span>
        </p>
        <p className="lab__figure">
          <span className="lab__figure-value ro-mono">{oneDecimal(stats.combos)}</span>
          <span className="lab__label"> {t('lab.stats.combosOf', { total: TOTAL_COMBOS })}</span>
        </p>
      </div>
      <dl className="lab__breakdown">
        {HAND_CLASS_KINDS.map((kind) => {
          const { combos, of } = stats.byKind[kind]
          return (
            <div key={kind} className="lab__breakdown-row">
              <dt>{t(`lab.stats.kind.${kind}`)} </dt>
              <dd className="ro-mono">
                {oneDecimal(combos)} <span className="lab__muted">/ {of}</span>{' '}
              </dd>
              <dd className="lab__muted ro-mono">
                {stats.combos > 0 ? t('lab.stats.shareOfRange', { percent: oneDecimal((combos / stats.combos) * 100) }) : '—'}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

/**
 * The Range as text: a box to paste one from another tool and import it over
 * the matrix, refused whole at the first piece not understood, and the Range
 * in PioSolver / GTO Wizard notation, to copy.
 */
function RangeText({ range, onImport }: { range: Range; onImport: (range: Range) => void }) {
  const { t } = useI18n()
  const [pasted, setPasted] = useState('')
  /** The piece that refused the last import, until the paste is edited. */
  const [unknown, setUnknown] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(copiedTimer.current), [])
  const exported = formatRange(range)

  const importPasted = () => {
    const parsed = parseRange(pasted)
    if ('unknown' in parsed) {
      setUnknown(parsed.unknown)
      return
    }
    onImport(parsed.range)
    setPasted('')
  }

  const copy = () =>
    void copyText(exported).then((done) => {
      // If copying is impossible the text stays on screen to copy by hand.
      if (!done) return
      setCopied(true)
      clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS)
    })

  return (
    <section className="lab__text" aria-label={t('lab.text')}>
      <span className="lab__label">{t('lab.text')}</span>
      <textarea
        className="lab__text-field ro-mono"
        rows={3}
        spellCheck={false}
        value={pasted}
        placeholder={t('lab.text.placeholder')}
        aria-label={t('lab.text.paste')}
        onChange={(event) => {
          setPasted(event.target.value)
          setUnknown(null)
        }}
      />
      {unknown !== null && (
        <p className="lab__failure" role="alert">
          {t('lab.text.unknown', { piece: unknown })}
        </p>
      )}
      <div className="lab__text-actions">
        <Button
          variant="secondary"
          size="compact"
          aria-label={t('lab.text.import')}
          disabledReason={pasted.trim() ? undefined : t('lab.text.nothingToImport')}
          onClick={importPasted}
        >
          <Icon name="import" size={14} />
          {t('lab.text.import')}
        </Button>
      </div>
      <textarea
        className="lab__text-field lab__text-export ro-mono"
        rows={3}
        readOnly
        spellCheck={false}
        value={exported}
        placeholder="—"
        aria-label={t('lab.text')}
      />
      <div className="lab__text-actions">
        <Button
          variant="secondary"
          size="compact"
          aria-label={t(copied ? 'lab.text.copied' : 'lab.text.copy')}
          disabledReason={exported ? undefined : t('lab.text.nothingToCopy')}
          onClick={copy}
        >
          <Icon name={copied ? 'success' : 'copy'} size={14} />
          {t(copied ? 'lab.text.copied' : 'lab.text.copy')}
        </Button>
      </div>
    </section>
  )
}
